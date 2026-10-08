import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main } from './check.ts';
import { API_URL, evaluatingTest, fetchFrom, ROBOT_KEY, type RobotWorld } from './test/robotWorld.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HOOK = new URL('./test/refusePackages.mjs', import.meta.url).href;

let world: RobotWorld | undefined;
let folder: string;
let output: string;

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'qe-check-'));
  output = path.join(folder, 'github-output');
});

afterEach(async () => {
  await world?.api.dispose();
  world = undefined;
  rmSync(folder, { recursive: true, force: true });
});

const written = () => readFileSync(output, 'utf8');

describe('runner/check.ts', () => {
  it('finds no work and fails nothing while the robot is not set up', async () => {
    expect(await main({ GITHUB_OUTPUT: output })).toBe(0);
    expect(written()).toBe('has_work=false\n');
  });

  it('asks the API whether there is work', async () => {
    world = await evaluatingTest();
    const env = { QUICKEVAL_URL: API_URL, QUICKEVAL_RUNNER_KEY: ROBOT_KEY, GITHUB_OUTPUT: output };
    expect(await main(env, { fetch: fetchFrom(world.api) })).toBe(0);
    expect(written()).toBe('has_work=true\n');
    const state = await world.api.db.prepare('SELECT last_check_at FROM runner_state WHERE id = 1').first<{ last_check_at: string | null }>();
    expect(state?.last_check_at).not.toBeNull();
  });

  it('finds no work when nothing waits', async () => {
    world = await evaluatingTest({ uploads: 0 });
    const env = { QUICKEVAL_URL: API_URL, QUICKEVAL_RUNNER_KEY: ROBOT_KEY, GITHUB_OUTPUT: output };
    expect(await main(env, { fetch: fetchFrom(world.api) })).toBe(0);
    expect(written()).toBe('has_work=false\n');
  });

  it('fails the run when the API refuses the key', async () => {
    world = await evaluatingTest();
    const env = { QUICKEVAL_URL: API_URL, QUICKEVAL_RUNNER_KEY: 'an-old-robot-key', GITHUB_OUTPUT: output };
    expect(await main(env, { fetch: fetchFrom(world.api) })).toBe(1);
    expect(written()).toBe('has_work=false\n');
  });

  it('fails the run when the API cannot be reached', async () => {
    const env = { QUICKEVAL_URL: API_URL, QUICKEVAL_RUNNER_KEY: ROBOT_KEY, GITHUB_OUTPUT: output };
    const down = async () => {
      throw new TypeError('fetch failed');
    };
    expect(await main(env, { fetch: down, retryDelayMs: 0 })).toBe(1);
    expect(written()).toBe('has_work=false\n');
  });

  it('runs with Node alone, before `npm ci`', () => {
    const env = { ...process.env, GITHUB_OUTPUT: '', QUICKEVAL_URL: '', QUICKEVAL_RUNNER_KEY: '', QE_ALLOWED_PACKAGES: '' };
    const run = spawnSync(process.execPath, ['--import', HOOK, 'runner/check.ts'], { cwd: ROOT, env, encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('has_work=false');
  });

  it('is checked by a hook that refuses packages', () => {
    const env = { ...process.env, QE_ALLOWED_PACKAGES: '' };
    const run = spawnSync(process.execPath, ['--import', HOOK, '--input-type=module', '-e', "await import('zod')"], { cwd: ROOT, env, encoding: 'utf8' });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('refused package: zod');
  });
});
