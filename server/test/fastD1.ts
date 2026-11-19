import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type { D1Database } from '@cloudflare/workers-types';

// A D1 database for tests, in this process, on node:sqlite. A call through
// getPlatformProxy is an HTTP round trip to workerd (about 5 ms); here it is a
// function call. It does what the server code uses of D1, the way D1 does it:
// foreign keys on, a batch is one transaction, true and false are stored as 1
// and 0, undefined is refused, a blob comes back as an array of numbers, and
// errors start with "D1_". It does not count rows read: meta.rows_read is NaN,
// so a test that counts rows must run on the real engine (the "d1" project).

type SqlValue = null | number | bigint | string | Uint8Array;
type Row = Record<string, unknown>;

function toSql(value: unknown): SqlValue {
  if (value === undefined) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
  if (value === null) return null;
  if (typeof value === 'boolean') return value ? 1n : 0n;
  // node:sqlite binds every number as REAL; D1 binds a whole number as INTEGER.
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
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
  private readonly lastChange: StatementSync;

  constructor() {
    this.sql.exec('PRAGMA foreign_keys = ON');
    this.lastChange = this.sql.prepare('SELECT changes() AS changes, last_insert_rowid() AS id');
  }

  private statement(text: string): StatementSync {
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
      let results: Row[] = [];
      if (statement.columns().length > 0) results = (statement.all(...params) as Row[]).map(fromSql);
      else statement.run(...params);
      const last = this.lastChange.get() as { changes: number; id: number };
      return {
        success: true as const,
        results,
        meta: {
          changes: last.changes,
          last_row_id: last.id,
          rows_read: Number.NaN,
          rows_written: last.changes,
          changed_db: last.changes > 0,
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
        engine.sql.exec(text);
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
