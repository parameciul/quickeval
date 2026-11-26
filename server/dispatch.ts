import type { RobotStart } from '../shared/api.ts';
import type { RobotLane } from '../shared/runner.ts';
import { claimRobotRestart, laneHasWork, type RestartScope } from './db/runner.ts';
import { saveRobotStart } from './db/settings.ts';
import type { AppOptions, Env } from './env.ts';

// The GitHub event that starts each lane's robot job (.github/workflows/evaluate.yml).
const EVENT: Record<RobotLane, string> = { main: 'evaluate-now', try: 'evaluate-try' };

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

// "Evaluate now" (spec §12.6): asks GitHub to start the robot at once with a
// repository_dispatch event. True when GitHub took the request. False without
// the settings, or when GitHub refuses or does not answer in 5 seconds: then
// the robot does not start, because its GitHub schedule does not fire
// (docs/deploy.md). Never throws. When GitHub refuses or does not answer, it
// logs one line for `wrangler pages deployment tail`: the HTTP status or the
// error's name only. An error's message can hold the URL, and the URL holds
// the repository.
export async function dispatchRobot(env: Env, lane: RobotLane = 'main', fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const repo = env.GITHUB_REPO?.trim() ?? '';
  const token = env.GITHUB_DISPATCH_TOKEN?.trim() ?? '';
  if (!REPO.test(repo) || token === '') return false;
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${repo}/dispatches`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // GitHub refuses requests without a User-Agent.
        'User-Agent': 'MQGrader',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ event_type: EVENT[lane] }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 204) return true;
    console.warn(`GitHub refused the robot dispatch: HTTP ${res.status}`);
    return false;
  } catch (err) {
    console.warn(`GitHub robot dispatch failed: ${err instanceof Error ? err.name : 'unknown error'}`);
    return false;
  }
}

// What the teacher is told when grading (re)starts: the robot was asked to
// start at once, or it could not be started. The answer is also saved for the
// test page, because a scheduled start happens in any teacher's or student's
// request. The time is taken before GitHub's answer: a run that checks in
// meanwhile hides the failure. It starts the lane of `options.robotLane`: the
// Quick Try routes set it to try, every other path is the teachers' robot.
export function robotStarter(options: AppOptions): (env: Env) => Promise<RobotStart> {
  const dispatch = options.dispatchRobot ?? ((env: Env, lane: RobotLane) => dispatchRobot(env, lane));
  const lane = options.robotLane ?? 'main';
  return async (env) => {
    const askedAt = new Date().toISOString();
    const taken = await dispatch(env, lane);
    await saveRobotStart(env.DB, taken ? null : askedAt, lane);
    return taken ? 'dispatched' : 'next_check';
  };
}

// An open page is the clock that GitHub's schedule is not: the teacher app's
// version read and the try page's status read call this after their answer.
// It starts the lane's robot again when no run of it is alive, none checked in
// or was started this way lately, its last run did not end at a limit that
// still holds, and the page's own work waits (claimRobotRestart, then
// laneHasWork; the look at the work runs at most once per ROBOT_RESTART_MS).
export async function restartIfStopped(env: Env, options: AppOptions, scope: RestartScope, now: string): Promise<void> {
  if (!(await claimRobotRestart(env.DB, scope.lane, now))) return;
  if (!(await laneHasWork(env.DB, scope, now))) return;
  await robotStarter({ ...options, robotLane: scope.lane })(env);
}
