import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KILL_GRACE_MS, TIME_LIMITS_MS } from './claude.ts';
import { BUDGET_MS } from './run.ts';

// The GitHub workflow of the robot (.github/workflows/evaluate.yml) must fit
// the robot's own limits and keep its secrets in the steps that need them.

const workflow = readFileSync(new URL('../.github/workflows/evaluate.yml', import.meta.url), 'utf8');
const stepOf = (text: string) => workflow.lastIndexOf('- name:', workflow.indexOf(text));

describe('evaluate.yml', () => {
  it('gives the job time for the budget, two Claude tries of the longest task, and its install', () => {
    const minutes = Number(/timeout-minutes: (\d+)/.exec(workflow)?.[1]);
    const longestTry = Math.max(...Object.values(TIME_LIMITS_MS)) + 2 * KILL_GRACE_MS;
    expect(minutes * 60_000).toBeGreaterThanOrEqual(BUDGET_MS + 2 * longestTry + 10 * 60_000);
  });

  it('checks for work with Node alone, and installs and grades only when there is work', () => {
    expect(workflow.indexOf('run: node runner/check.ts')).toBeLessThan(workflow.indexOf('npm ci --omit=dev'));
    expect(workflow.match(/if: steps\.check\.outputs\.has_work == 'true'/g)).toHaveLength(2);
    expect(workflow).toContain('run: node runner/run.ts');
  });

  it('runs one robot at a time, never cancelled by a newer run', () => {
    expect(workflow).toContain('group: quickeval-robot');
    expect(workflow).toContain('cancel-in-progress: false');
  });

  it('starts every 10 minutes, on "evaluate-now", and by hand', () => {
    expect(workflow).toContain("- cron: '*/10 * * * *'");
    expect(workflow).toContain('types: [evaluate-now]');
    expect(workflow).toContain('workflow_dispatch:');
  });

  it('switches the schedule on again with the same weekly line', () => {
    const weekly = /- cron: '(\d+ \d+ \* \* \d)'/.exec(workflow)?.[1];
    expect(weekly).toBeDefined();
    expect(workflow).toContain(`github.event.schedule == '${weekly}'`);
  });

  it('gives the Claude token only to the grading step, and the robot key only to the robot steps', () => {
    expect(workflow.match(/secrets\.CLAUDE_CODE_OAUTH_TOKEN/g)).toHaveLength(1);
    expect(stepOf('secrets.CLAUDE_CODE_OAUTH_TOKEN')).toBe(workflow.indexOf('- name: Grade'));
    expect(workflow.match(/secrets\.QUICKEVAL_RUNNER_KEY/g)).toHaveLength(2);
    expect(stepOf('npm ci --omit=dev')).toBe(workflow.indexOf('- name: Install'));
    expect(workflow.slice(workflow.indexOf('- name: Install'), workflow.indexOf('- name: Grade'))).not.toContain('secrets.');
  });

  it('lets only the weekly job change the workflows, and keeps no token in the robot checkout', () => {
    const keepOn = workflow.slice(workflow.indexOf('\n  keep-on:'), workflow.indexOf('\n  robot:'));
    const robot = workflow.slice(workflow.indexOf('\n  robot:'));
    expect(keepOn).toContain('actions: write');
    expect(keepOn).not.toContain('actions/checkout');
    expect(robot).not.toContain('actions: write');
    expect(robot).toContain('persist-credentials: false');
    expect(robot).toContain('group: quickeval-robot');
  });

  it('pins the Claude Code version', () => {
    expect(workflow).toMatch(/npm install --global @anthropic-ai\/claude-code@\d+\.\d+\.\d+\n/);
  });

  // Ubuntu's pandoc (3.1.3) keeps its data files outside the program, so with
  // --sandbox it cannot write any Word file: the generated barem needs the
  // official build, which carries them inside.
  it('installs the pinned official pandoc, not Ubuntu\'s', () => {
    const install = workflow.slice(workflow.indexOf('- name: Install'), workflow.indexOf('- name: Grade'));
    expect(install).toContain('bash .github/scripts/install-pandoc.sh');
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
