import type { RobotStart } from '../shared/api.ts';
import type { AppOptions, Env } from './env.ts';

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

// "Evaluate now" (spec §12.6): asks GitHub to start the robot at once with a
// repository_dispatch event. True when GitHub took the request. Without the
// settings, or when GitHub does not answer in 5 seconds, the robot starts at
// its next regular check. Never throws. When GitHub refuses or does not
// answer, it logs one line for `wrangler pages deployment tail`: the HTTP
// status or the error's name only. An error's message can hold the URL, and
// the URL holds the repository.
export async function dispatchRobot(env: Env, fetchImpl: typeof fetch = fetch): Promise<boolean> {
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
        'User-Agent': 'QuickEval',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ event_type: 'evaluate-now' }),
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
// start at once, or it starts at its next regular check.
export function robotStarter(options: AppOptions): (env: Env) => Promise<RobotStart> {
  const dispatch = options.dispatchRobot ?? ((env: Env) => dispatchRobot(env));
  return async (env) => ((await dispatch(env)) ? 'dispatched' : 'next_check');
}
