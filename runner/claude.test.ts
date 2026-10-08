import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { claudeArgs, claudeEnv, claudeRunner, claudeSettings, type ClaudeSettings, type ProcessControl, readOutcome } from './claude.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const FAKE_CLAUDE = fileURLToPath(new URL('./test/fakeClaude.mjs', import.meta.url));

const SETTINGS: ClaudeSettings = { command: ['claude'], model: 'opus', effort: 'high', token: 'oauth-token', configDir: '/tmp/qe/config' };

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('readOutcome', () => {
  it('reads the answer and the model of a run that worked', () => {
    const grade = readOutcome(fixture('claude-grade.json'), 0, false);
    expect(grade).toMatchObject({ ok: true, model: 'claude-opus-5-5' });
    expect(grade.ok && (grade.output as { items: unknown[] }).items).toHaveLength(6);
    expect(readOutcome(fixture('claude-exercise-list.json'), 0, false)).toMatchObject({ ok: true, model: 'claude-sonnet-5-5' });
  });

  it('tells a refused login, a usage limit, and too many turns apart', () => {
    expect(readOutcome(fixture('claude-not-logged-in.json'), 1, false)).toMatchObject({ ok: false, problem: 'not_logged_in' });
    expect(readOutcome(fixture('claude-usage-limit.json'), 1, false)).toMatchObject({ ok: false, problem: 'usage_limit' });
    expect(readOutcome(fixture('claude-max-turns.json'), 1, false)).toMatchObject({ ok: false, problem: 'invalid_output' });
  });

  it('takes the time limit first, whatever was printed', () => {
    expect(readOutcome(fixture('claude-grade.json'), null, true)).toEqual({ ok: false, problem: 'timeout', detail: 'time limit' });
  });

  it('calls a run without a result message a crash', () => {
    expect(readOutcome('', 1, false)).toEqual({ ok: false, problem: 'crash', detail: 'exit=1 no result' });
    expect(readOutcome('Error: --json-schema is not a valid JSON Schema', 1, false)).toMatchObject({ problem: 'crash' });
    expect(readOutcome('{"type":"assistant"}', 0, false)).toMatchObject({ problem: 'crash' });
  });

  it('calls a success without the JSON answer an invalid output', () => {
    const empty = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Gata.' });
    expect(readOutcome(empty, 0, false)).toMatchObject({ ok: false, problem: 'invalid_output' });
    const retries = JSON.stringify({ type: 'result', subtype: 'error_max_structured_output_retries', is_error: true });
    expect(readOutcome(retries, 1, false)).toMatchObject({ ok: false, problem: 'invalid_output' });
  });

  it('finds a refused login by its HTTP status or its words', () => {
    const error = (fields: object) => JSON.stringify({ type: 'result', subtype: 'success', is_error: true, ...fields });
    expect(readOutcome(error({ api_error_status: 401, result: 'API Error' }), 1, false)).toMatchObject({ problem: 'not_logged_in' });
    expect(readOutcome(error({ result: 'OAuth token has expired. Please obtain a new token.' }), 1, false)).toMatchObject({ problem: 'not_logged_in' });
    expect(readOutcome(error({ api_error_status: 429, result: 'Rate limited' }), 1, false)).toMatchObject({ problem: 'usage_limit' });
    expect(readOutcome(error({ api_error_status: 500, result: 'Internal server error' }), 1, false)).toMatchObject({ problem: 'crash' });
  });

  it('keeps the detail free of Claude text', () => {
    const outcome = readOutcome(fixture('claude-not-logged-in.json'), 1, false);
    expect(outcome).toEqual({ ok: false, problem: 'not_logged_in', detail: 'exit=1 subtype=success terminal=api_error status=null' });
  });
});

describe('claudeArgs', () => {
  it('runs the skill in print mode, with the JSON Schema, read-only tools, and the work folder only', () => {
    expect(claudeArgs('grade', { type: 'object' }, SETTINGS)).toEqual([
      '-p',
      '/evaluate-test grade',
      '--output-format',
      'json',
      '--json-schema',
      '{"type":"object"}',
      '--model',
      'opus',
      '--effort',
      'high',
      '--tools',
      'Read,Glob',
      '--restricted',
      '--permission-mode',
      'dontAsk',
      '--permission-prompts',
      'none',
      '--no-session-persistence',
      '--max-turns',
      '40',
    ]);
  });
});

describe('claudeSettings and claudeEnv', () => {
  it('takes the model, the effort, and the token from the environment', () => {
    expect(claudeSettings({}, '/c')).toEqual({ command: ['claude'], model: 'opus', effort: 'high', token: undefined, configDir: '/c' });
    expect(claudeSettings({ QE_MODEL: 'sonnet', QE_EFFORT: 'medium', CLAUDE_CODE_OAUTH_TOKEN: ' t ' }, '/c')).toMatchObject({
      model: 'sonnet',
      effort: 'medium',
      token: 't',
    });
  });

  it('passes what Claude needs to start, and keeps the robot key and API keys out', () => {
    const env = claudeEnv(SETTINGS, {
      PATH: '/usr/bin',
      Path: 'C:\\Windows',
      HOME: '/home/runner',
      QUICKEVAL_RUNNER_KEY: 'robot-key',
      QUICKEVAL_URL: 'https://quickeval.pages.dev',
      ANTHROPIC_API_KEY: 'sk-ant-api',
      GITHUB_TOKEN: 'ghs_token',
      CLAUDE_CONFIG_DIR: '/home/runner/.claude',
    });
    expect(env).toEqual({
      PATH: '/usr/bin',
      Path: 'C:\\Windows',
      HOME: '/home/runner',
      CLAUDE_CONFIG_DIR: '/tmp/qe/config',
      DISABLE_AUTOUPDATER: '1',
      CLAUDE_CODE_OAUTH_TOKEN: 'oauth-token',
    });
  });
});

describe('claudeRunner', () => {
  function fakeControl(onSignal?: (signal: string, child: EventEmitter) => void) {
    const signals: string[] = [];
    let child: EventEmitter & { stdout: PassThrough; stderr: PassThrough } = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    const control: ProcessControl = {
      spawn: () => {
        child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() });
        return child as unknown as ChildProcess;
      },
      signal: (_child, signal) => {
        signals.push(signal);
        onSignal?.(signal, child);
      },
    };
    return { control, signals, child: () => child };
  }
  const task = { mode: 'grade' as const, cwd: '.', jsonSchema: {}, timeoutMs: 5_000 };

  it('starts the real program with every argument intact and the narrow environment', async () => {
    vi.stubEnv('QUICKEVAL_RUNNER_KEY', 'robot-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-api');
    const folder = mkdtempSync(path.join(tmpdir(), 'qe-claude-'));
    try {
      const schema = { description: 'un "text" cu spații și diacritice: ă î ș ț', type: 'object' };
      const run = claudeRunner({ ...SETTINGS, command: [process.execPath, FAKE_CLAUDE] });
      const outcome = await run({ mode: 'exercise-list', cwd: folder, jsonSchema: schema });
      if (!outcome.ok) throw new Error(outcome.detail);
      const seen = outcome.output as { args: string[]; env: Record<string, string>; cwd: string };
      expect(seen.args).toEqual(claudeArgs('exercise-list', schema, SETTINGS));
      expect(realpathSync(seen.cwd)).toBe(realpathSync(folder));
      expect(seen.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('oauth-token');
      expect(seen.env.QUICKEVAL_RUNNER_KEY).toBeUndefined();
      expect(seen.env.ANTHROPIC_API_KEY).toBeUndefined();
      expect(outcome.model).toBe('claude-fake-1');
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('reads what the program printed when it ends', async () => {
    const { control, child } = fakeControl();
    const running = claudeRunner(SETTINGS, control)(task);
    child().stdout.end(fixture('claude-grade.json'));
    await new Promise((resolve) => setImmediate(resolve));
    child().emit('close', 0);
    expect(await running).toMatchObject({ ok: true, model: 'claude-opus-5-5' });
  });

  it('stops a run at its time limit: SIGINT, then SIGTERM, then SIGKILL', async () => {
    vi.useFakeTimers();
    const { control, signals, child } = fakeControl();
    const running = claudeRunner(SETTINGS, control, 1_000)(task);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(signals).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(signals).toEqual(['SIGINT']);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(signals).toEqual(['SIGINT', 'SIGTERM']);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(signals).toEqual(['SIGINT', 'SIGTERM', 'SIGKILL']);
    child().emit('close', null);
    expect(await running).toEqual({ ok: false, problem: 'timeout', detail: 'time limit' });
  });

  it('sends nothing more once the program ended', async () => {
    vi.useFakeTimers();
    const { control, signals } = fakeControl((signal, child) => {
      if (signal === 'SIGINT') child.emit('close', 130);
    });
    const running = claudeRunner(SETTINGS, control, 1_000)(task);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await running).toMatchObject({ ok: false, problem: 'timeout' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(signals).toEqual(['SIGINT']);
  });

  it('calls a program that cannot start a crash', async () => {
    const { control, child } = fakeControl();
    const running = claudeRunner(SETTINGS, control)(task);
    child().emit('error', Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }));
    child().emit('close', -2);
    expect(await running).toEqual({ ok: false, problem: 'crash', detail: 'start failed: ENOENT' });
  });
});
