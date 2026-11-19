import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script without declarations
import { overBudget, summarize } from './testTimes.mjs';

const file = (name: string, durations: number[]) => ({
  name,
  startTime: 0,
  endTime: 0,
  assertionResults: durations.map((duration, i) => ({ title: `t${i}`, duration })),
});

describe('summarize', () => {
  it('groups the time by area, slowest area first', () => {
    const report = {
      testResults: [file('/root/src/admin/a.test.tsx', [1000, 500]), file('/root/server/b.test.ts', [2000])],
    };
    const { areas } = summarize(report, '/root');
    expect(areas).toEqual([
      { area: 'server', files: 1, tests: 1, seconds: 2 },
      { area: 'src/admin', files: 1, tests: 2, seconds: 1.5 },
    ]);
  });

  it('turns Windows paths into paths from the root', () => {
    const report = { testResults: [file('D:\\x\\server\\b.test.ts', [1000])] };
    const { files } = summarize(report, 'D:/x');
    expect(files[0].file).toBe('server/b.test.ts');
  });

  it("counts a file's own time, setup included, when the report has it", () => {
    const report = { testResults: [{ ...file('/root/server/d.test.ts', [500]), startTime: 1000, endTime: 4000 }] };
    expect(summarize(report, '/root').files[0]).toEqual({ file: 'server/d.test.ts', tests: 1, seconds: 3 });
  });

  it('lists the slowest tests', () => {
    const report = { testResults: [file('/root/server/b.test.ts', [300, 900])] };
    const { tests } = summarize(report, '/root');
    expect(tests[0]).toEqual({ name: 'server/b.test.ts > t1', seconds: 0.9 });
  });
});

describe('overBudget', () => {
  it('names only the files over the budget', () => {
    const files = [
      { file: 'server/b.test.ts', tests: 1, seconds: 2 },
      { file: 'server/c.test.ts', tests: 1, seconds: 1 },
    ];
    expect(overBudget(files, 1.6)).toEqual([{ file: 'server/b.test.ts', tests: 1, seconds: 2 }]);
  });

  it('returns nothing when every file is within the budget', () => {
    expect(overBudget([{ file: 'a', tests: 1, seconds: 1 }], 15)).toEqual([]);
  });
});
