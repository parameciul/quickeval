// The robot's log. The repo is public, so everyone can read the logs of its
// GitHub runs (spec §12.1): write only run ids, numeric ids, counts,
// durations, and error categories. Never a name, a file name, a grade,
// Claude's output, or the content of a file.

export type LogFields = Record<string, number | boolean | string>;

export function log(event: string, fields: LogFields = {}): void {
  const parts = Object.entries(fields).map(([name, value]) => `${name}=${value}`);
  console.log([`[robot] ${event}`, ...parts].join(' '));
}
