export type TestStatus = 'draft' | 'open' | 'evaluating' | 'done';

export const MAX_TITLE_LENGTH = 120;

// An evaluation can be scheduled at most this many days ahead.
export const MAX_SCHEDULE_DAYS = 60;

const TEST_CODE = /^[A-Z0-9]{1,8}-\d{2}T\d{1,3}$/;
const UPLOAD_TOKEN = /^[a-z2-7]{16}$/;

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

// Joins inner whitespace into single spaces and trims.
export function cleanTitle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
