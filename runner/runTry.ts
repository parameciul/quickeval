import { RobotApiError } from './api.ts';
import { makeBarem } from './baremTask.ts';
import { log } from './log.ts';
import { openSession, type RunOptions, type RunReport } from './session.ts';
import { gradeSubmission, makeExerciseList } from './tasks.ts';

// One run of the Quick Try robot (the try lane): its own lease, and up to
// maxParallel tasks at once ("Încercări rapide deodată"), each the next piece
// of Quick Try work no other task has: a barem, an exercise list, or a paper.
// A try's own steps come in order by themselves: its list waits for its barem
// (and the visitor's check), its paper for its list. A Quick Try has no print,
// no CES variant and no class analysis, so the run reads none of them.

// How long the run waits, while tasks work, before it looks for new work again.
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

  // The tests a task works on now. Only one try run works at a time (its
  // lease), so this list in memory keeps two tasks off one barem or list; a
  // paper is claimed in SQL.
  const busy = new Set<number>();
  // A list is tried once per run, and a barem twice at most: the teachers' run
  // tries a `retry` barem again a round later, but the next look here would take
  // it again at once, use up its attempts in a row and stop the run at an
  // error. Its last attempt is left to a later run.
  const baremsTried = new Set<number>();
  const baremsRetried = new Set<number>();
  const listsTried = new Set<number>();

  // The next task no other task has, or null when none is left. The pick and
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

  // One loop looks for work, one look at a time whatever the setting (each
  // look reads the task list from D1). A task it finds starts at once while
  // fewer than maxParallel run, and the loop looks again. With nothing found
  // and tasks at work, it waits IDLE_POLL_MS or for a task to end, so a try
  // that comes during the run starts soon. With nothing found and nothing at
  // work, the run ends.
  const idlePollMs = options.idlePollMs ?? IDLE_POLL_MS;
  const places = Math.max(1, lease.maxParallel);
  const running = new Set<Promise<void>>();
  let thrown: unknown = null;
  const leaseLost = (err: unknown) => err instanceof RobotApiError && err.code === 'lease_lost';
  const fail = (err: unknown) => {
    // No new work after this; the tasks at work finish.
    stopTaking(leaseLost(err) ? 'lease_lost' : 'error');
    thrown ??= err;
  };
  // Tasks ended so far: a task that ends during a look may have made new work
  // (a list makes its paper gradable) that the look read too early.
  let ended = 0;
  const start = (task: () => Promise<void>) => {
    const work: Promise<void> = task()
      .catch(fail)
      .finally(() => {
        running.delete(work);
        ended += 1;
      });
    running.add(work);
  };
  const taskEnds = () => Promise.race(running);

  while (canTake()) {
    if (running.size >= places) {
      await taskEnds();
      continue;
    }
    const endedBefore = ended;
    let task: (() => Promise<void>) | null;
    try {
      task = await nextTask();
    } catch (err) {
      // A look that fails while tasks work is tried again at the next look:
      // their own requests stop the run when the API is really down.
      if (leaseLost(err) || running.size === 0) {
        fail(err);
        break;
      }
      log('look failed', { run: runId, error: err instanceof RobotApiError ? err.code : 'unknown' });
      task = null;
    }
    if (task) {
      // A stop that came during the look: the work found waits for a later
      // run (a claimed paper goes back to the queue at the next check).
      if (!canTake()) break;
      start(task);
      continue;
    }
    if (running.size === 0) {
      // Nothing at work: the run ends, unless a task ended during this look.
      if (ended !== endedBefore) continue;
      break;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([new Promise((resolve) => (timer = setTimeout(resolve, idlePollMs))), taskEnds()]);
    clearTimeout(timer);
  }
  // Every task ends before the run does: no task runs on after the release.
  while (running.size > 0) await taskEnds();

  const failure = thrown !== null && !leaseLost(thrown);
  if (failure) log('run failed', { run: runId, error: thrown instanceof RobotApiError ? thrown.code : 'unknown' });
  return session.finish(failure);
}
