import type { D1Database } from '@cloudflare/workers-types';

// A database that adds up the rows each statement read: what D1's free plan
// counts (5 million a day). `first()` is read through `all()` for its meta.
export function countingRows(db: D1Database): { db: D1Database; rows: () => number } {
  let rows = 0;
  const wrap = (statement: ReturnType<D1Database['prepare']>): ReturnType<D1Database['prepare']> =>
    ({
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
    }) as unknown as ReturnType<D1Database['prepare']>;
  return { db: { prepare: (sql: string) => wrap(db.prepare(sql)) } as unknown as D1Database, rows: () => rows };
}
