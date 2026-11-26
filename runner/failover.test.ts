import { describe, expect, it } from 'vitest';
import type { ClaudeOutcome, ClaudeRunner, ClaudeTask } from './claude.ts';
import { failoverRunner } from './failover.ts';
import { answer, problem } from './test/scriptedClaude.ts';

// The Quick Try robot asks the main Claude account first and changes to the
// backup account (a second subscription) when the main one is at its limit or
// refuses its token; it then stays on the backup to the end of the run.

const TASK: ClaudeTask = { mode: 'grade', cwd: '/tmp/qe/task', jsonSchema: {} };

// A runner that gives its outcomes in order and counts its calls.
function counted(...outcomes: ClaudeOutcome[]): { run: ClaudeRunner; calls: () => number } {
  let calls = 0;
  return {
    run: async () => {
      calls += 1;
      const next = outcomes.shift();
      if (!next) throw new Error('no more outcomes');
      return next;
    },
    calls: () => calls,
  };
}

describe('failoverRunner', () => {
  it('uses the main runner while it works', async () => {
    const main = counted(answer('one'), answer('two'));
    const backup = counted();
    const run = failoverRunner(main.run, backup.run);
    expect(await run(TASK)).toEqual(answer('one'));
    expect(await run(TASK)).toEqual(answer('two'));
    expect(backup.calls()).toBe(0);
  });

  it('does the same task again on the backup after a main usage limit', async () => {
    const main = counted(problem('usage_limit'));
    const backup = counted(answer('done'));
    const seen: ClaudeTask[] = [];
    const run = failoverRunner(main.run, async (task) => {
      seen.push(task);
      return backup.run(task);
    });
    expect(await run(TASK)).toEqual({ ...answer('done'), backup: true });
    expect(main.calls()).toBe(1);
    expect(seen).toEqual([TASK]);
  });

  it('changes to the backup after a refused main login', async () => {
    const main = counted(problem('not_logged_in'));
    const backup = counted(answer('done'));
    expect(await failoverRunner(main.run, backup.run)(TASK)).toEqual({ ...answer('done'), backup: true });
  });

  it('keeps the main account for any other problem', async () => {
    const main = counted(problem('timeout'));
    const backup = counted();
    expect(await failoverRunner(main.run, backup.run)(TASK)).toEqual(problem('timeout'));
    expect(backup.calls()).toBe(0);
  });

  it('stays on the backup for the rest of the run', async () => {
    const main = counted(problem('usage_limit'));
    const backup = counted(answer('one'), answer('two'), problem('timeout'));
    const run = failoverRunner(main.run, backup.run);
    await run(TASK);
    expect(await run(TASK)).toEqual({ ...answer('two'), backup: true });
    // A backup's failure stays the backup's: no flag, and no main call.
    expect(await run(TASK)).toEqual(problem('timeout'));
    expect(main.calls()).toBe(1);
  });

  it('changes to the backup once when two tasks reach the limit at the same time', async () => {
    const main = counted(problem('usage_limit'), problem('usage_limit'));
    const backup = counted(answer('one'), answer('two'));
    const run = failoverRunner(main.run, backup.run);
    const both = await Promise.all([run(TASK), run(TASK)]);
    expect(both).toEqual([
      { ...answer('one'), backup: true },
      { ...answer('two'), backup: true },
    ]);
    expect(await run(TASK).catch(() => 'no call')).toBe('no call');
    expect(main.calls()).toBe(2);
  });

  it('a new runner starts on the main token', async () => {
    const main = counted(problem('usage_limit'), answer('main again'));
    const backup = counted(answer('backup'));
    await failoverRunner(main.run, backup.run)(TASK);
    expect(await failoverRunner(main.run, backup.run)(TASK)).toEqual(answer('main again'));
  });

  it('gives the main outcome when there is no backup', async () => {
    const main = counted(problem('usage_limit'));
    expect(await failoverRunner(main.run, null)(TASK)).toEqual(problem('usage_limit'));
  });

  it("gives the backup's usage limit when both are at their limit", async () => {
    const main = counted(problem('usage_limit'));
    const backup = counted(problem('usage_limit'));
    expect(await failoverRunner(main.run, backup.run)(TASK)).toEqual(problem('usage_limit'));
  });

  it("gives the backup's refused login as it is", async () => {
    const main = counted(problem('usage_limit'));
    const backup = counted(problem('not_logged_in'));
    expect(await failoverRunner(main.run, backup.run)(TASK)).toEqual(problem('not_logged_in'));
  });
});
