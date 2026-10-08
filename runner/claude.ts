import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { spawn } from 'node:child_process';

// Runs Claude Code for one robot task (spec §12.4), the same way on GitHub and
// in `npm run try:skill`.

export type ClaudeMode = 'exercise-list' | 'grade';

// How long one task may take. The run takes new work for 2 hours; that plus
// the longest task stays under the GitHub job's 150 minutes.
export const TIME_LIMITS_MS: Record<ClaudeMode, number> = { 'exercise-list': 10 * 60_000, grade: 20 * 60_000 };
// At the time limit Claude gets SIGINT, then SIGTERM after this, then SIGKILL.
export const KILL_GRACE_MS = 10_000;
export const MAX_TURNS = 40;
// Claude's answer is a few kilobytes; anything past this is not read.
const MAX_STDOUT_CHARS = 5_000_000;

export interface ClaudeSettings {
  // The program and its first arguments: ['claude'], or a stand-in in tests.
  command: string[];
  model: string;
  effort: string;
  // CLAUDE_CODE_OAUTH_TOKEN: the teacher's Claude plan (`claude setup-token`).
  token: string | undefined;
  // An empty folder outside the work folder: no settings, plugins, or memory
  // of the machine can change the result.
  configDir: string;
}

// Spec §12.1: QE_MODEL (default opus) and QE_EFFORT (default high).
export function claudeSettings(env: Record<string, string | undefined>, configDir: string): ClaudeSettings {
  return {
    command: ['claude'],
    model: env.QE_MODEL?.trim() || 'opus',
    effort: env.QE_EFFORT?.trim() || 'high',
    token: env.CLAUDE_CODE_OAUTH_TOKEN?.trim() || undefined,
    configDir,
  };
}

export function claudeArgs(mode: ClaudeMode, jsonSchema: object, settings: ClaudeSettings): string[] {
  return [
    '-p',
    `/evaluate-test ${mode}`,
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(jsonSchema),
    '--model',
    settings.model,
    '--effort',
    settings.effort,
    // Student pages are untrusted input: Claude only reads, and --restricted
    // keeps its file tools inside the work folder.
    '--tools',
    'Read,Glob',
    '--restricted',
    '--permission-mode',
    'dontAsk',
    '--permission-prompts',
    'none',
    '--no-session-persistence',
    '--max-turns',
    String(MAX_TURNS),
  ];
}

// The variables Claude needs to start. All others stay out: the robot key
// above all, and an API key, which would bill the API instead of the plan.
const PASSED = new Set([
  'PATH',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
  'LC_ALL',
]);

export function claudeEnv(settings: ClaudeSettings, base: Record<string, string | undefined> = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(base)) {
    if (value !== undefined && PASSED.has(name.toUpperCase())) env[name] = value;
  }
  env.CLAUDE_CONFIG_DIR = settings.configDir;
  env.DISABLE_AUTOUPDATER = '1';
  if (settings.token) env.CLAUDE_CODE_OAUTH_TOKEN = settings.token;
  return env;
}

// Why a Claude run gave nothing to use:
// - timeout: it passed its time limit;
// - usage_limit: the plan reached its limit (try again later, no attempt);
// - not_logged_in: Claude refused the token (the run stops);
// - invalid_output: it ended without the JSON answer;
// - crash: anything else.
export type ClaudeProblem = 'timeout' | 'usage_limit' | 'not_logged_in' | 'invalid_output' | 'crash';

// `detail` is for the public log: categories and codes, never Claude's text.
export type ClaudeOutcome = { ok: true; output: unknown; model: string } | { ok: false; problem: ClaudeProblem; detail: string };

// The fields of Claude Code's JSON result that the robot reads.
interface ResultMessage {
  type?: unknown;
  subtype?: unknown;
  is_error?: unknown;
  api_error_status?: unknown;
  terminal_reason?: unknown;
  result?: unknown;
  errors?: unknown;
  structured_output?: unknown;
  modelUsage?: Record<string, { outputTokens?: number }>;
}

function messageText(message: ResultMessage): string {
  const errors = Array.isArray(message.errors) ? message.errors.filter((entry) => typeof entry === 'string') : [];
  return [typeof message.result === 'string' ? message.result : '', ...errors].join('\n');
}

// Claude refused the login: no token, or an expired or revoked one.
export function isLoginProblem(message: ResultMessage): boolean {
  if (message.api_error_status === 401 || message.api_error_status === 403) return true;
  return /not logged in|\/login|oauth|authenticat|invalid api key|token (?:has )?(?:expired|been revoked)|invalid.{0,20}token/i.test(messageText(message));
}

// The plan's limit (spec §12.4). The spike could not reach it: the shape is
// taken from Claude Code's documented messages ("You've hit your session
// limit", HTTP 429). See runner/fixtures/README.md.
export function isUsageLimit(message: ResultMessage): boolean {
  if (message.api_error_status === 429) return true;
  return /hit your .{0,30}limit|\b(?:usage|rate|session|weekly|plan) limit\b|limit reached/i.test(messageText(message));
}

// The model that wrote most of the answer.
function modelOf(message: ResultMessage): string {
  const used = Object.entries(message.modelUsage ?? {}).sort(([, a], [, b]) => (b.outputTokens ?? 0) - (a.outputTokens ?? 0));
  return (used[0]?.[0] ?? 'unknown').slice(0, 100);
}

// Reads what `claude -p --output-format json` printed. The order matters: an
// error exits with code 1 and still prints JSON, and a refused login comes
// with subtype "success" and is_error true.
export function readOutcome(stdout: string, exitCode: number | null, timedOut: boolean): ClaudeOutcome {
  if (timedOut) return { ok: false, problem: 'timeout', detail: 'time limit' };
  let message: ResultMessage | null = null;
  try {
    message = JSON.parse(stdout.trim()) as ResultMessage;
  } catch {
    // Not JSON: Claude did not start, or refused its arguments.
  }
  if (!message || typeof message !== 'object' || message.type !== 'result') {
    return { ok: false, problem: 'crash', detail: `exit=${exitCode} no result` };
  }
  const detail = `exit=${exitCode} subtype=${String(message.subtype)} terminal=${String(message.terminal_reason)} status=${String(message.api_error_status ?? null)}`;
  if (message.is_error === true || exitCode !== 0) {
    if (isLoginProblem(message)) return { ok: false, problem: 'not_logged_in', detail };
    if (isUsageLimit(message)) return { ok: false, problem: 'usage_limit', detail };
    if (message.subtype === 'error_max_turns' || message.subtype === 'error_max_structured_output_retries') {
      return { ok: false, problem: 'invalid_output', detail };
    }
    return { ok: false, problem: 'crash', detail };
  }
  if (message.subtype !== 'success' || message.structured_output === undefined || message.structured_output === null) {
    return { ok: false, problem: 'invalid_output', detail };
  }
  return { ok: true, output: message.structured_output, model: modelOf(message) };
}

export interface ClaudeTask {
  mode: ClaudeMode;
  // The work folder (runner/workdir.ts).
  cwd: string;
  jsonSchema: object;
  // TIME_LIMITS_MS of the mode, unless a test says otherwise.
  timeoutMs?: number;
}

export type ClaudeRunner = (task: ClaudeTask) => Promise<ClaudeOutcome>;

export interface ProcessControl {
  spawn(command: string, args: string[], options: SpawnOptions): ChildProcess;
  // Sends the signal to the process and to any process that it started.
  signal(child: ChildProcess, signal: NodeJS.Signals): void;
}

// On Linux and macOS Claude gets its own process group, so a signal reaches
// every process it started. Windows has no signals: kill() ends the process.
const GROUPS = process.platform !== 'win32';

export const realProcesses: ProcessControl = {
  spawn: (command, args, options) => spawn(command, args, { ...options, detached: GROUPS }),
  signal: (child, signal) => {
    try {
      if (GROUPS && child.pid !== undefined) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch {
      // It ended already.
    }
  },
};

export function claudeRunner(settings: ClaudeSettings, control: ProcessControl = realProcesses, killGraceMs = KILL_GRACE_MS): ClaudeRunner {
  return (task) =>
    new Promise((resolve) => {
      const [command, ...prefix] = settings.command;
      const child = control.spawn(command!, [...prefix, ...claudeArgs(task.mode, task.jsonSchema, settings)], {
        cwd: task.cwd,
        env: claudeEnv(settings),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let timedOut = false;
      let settled = false;
      const timers: NodeJS.Timeout[] = [];
      const finish = (outcome: ClaudeOutcome) => {
        if (settled) return;
        settled = true;
        for (const timer of timers) clearTimeout(timer);
        resolve(outcome);
      };

      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        if (stdout.length < MAX_STDOUT_CHARS) stdout += chunk;
      });
      // Claude's own messages are not logged: they can quote a student's page.
      child.stderr?.resume();
      timers.push(
        setTimeout(() => {
          timedOut = true;
          // The later signals are set first: the program can end during SIGINT.
          timers.push(setTimeout(() => control.signal(child, 'SIGTERM'), killGraceMs));
          timers.push(setTimeout(() => control.signal(child, 'SIGKILL'), 2 * killGraceMs));
          control.signal(child, 'SIGINT');
        }, task.timeoutMs ?? TIME_LIMITS_MS[task.mode]),
      );
      child.on('error', (err: NodeJS.ErrnoException) => finish({ ok: false, problem: 'crash', detail: `start failed: ${err.code ?? 'error'}` }));
      child.on('close', (code) => finish(readOutcome(stdout, code, timedOut)));
    });
}
