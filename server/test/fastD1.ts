import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type { D1Database } from '@cloudflare/workers-types';

// A D1 database for tests, in this process, on node:sqlite. A call through
// getPlatformProxy is an HTTP round trip to workerd (about 5 ms); here it is a
// function call. It does what the server code uses of D1, the way D1 does it:
// foreign keys on, a batch is one transaction, numbers and true and false are
// bound as REAL, undefined is refused, a blob comes back as an array of numbers, and
// errors start with "D1_", meta.changes counts the rows triggers change too.
// It does not count rows read: meta.rows_read is NaN, so a test that counts
// rows must run on the real engine (the "d1" project). Known differences no
// server code meets: one prepare() runs one statement only (D1 runs every
// statement of the text), raw() keeps one of two columns with the same name,
// a whole number above 2^53 is refused, and exec() reports a count of 1.

type SqlValue = null | number | bigint | string | Uint8Array;
type Row = Record<string, unknown>;

function toSql(value: unknown): SqlValue {
  if (value === undefined) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
  if (value === null) return null;
  if (typeof value === 'bigint') throw new Error("D1_TYPE_ERROR: Type 'bigint' not supported for value");
  // D1 binds every number, and true and false, as REAL, as node:sqlite does
  // (d1Parity.test.ts checks it on both engines).
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return value as SqlValue;
}

function fromSql(row: Row): Row {
  for (const key of Object.keys(row)) {
    const value = row[key];
    if (value instanceof Uint8Array) row[key] = Array.from(value);
  }
  return row;
}

function d1Error(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  return new Error(message.startsWith('D1_') ? message : `D1_ERROR: ${message}`, { cause: err });
}

class Engine {
  readonly sql = new DatabaseSync(':memory:');
  private readonly statements = new Map<string, StatementSync>();
  private readonly totalChanges: StatementSync;
  private readonly lastId: StatementSync;

  constructor() {
    this.sql.exec('PRAGMA foreign_keys = ON');
    this.totalChanges = this.sql.prepare('SELECT total_changes() AS n');
    this.lastId = this.sql.prepare('SELECT last_insert_rowid() AS id');
  }

  // Run DDL through here, so a cached SELECT * sees the new columns.
  exec(text: string): void {
    this.statements.clear();
    this.sql.exec(text);
  }

  private statement(text: string): StatementSync {
    if (/^\s*(CREATE|ALTER|DROP)\b/i.test(text)) this.statements.clear();
    let statement = this.statements.get(text);
    if (!statement) {
      statement = this.sql.prepare(text);
      this.statements.set(text, statement);
    }
    return statement;
  }

  execute(text: string, params: SqlValue[]) {
    try {
      const statement = this.statement(text);
      // D1 counts the rows a statement's triggers change too: total_changes()
      // does, changes() does not, and changes() keeps its value after a SELECT.
      const before = (this.totalChanges.get() as { n: number }).n;
      let results: Row[] = [];
      if (statement.columns().length > 0) results = (statement.all(...params) as Row[]).map(fromSql);
      else statement.run(...params);
      const changes = (this.totalChanges.get() as { n: number }).n - before;
      const id = (this.lastId.get() as { id: number }).id;
      return {
        success: true as const,
        results,
        meta: {
          changes,
          last_row_id: id,
          rows_read: Number.NaN,
          rows_written: changes,
          changed_db: changes > 0,
          duration: 0,
          size_after: 0,
        },
      };
    } catch (err) {
      throw d1Error(err);
    }
  }
}

class Statement {
  private readonly engine: Engine;
  readonly text: string;
  readonly params: SqlValue[];

  constructor(engine: Engine, text: string, params: SqlValue[] = []) {
    this.engine = engine;
    this.text = text;
    this.params = params;
  }

  bind(...values: unknown[]): Statement {
    return new Statement(this.engine, this.text, values.map(toSql));
  }

  async first(column?: string): Promise<unknown> {
    const row = this.engine.execute(this.text, this.params).results[0] ?? null;
    if (column === undefined || row === null) return row;
    if (!(column in row)) throw new Error(`D1_COLUMN_NOTFOUND: Column not found (${column})`);
    return row[column];
  }

  async all() {
    return this.engine.execute(this.text, this.params);
  }

  async run() {
    return this.engine.execute(this.text, this.params);
  }

  async raw(options: { columnNames?: boolean } = {}): Promise<unknown[][]> {
    const statement = this.engine.sql.prepare(this.text);
    const rows = this.engine.execute(this.text, this.params).results.map((row) => Object.values(row));
    if (!options.columnNames) return rows;
    return [statement.columns().map((column) => column.name), ...rows];
  }
}

export function fastD1(): D1Database {
  const engine = new Engine();
  const db = {
    prepare: (text: string) => new Statement(engine, text),
    async batch(statements: Statement[]) {
      if (statements.length === 0) throw new Error('D1_ERROR: No SQL statements detected.');
      engine.sql.exec('BEGIN');
      try {
        const results = statements.map((statement) => engine.execute(statement.text, statement.params));
        engine.sql.exec('COMMIT');
        return results;
      } catch (err) {
        engine.sql.exec('ROLLBACK');
        throw err;
      }
    },
    async exec(text: string) {
      try {
        engine.exec(text);
      } catch (err) {
        throw d1Error(err);
      }
      return { count: 1, duration: 0 };
    },
    async dump(): Promise<ArrayBuffer> {
      throw new Error('fastD1: dump() is not supported');
    },
    withSession() {
      return db;
    },
  };
  return db as unknown as D1Database;
}
