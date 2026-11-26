import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KILL_GRACE_MS, TIME_LIMITS_MS } from './claude.ts';
import { BUDGET_MS } from './run.ts';

// The GitHub workflow of the robot (.github/workflows/evaluate.yml) must fit
// the robot's own limits and keep its secrets in the steps that need them.

const workflow = readFileSync(new URL('../.github/workflows/evaluate.yml', import.meta.url), 'utf8');
// The two robot jobs: the teachers' robot, then the Quick Try robot (the try lane).
const robotJob = workflow.slice(workflow.indexOf('\n  robot:'), workflow.indexOf('\n  try-robot:'));
const tryJob = workflow.slice(workflow.indexOf('\n  try-robot:'));
const stepIn = (job: string, text: string) => job.lastIndexOf('- name:', job.indexOf(text));
const ROBOT_JOBS = [
  ['robot', robotJob],
  ['try-robot', tryJob],
] as const;

describe('evaluate.yml', () => {
  it.each(ROBOT_JOBS)('gives %s time for the budget, two Claude tries of the longest task, and its install', (_name, job) => {
    const minutes = Number(/timeout-minutes: (\d+)/.exec(job)?.[1]);
    const longestTry = Math.max(...Object.values(TIME_LIMITS_MS)) + 2 * KILL_GRACE_MS;
    expect(minutes * 60_000).toBeGreaterThanOrEqual(BUDGET_MS + 2 * longestTry + 10 * 60_000);
  });

  it.each(ROBOT_JOBS)('%s checks for work with Node alone, and installs and grades only when there is work', (_name, job) => {
    expect(job.indexOf('run: node runner/check.ts')).toBeGreaterThan(-1);
    expect(job.indexOf('run: node runner/check.ts')).toBeLessThan(job.indexOf('npm ci --omit=dev'));
    expect(job.match(/if: steps\.check\.outputs\.has_work == 'true'/g)).toHaveLength(2);
    expect(job).toContain('run: node runner/run.ts');
  });

  it('runs one robot of each lane at a time, never cancelled by a newer run', () => {
    expect(robotJob).toMatch(/group: quickeval-robot\n/);
    expect(tryJob).toMatch(/group: quickeval-robot-try\n/);
    for (const [, job] of ROBOT_JOBS) expect(job).toContain('cancel-in-progress: false');
  });

  it('runs the Quick Try robot on evaluate-try, in its own group', () => {
    expect(workflow).toMatch(/types: \[[^\]]*\bevaluate-try\b[^\]]*\]/);
    expect(tryJob).toContain("if: github.event.action == 'evaluate-try' || (github.event_name == 'workflow_dispatch' && inputs.lane == 'try')");
    // QE_LANE in its Check and Grade steps, so both ask for the try lane.
    expect(tryJob.match(/QE_LANE: try/g)).toHaveLength(2);
    expect(stepIn(tryJob, 'QE_LANE: try')).toBe(tryJob.indexOf('- name: Check for work'));
    expect(robotJob).not.toContain('QE_LANE');
  });

  it("keeps the teachers' robot off evaluate-try", () => {
    const condition = /\n    if: ([^\n]+)/.exec(robotJob)?.[1] ?? '';
    expect(condition).toContain("github.event.action != 'evaluate-try'");
    expect(condition).toContain("inputs.lane == 'try'");
  });

  it("gives the backup token only to the Quick Try robot's Grade step", () => {
    expect(workflow.match(/secrets\.CLAUDE_CODE_OAUTH_TOKEN_BACKUP/g)).toHaveLength(1);
    expect(stepIn(tryJob, 'secrets.CLAUDE_CODE_OAUTH_TOKEN_BACKUP')).toBe(tryJob.indexOf('- name: Grade'));
  });

  it('lets a run by hand pick the lane', () => {
    const dispatch = workflow.slice(workflow.indexOf('workflow_dispatch:'), workflow.indexOf('\njobs:'));
    expect(dispatch).toContain('lane:');
    expect(dispatch).toMatch(/options:\s*\n\s*- main\s*\n\s*- try/);
    expect(dispatch).toContain('default: main');
  });

  it('starts every 10 minutes, on "evaluate-now", and by hand', () => {
    expect(workflow).toContain("- cron: '*/10 * * * *'");
    expect(workflow).toMatch(/types: \[[^\]]*\bevaluate-now\b[^\]]*\]/);
    expect(workflow).toContain('workflow_dispatch:');
  });

  it('switches the schedule on again with the same weekly line', () => {
    const weekly = /- cron: '(\d+ \d+ \* \* \d)'/.exec(workflow)?.[1];
    expect(weekly).toBeDefined();
    expect(workflow).toContain(`github.event.schedule == '${weekly}'`);
  });

  it.each(ROBOT_JOBS)('%s gives the Claude token only to its grading step, and the robot key only to its robot steps', (_name, job) => {
    expect(job.match(/secrets\.CLAUDE_CODE_OAUTH_TOKEN\b(?!_)/g)).toHaveLength(1);
    expect(stepIn(job, 'secrets.CLAUDE_CODE_OAUTH_TOKEN }}')).toBe(job.indexOf('- name: Grade'));
    expect(job.match(/secrets\.QUICKEVAL_RUNNER_KEY/g)).toHaveLength(2);
    expect(stepIn(job, 'npm ci --omit=dev')).toBe(job.indexOf('- name: Install'));
    expect(job.slice(job.indexOf('- name: Install'), job.indexOf('- name: Grade'))).not.toContain('secrets.');
  });

  it('lets only the weekly job change the workflows, and keeps no token in the robot checkout', () => {
    const keepOn = workflow.slice(workflow.indexOf('\n  keep-on:'), workflow.indexOf('\n  robot:'));
    expect(keepOn).toContain('actions: write');
    expect(keepOn).not.toContain('actions/checkout');
    for (const [, job] of ROBOT_JOBS) {
      expect(job).not.toContain('actions: write');
      expect(job).toContain('persist-credentials: false');
    }
  });

  it('pins one Claude Code version for both robots', () => {
    const versions = [...workflow.matchAll(/npm install --global @anthropic-ai\/claude-code@(\d+\.\d+\.\d+)\n/g)].map((found) => found[1]);
    expect(versions).toHaveLength(2);
    expect(new Set(versions).size).toBe(1);
  });

  // Ubuntu's pandoc (3.1.3) keeps its data files outside the program, so with
  // --sandbox it cannot write any Word file: the generated barem needs the
  // official build, which carries them inside.
  it('installs the pinned official pandoc, not Ubuntu\'s', () => {
    for (const [, job] of ROBOT_JOBS) {
      const install = job.slice(job.indexOf('- name: Install'), job.indexOf('- name: Grade'));
      expect(install).toContain('bash .github/scripts/install-pandoc.sh');
    }
    expect(workflow).not.toMatch(/apt-get install[^\n]*pandoc/);
  });
});

describe('install-pandoc.sh', () => {
  const script = readFileSync(new URL('../.github/scripts/install-pandoc.sh', import.meta.url), 'utf8');

  it('downloads one pandoc version and checks it before installing', () => {
    expect(script).toMatch(/^version=\d+\.\d+(\.\d+)*$/m);
    expect(script).toMatch(/^sha256=[0-9a-f]{64}$/m);
    expect(script.indexOf('sha256sum --check')).toBeGreaterThan(-1);
    expect(script.indexOf('sha256sum --check')).toBeLessThan(script.indexOf('dpkg --install'));
    expect(script).toContain('set -euo pipefail');
  });

  it('is also what CI tests with, before the tests run', () => {
    const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
    expect(ci.indexOf('bash .github/scripts/install-pandoc.sh')).toBeGreaterThan(-1);
    expect(ci.indexOf('bash .github/scripts/install-pandoc.sh')).toBeLessThan(ci.indexOf('npm test'));
  });
});
