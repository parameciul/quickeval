import { z } from 'zod';
import { normalizeClassName } from './classes.ts';
import type { TestFileKind } from './files.ts';
import { MAX_PARALLEL_AGENTS, type RunSummary } from './runner.ts';
import { isValidSchoolYear } from './schoolYear.ts';
import { cleanStudentName, MAX_NAME_LENGTH, MAX_NAMES_PER_REQUEST } from './students.ts';
import { cleanTitle, MAX_TITLE_LENGTH, type ExerciseListStatus, type TestStatus } from './tests.ts';

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

// Start evaluation: now (no `at`, or a time that has passed) or at a later time.
export const evaluateTestBody = z.object({
  at: z.iso.datetime({ message: 'Ora aleasă nu este validă.' }).optional(),
});

const PARALLEL_MESSAGE = `Alege între 1 și ${MAX_PARALLEL_AGENTS} lucrări corectate deodată.`;

export const updateSettingsBody = z.object({
  maxParallelAgents: z
    .number({ message: PARALLEL_MESSAGE })
    .int({ message: PARALLEL_MESSAGE })
    .min(1, { message: PARALLEL_MESSAGE })
    .max(MAX_PARALLEL_AGENTS, { message: PARALLEL_MESSAGE }),
});

// The student app: start or resume an upload for one student of the class.
export const startSessionBody = z.object({
  studentId: z
    .number({ message: 'Alege-ți numele din listă.' })
    .int({ message: 'Alege-ți numele din listă.' })
    .positive({ message: 'Alege-ți numele din listă.' }),
});

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
  // While open: when the evaluation starts by itself. Null when not scheduled.
  evaluationAt: string | null;
  // When the uploads closed and the evaluation started.
  evaluationStartedAt: string | null;
  // Active students of the class, uploads that were sent (confirmed or
  // included), and uploads that were graded.
  studentCount: number;
  submittedCount: number;
  gradedCount: number;
}

export interface TestFileInfo {
  name: string;
  type: string;
}

export interface ExerciseListInfo {
  status: ExerciseListStatus;
  // Why the list needs the teacher: points that do not add up, or an error.
  message: string | null;
}

export interface TestInfo extends TestSummary {
  uploadToken: string | null;
  files: Record<TestFileKind, TestFileInfo | null>;
  exerciseList: ExerciseListInfo;
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
  // Out of 10, once graded.
  grade: number | null;
  // Items to check that the teacher has not checked yet, plus one for pages
  // that could not be read.
  flagCount: number;
  // Why grading failed, for the teacher.
  lastError: string | null;
}

export interface TestDetail {
  test: TestInfo;
  uploads: UploadRow[];
  // For the robot line: when the robot last looked for work.
  robot: { lastCheckAt: string | null };
}

// The robot as the teacher sees it on Setări.
export interface RobotStatus {
  // A run holds the lease and sent a heartbeat in the last 15 minutes.
  running: boolean;
  lastCheckAt: string | null;
  lastRunFinishedAt: string | null;
  lastRunSummary: RunSummary | null;
}

export interface Settings {
  // How many uploads the robot grades at the same time.
  maxParallelAgents: number;
  hasRobotKey: boolean;
  robot: RobotStatus;
  // When one of this teacher's uploads was last graded.
  lastGradedAt: string | null;
}

// Start test: the link is /u/<uploadToken>.
export interface StartedTest {
  status: TestStatus;
  uploadToken: string;
  startedAt: string;
}

// "dispatched": the robot was asked to start at once. "next_check": it starts
// at its next regular check.
export type RobotStart = 'dispatched' | 'next_check';

// Start evaluation: `robot` is null when the evaluation was only scheduled.
export interface EvaluationStart {
  status: TestStatus;
  evaluationAt: string | null;
  robot: RobotStart | null;
}

// "Folosește oricum" and "Încearcă din nou" on the exercise list: `robot` is
// null when the test is not in evaluation.
export interface ExerciseListAnswer {
  exerciseList: ExerciseListInfo;
  robot: RobotStart | null;
}

// A new test or barem file: `robot` is set when a new barem needs a new
// exercise list while the test is in evaluation, and null otherwise.
export interface TestFileAnswer {
  file: TestFileInfo;
  robot: RobotStart | null;
}

// One uploaded page or PDF, in upload order.
export interface SubmissionFile {
  id: number;
  name: string;
  contentType: string;
  size: number;
  position: number;
}

// Response shapes of the student API (/api/u/<token>).

// "done": the student already sent the upload and cannot pick the name again.
export type LinkStudentState = 'none' | 'in_progress' | 'done';

export interface LinkStudent {
  id: number;
  name: string;
  state: LinkStudentState;
}

// The page behind an upload link. The name list is empty unless uploads are open.
export interface LinkInfo {
  test: { code: string; title: string; className: string; status: TestStatus };
  students: LinkStudent[];
}

// One student's upload, as that student's phone sees it.
export interface UploadSession {
  submissionId: number;
  studentId: number;
  studentName: string;
  // Whatever happens to an upload after "submitted" (grading, graded, failed) stays with the teacher.
  status: 'uploading' | 'submitted';
  files: SubmissionFile[];
}

// POST /sessions: `secret` comes only with a new upload; the phone keeps it
// and sends it as X-Upload-Session on every later call.
export interface SessionStart {
  secret?: string;
  session: UploadSession;
}

export interface SubmissionDetail {
  id: number;
  testCode: string;
  testTitle: string;
  studentId: number;
  studentName: string;
  status: Exclude<UploadStatus, 'none'>;
  autoSubmitted: boolean;
  startedAt: string;
  submittedAt: string | null;
  files: SubmissionFile[];
}
