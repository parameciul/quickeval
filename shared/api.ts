import { z } from 'zod';
import { normalizeClassName } from './classes.ts';
import type { TestFileKind } from './files.ts';
import { isValidSchoolYear } from './schoolYear.ts';
import { cleanStudentName, MAX_NAME_LENGTH, MAX_NAMES_PER_REQUEST } from './students.ts';
import { cleanTitle, MAX_TITLE_LENGTH, type TestStatus } from './tests.ts';

// Request bodies of the teacher API. The server parses every body with these
// schemas; the browser uses the inferred types.

export const schoolYearSchema = z
  .number()
  .refine(isValidSchoolYear, { message: 'Anul școlar nu este valid.' });

export const classNameSchema = z.string().transform((raw, ctx) => {
  const name = normalizeClassName(raw);
  if (name === null) {
    ctx.addIssue({ code: 'custom', message: 'Numele clasei are 1-8 litere și cifre, de exemplu 6E2.' });
    return z.NEVER;
  }
  return name;
});

export const studentNameSchema = z
  .string()
  .transform(cleanStudentName)
  .pipe(
    z
      .string()
      .min(1, { message: 'Numele elevului lipsește.' })
      .max(MAX_NAME_LENGTH, { message: `Numele unui elev are cel mult ${MAX_NAME_LENGTH} de caractere.` }),
  );

export const createClassBody = z.object({
  name: classNameSchema,
  schoolYear: schoolYearSchema,
});

export const updateClassBody = z
  .object({
    name: classNameSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine((body) => body.name !== undefined || body.archived !== undefined, {
    message: 'Nu ai schimbat nimic.',
  });

export const addStudentsBody = z.object({
  names: z
    .array(studentNameSchema)
    .min(1, { message: 'Scrie cel puțin un nume.' })
    .max(MAX_NAMES_PER_REQUEST, { message: `Adaugă cel mult ${MAX_NAMES_PER_REQUEST} de nume odată.` }),
});

export const setEnrollmentBody = z.object({ active: z.boolean() });

export const renameStudentBody = z.object({ fullName: studentNameSchema });

export const testTitleSchema = z
  .string()
  .transform(cleanTitle)
  .pipe(
    z
      .string()
      .min(1, { message: 'Scrie titlul testului.' })
      .max(MAX_TITLE_LENGTH, { message: `Titlul are cel mult ${MAX_TITLE_LENGTH} de caractere.` }),
  );

export const createTestBody = z.object({
  classId: z.number({ message: 'Alege clasa.' }).int({ message: 'Alege clasa.' }).positive({ message: 'Alege clasa.' }),
  title: testTitleSchema,
});

export const renameTestBody = z.object({ title: testTitleSchema });

export type CreateClassInput = z.input<typeof createClassBody>;
export type UpdateClassInput = z.input<typeof updateClassBody>;
export type CreateTestInput = z.input<typeof createTestBody>;

// Response shapes of the teacher API.

export interface Teacher {
  id: number;
  email: string;
  name: string;
}

export interface ClassSummary {
  id: number;
  name: string;
  schoolYear: number;
  archived: boolean;
  studentCount: number;
}

export interface StudentRow {
  id: number;
  fullName: string;
  active: boolean;
}

export interface ClassDetail {
  class: ClassSummary;
  students: StudentRow[];
  tests: TestSummary[];
}

export interface TestSummary {
  code: string;
  title: string;
  status: TestStatus;
  classId: number;
  className: string;
  schoolYear: number;
  createdAt: string;
  // When Start test opened the uploads: the "date and hour" of the test.
  startedAt: string | null;
  // Active students of the class, and uploads that were sent (confirmed or included).
  studentCount: number;
  submittedCount: number;
}

export interface TestFileInfo {
  name: string;
  type: string;
}

export interface TestInfo extends TestSummary {
  uploadToken: string | null;
  files: Record<TestFileKind, TestFileInfo | null>;
}

// "none": the student has not started an upload.
export type UploadStatus = 'none' | 'uploading' | 'submitted' | 'grading' | 'graded' | 'failed';

// One row of the uploads table: an active student of the class, or a student
// who left the class after starting an upload.
export interface UploadRow {
  studentId: number;
  studentName: string;
  active: boolean;
  submissionId: number | null;
  status: UploadStatus;
  fileCount: number;
  startedAt: string | null;
  submittedAt: string | null;
  autoSubmitted: boolean;
}

export interface TestDetail {
  test: TestInfo;
  uploads: UploadRow[];
}
