import { readdirSync } from 'node:fs';
import path from 'node:path';
import type { ClaudeOutcome, ClaudeProblem, ClaudeRunner, ClaudeTask } from '../claude.ts';

// A Claude for tests: each run takes the next answer of the script, a value or
// a function of the task, and records the files that its work folder held.

export type ScriptedAnswer = ClaudeOutcome | ((task: ClaudeTask) => ClaudeOutcome | Promise<ClaudeOutcome>);

export const answer = (output: unknown): ClaudeOutcome => ({ ok: true, output, model: 'claude-test' });
export const problem = (kind: ClaudeProblem): ClaudeOutcome => ({ ok: false, problem: kind, detail: 'scripted' });

// Every file under the folder, with "/" between the parts, sorted.
export function filesIn(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(folder, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();
}

export function scriptedClaude(...script: ScriptedAnswer[]) {
  const calls: { task: ClaudeTask; files: string[] }[] = [];
  const run: ClaudeRunner = async (task) => {
    calls.push({ task, files: filesIn(task.cwd) });
    const next = script.shift();
    if (!next) throw new Error('the script has no more answers');
    return typeof next === 'function' ? next(task) : next;
  };
  return { run, calls, add: (...more: ScriptedAnswer[]) => script.push(...more) };
}
