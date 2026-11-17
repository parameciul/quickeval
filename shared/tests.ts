export type TestStatus = 'draft' | 'open' | 'evaluating' | 'done';

// The robot's list of the test's exercises (spec §12.5). "problem": the points
// do not add up; "accepted": the teacher said to use it anyway; "failed": the
// robot could not make it after 3 tries.
export type ExerciseListStatus = 'none' | 'ready' | 'problem' | 'accepted' | 'failed';

// The class analysis (spec §8.5): "none": not asked for yet, or the test has no
// graded upload; "requested": the robot writes it; "ready"; "failed": the robot
// could not write it after 3 tries.
export type AnalysisStatus = 'none' | 'requested' | 'ready' | 'failed';

export const MAX_TITLE_LENGTH = 120;

// An evaluation can be scheduled at most this many days ahead.
export const MAX_SCHEDULE_DAYS = 60;

const TEST_CODE = /^[A-Z0-9]{1,8}-\d{2}T\d{1,3}$/;
const UPLOAD_TOKEN = /^[a-z2-7]{16}$/;
const RESULT_TOKEN = /^[a-z2-7]{24}$/;

// The characters of a result code: no 0, O, 1, I or L, which look alike in a
// picture or in handwriting. Migration 0034 makes the codes from the same set.
export const RESULT_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const RESULT_CODE_LENGTH = 6;
// Wrong codes typed on one test's page: at most this many in a window.
export const RESULT_CODE_TRIES = 10;
export const RESULT_CODE_WINDOW_MINUTES = 10;
const RESULT_CODE = new RegExp(`^[${RESULT_CODE_ALPHABET}]{${RESULT_CODE_LENGTH}}$`);

// Class "6E2" in school year 2026, test number 1: "6E2-26T1".
export function buildTestCode(className: string, schoolYear: number, number: number): string {
  return `${className}-${String(schoolYear % 100).padStart(2, '0')}T${number}`;
}

// Codes come from URLs, so "6e2-26t1" is read as "6E2-26T1". Returns null for
// anything that is not a test code.
export function normalizeTestCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return TEST_CODE.test(code) ? code : null;
}

// The secret part of a student upload link: 16 characters from a-z and 2-7.
export function isUploadToken(raw: string): boolean {
  return UPLOAD_TOKEN.test(raw);
}

// The secret part of a student's result link: 24 characters from a-z and 2-7,
// longer than an upload token so the two cannot be confused.
export function isResultToken(raw: string): boolean {
  return RESULT_TOKEN.test(raw);
}

// A result code as a student types it: any letter case, with or without the
// dash or spaces. Returns the stored form ("K7M92P"), or null for anything
// that is not a code.
export function normalizeResultCode(raw: string): string | null {
  const code = raw.replace(/[\s-]/g, '').toUpperCase();
  return RESULT_CODE.test(code) ? code : null;
}

// A stored result code as the pages show it: "K7M-92P".
export function formatResultCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

// Joins inner whitespace into single spaces and trims.
export function cleanTitle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
