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

  it('pins the Claude Code version', () => {
    expect(workflow).toMatch(/npm install --global @anthropic-ai\/claude-code@\d+\.\d+\.\d+\n/);
  });
});
