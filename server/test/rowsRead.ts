import type { D1Database } from '@cloudflare/workers-types';

type Statement = ReturnType<D1Database['prepare']>;
const RAW = Symbol('raw statement');

// A database that adds up the rows each statement read: what D1's free plan
// counts (5 million a day). `first()` is read through `all()` for its meta; a
// batch adds the rows of each of its statements.
export function countingRows(db: D1Database): { db: D1Database; rows: () => number } {
  let rows = 0;
  const wrap = (statement: Statement): Statement =>
    ({
      [RAW]: statement,
      bind: (...values: unknown[]) => wrap(statement.bind(...values)),
      all: async () => {
        const result = await statement.all();
        rows += result.meta.rows_read;
        return result;
      },
      first: async () => {
        const result = await statement.all();
        rows += result.meta.rows_read;
        return result.results[0] ?? null;
      },
    }) as unknown as Statement;
  const batch = async (statements: Statement[]) => {
    const results = await db.batch(statements.map((statement) => (statement as unknown as { [RAW]: Statement })[RAW]));
    for (const result of results) rows += result.meta.rows_read;
    return results;
  };
  return { db: { prepare: (sql: string) => wrap(db.prepare(sql)), batch } as unknown as D1Database, rows: () => rows };
}
