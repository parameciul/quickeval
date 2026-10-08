import { appendFileSync } from 'node:fs';
import type { RobotApiOptions } from './api.ts';
import { RobotApiError, robotApiFromEnv } from './api.ts';
import { log } from './log.ts';

// The first step of every GitHub run (spec §12.1): is there work for the
// robot? It runs before `npm ci`, so it loads no package: only Node's own
// modules and runner files that import nothing but types from shared/.
//
// Exit code 0 also when the robot is not set up yet, so the 10-minute schedule
// sends no failure email before the secrets exist. A refused key or an API
// that cannot be reached fails the run: someone must look.

export async function checkForWork(env: Record<string, string | undefined>, options: RobotApiOptions = {}): Promise<{ hasWork: boolean; exitCode: number }> {
  const api = robotApiFromEnv(env, options);
  if (!api) {
    log('not set up: QUICKEVAL_URL or QUICKEVAL_RUNNER_KEY is missing');
    return { hasWork: false, exitCode: 0 };
  }
  try {
    const counts = await api.check();
    log('check', { exerciseLists: counts.exerciseLists, pendingGrading: counts.pendingGrading, analyses: counts.analyses });
    return { hasWork: counts.hasWork, exitCode: 0 };
  } catch (err) {
    log('check failed', { error: err instanceof RobotApiError ? err.code : 'unknown' });
    return { hasWork: false, exitCode: 1 };
  }
}

// Writes `has_work=true|false` for the next workflow steps, and returns the exit code.
export async function main(env: Record<string, string | undefined>, options: RobotApiOptions = {}): Promise<number> {
  const { hasWork, exitCode } = await checkForWork(env, options);
  const line = `has_work=${hasWork}\n`;
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, line);
  else process.stdout.write(line);
  return exitCode;
}

if (import.meta.main) {
  process.exitCode = await main(process.env);
}
