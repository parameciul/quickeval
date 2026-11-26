import { RobotApiError } from './api.ts';
import { makeBarem } from './baremTask.ts';
import { log } from './log.ts';
import { openSession, type RunOptions, type RunReport } from './session.ts';
import { gradeSubmission, makeExerciseList } from './tasks.ts';

// One run of the Quick Try robot (the try lane): its own lease, and up to
// maxParallel slots ("Încercări rapide deodată") that each take the next piece
// of Quick Try work no other slot has: a barem, an exercise list, or a paper.
// A try's own steps come in order by themselves: its list waits for its barem
// (and the visitor's check), its paper for its list. A Quick Try has no print,
// no CES variant and no class analysis, so the run reads none of them.

// How long a free slot waits before it looks for new work again.
export const IDLE_POLL_MS = 20_000;

export async function runTryRobot(options: RunOptions): Promise<RunReport> {
  const { api, runId } = options;
  const lease = await api.lease(runId);
  if (!lease.granted) {
    log('another run holds the lease', { run: runId });
    return { summary: null, exitCode: 0 };
  }
  const session = openSession(options, lease.maxParallel);
  const { ctx, canTake, stopTaking, record } = session;

  // The tests a slot works on now. Only one try run works at a time (its
  // lease), so this list in memory keeps two slots off one barem or list; a
  // paper is claimed in SQL.
  const busy = new Set<number>();
  // A list is tried once per run, and a barem twice at most: the teachers' run
  // tries a `retry` barem again a round later, but a free slot here would take
  // it again at once, use up its attempts in a row and stop the run at an
  // error. Its last attempt is left to a later run.
  const baremsTried = new Set<number>();
  const baremsRetried = new Set<number>();
  const listsTried = new Set<number>();

  // The next task no other slot has, or null when none is left. The pick and
  // the mark in `busy` happen with no wait between them.
  const nextTask = async (): Promise<(() => Promise<void>) | null> => {
    const tasks = await api.tasks();
    const barem = (tasks.barems ?? []).find((id) => !busy.has(id) && !baremsTried.has(id));
    if (barem !== undefined) {
      busy.add(barem);
      return async () => {
        try {
          const end = await makeBarem(ctx, barem, 'class');
          if (end !== 'retry' || baremsRetried.has(barem)) baremsTried.add(barem);
          else baremsRetried.add(barem);
          record(end, 'barems');
        } finally {
          busy.delete(barem);
        }
      };
    }
    const list = tasks.exerciseLists.find((id) => !busy.has(id) && !listsTried.has(id));
    if (list !== undefined) {
      busy.add(list);
      listsTried.add(list);
      return async () => {
        try {
          record(await makeExerciseList(ctx, list, 'class'), 'exerciseLists');
        } finally {
          busy.delete(list);
        }
      };
    }
    const claim = await api.claim(runId);
    return claim ? async () => record(await gradeSubmission(ctx, claim), 'graded') : null;
  };

  // A slot that finds no work waits and looks again while another slot works:
  // a try that comes during the run starts at once on a free slot. The run
  // ends when a look finds no work and no slot works.
  const idlePollMs = options.idlePollMs ?? IDLE_POLL_MS;
  let working = 0;
  const slot = async () => {
    try {
      while (canTake()) {
        const task = await nextTask();
        if (!task) {
          if (working === 0) return;
          await new Promise((resolve) => setTimeout(resolve, idlePollMs));
          continue;
        }
        working += 1;
        try {
          await task();
        } finally {
          working -= 1;
        }
      }
    } catch (err) {
      // The other slots take no new work either.
      stopTaking(err instanceof RobotApiError && err.code === 'lease_lost' ? 'lease_lost' : 'error');
      throw err;
    }
  };

  let failure = false;
  // Every slot ends before the run does: no task runs on after the release.
  const slots = await Promise.allSettled(Array.from({ length: Math.max(1, lease.maxParallel) }, slot));
  const thrown = slots.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (thrown && !(thrown.reason instanceof RobotApiError && thrown.reason.code === 'lease_lost')) {
    failure = true;
    log('run failed', { run: runId, error: thrown.reason instanceof RobotApiError ? thrown.reason.code : 'unknown' });
  }
  return session.finish(failure);
}
