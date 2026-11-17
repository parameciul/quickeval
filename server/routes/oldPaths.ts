import { isTestFileKind, testFileKindOfPath, type TestFileKind } from '../../shared/files.ts';

// The API's paths named the barem "barem" and the CES variant "ces" until
// 2026-11-17 (docs/superpowers/plans/2026-11-17-english-addresses.md, P4).
// A tab that was open before the deploy keeps the app it loaded, which calls
// the old paths. So each renamed route answers to its old path too, for a few
// hours after the deploy; then the old paths go, with this file.

// The English path of a route, then its old one.
export function withOldPath(path: string, old: string): string[] {
  return [path, old];
}

// The kind of a test file that an address names: "marking-scheme" now,
// "barem" in the old paths.
export function fileKindOfPath(raw: string | undefined): TestFileKind | null {
  if (raw === undefined) return null;
  return testFileKindOfPath(raw) ?? (isTestFileKind(raw) ? raw : null);
}
