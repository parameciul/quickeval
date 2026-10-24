import { z } from 'zod';
import { normalizeClassName } from './classes.ts';
import type { TestFileKind } from './files.ts';
import { MAX_PARALLEL_AGENTS, type RunSummary } from './runner.ts';
import { type ClassAnalysis, TEXT_LIMITS, type Confidence } from './schemas.ts';
import { isValidSchoolYear } from './schoolYear.ts';
import { cleanStudentName, MAX_NAME_LENGTH, MAX_NAMES_PER_REQUEST, studentNameKey } from './students.ts';
import { type AnalysisStatus, cleanTitle, MAX_TITLE_LENGTH, type ExerciseListStatus, type TestStatus } from './tests.ts';

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
    .max(MAX_NAMES_PER_REQUEST, { message: `Adaugă cel mult ${MAX_NAMES_PER_REQUEST} de nume odată.` })
    .superRefine((names, ctx) => {
      const seen = new Set<string>();
      for (const name of names) {
        const key = studentNameKey(name);
        if (seen.has(key)) {
          ctx.addIssue({ code: 'custom', message: `Numele „${name}” apare de două ori în listă.` });
          return;
        }
        seen.add(key);
      }
    }),
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

// Extra teacher comments for the barem: the robot reads them as part of the
// barem, so the teacher need not replace the barem file.
export const MAX_BAREM_NOTES_LENGTH = 2000;

export const baremNotesBody = z.object({
  notes: z
    .string()
    .transform((raw) => raw.trim())
    .pipe(
      z
        .string()
        .max(MAX_BAREM_NOTES_LENGTH, { message: `Comentariile au cel mult ${MAX_BAREM_NOTES_LENGTH} de caractere.` }),
    ),
});

// Start evaluation: now (no `at`, or a time that has passed) or at a later time.
// `submissionIds` starts now only the selected uploads: the teacher grades
// 1-2 first, then the rest after reopening.
export const evaluateTestBody = z.object({
  at: z.iso.datetime({ message: 'Ora aleasă nu este validă.' }).optional(),
  submissionIds: z
    .array(z.number({ message: 'Alege lucrările din listă.' }).int().positive({ message: 'Alege lucrările din listă.' }))
    .min(1, { message: 'Selectează cel puțin o lucrare.' })
    .max(500, { message: 'Selectează cel mult 500 de lucrări.' })
    .optional(),
});

const PARALLEL_MESSAGE = `Alege între 1 și ${MAX_PARALLEL_AGENTS} lucrări corectate deodată.`;

const SHOW_MODEL_MESSAGE = 'Alege dacă se arată coloana Model.';

// Each field is optional: a request changes the settings it names.
export const updateSettingsBody = z
  .object({
    maxParallelAgents: z
      .number({ message: PARALLEL_MESSAGE })
      .int({ message: PARALLEL_MESSAGE })
      .min(1, { message: PARALLEL_MESSAGE })
      .max(MAX_PARALLEL_AGENTS, { message: PARALLEL_MESSAGE })
      .optional(),
    showModelColumn: z.boolean({ message: SHOW_MODEL_MESSAGE }).optional(),
  })
  // A body with no known field changes nothing: it is refused like a missing
  // number of uploads at a time.
  .refine((body) => body.maxParallelAgents !== undefined || body.showModelColumn !== undefined, { message: PARALLEL_MESSAGE });

const POINTS_MESSAGE = 'Scrie punctajul ca număr, de exemplu 2,5.';

// The grading that the teacher's page shows (`EvaluationInfo.gradedAt`). Ids of
// deleted rows come back, so a write from a page opened before a regrade or a
// reset names the grading it means, and changes nothing if it is gone.
const shownGrading = z.string({ message: 'Reîncarcă pagina.' });

// The teacher's correction of one graded item (spec §14.1). The server checks
// the points against the item's maximum with isValidCorrection().
export const correctItemBody = z
  .object({
    gradedAt: shownGrading,
    points: z.number({ message: POINTS_MESSAGE }).optional(),
    comment: z
      .string()
      .transform((raw) => raw.trim())
      .pipe(z.string().max(TEXT_LIMITS.comment, { message: `Comentariul are cel mult ${TEXT_LIMITS.comment} de caractere.` }))
      .optional(),
    // True: the teacher checked the item. False takes the check back.
    reviewed: z.boolean().optional(),
  })
  .refine((body) => body.points !== undefined || body.comment !== undefined || body.reviewed !== undefined, {
    message: 'Nu ai schimbat nimic.',
  });

export type ItemCorrection = z.output<typeof correctItemBody>;
// What a correction changes, without the grading it names.
export type ItemChange = Omit<ItemCorrection, 'gradedAt'>;

// The teacher checked the pages that the robot could not read (or takes it
// back), and the teacher's corrections of the final sections (Rezumat, Ce a
// lucrat bine, Recomandări). At least one field changes.
const feedbackEntry = (emptyMessage: string) =>
  z
    .string()
    .transform((raw) => raw.trim())
    .pipe(
      z
        .string()
        .min(1, { message: emptyMessage })
        .max(TEXT_LIMITS.listEntry, { message: `Fiecare punct are cel mult ${TEXT_LIMITS.listEntry} de caractere.` }),
    );

export const reviewPagesBody = z
  .object({
    gradedAt: shownGrading,
    pagesReviewed: z.boolean().optional(),
    summary: z
      .string()
      .transform((raw) => raw.trim())
      .pipe(
        z
          .string()
          .min(1, { message: 'Scrie rezumatul.' })
          .max(TEXT_LIMITS.summary, { message: `Rezumatul are cel mult ${TEXT_LIMITS.summary} de caractere.` }),
      )
      .optional(),
    strengths: z
      .array(feedbackEntry('Scrie punctul forte sau șterge rândul gol.'))
      .max(5, { message: 'Scrie cel mult 5 puncte la „Ce a lucrat bine”.' })
      .optional(),
    recommendations: z
      .array(feedbackEntry('Scrie recomandarea sau șterge rândul gol.'))
      .max(5, { message: 'Scrie cel mult 5 recomandări.' })
      .optional(),
  })
  .refine(
    (body) =>
      body.pagesReviewed !== undefined ||
      body.summary !== undefined ||
      body.strengths !== undefined ||
      body.recommendations !== undefined,
    { message: 'Nu ai schimbat nimic.' },
  );

export type PagesReview = z.output<typeof reviewPagesBody>;

// "Recorectează" on one upload: the grading the page shows goes.
export const regradeBody = z.object({ gradedAt: shownGrading });

// An action on one upload that does not need its grading (Resetează,
// Reîncearcă, publish or take back its result page, its result link): the
// page names the upload it shows by the time the upload started. That time is
// written once, and a new upload that got the id of a deleted one has a
// later time, so an old page changes nothing of another student.
export const shownUpload = z.object({ startedAt: z.string({ message: 'Reîncarcă pagina.' }) });

export type ShownUploadBody = z.output<typeof shownUpload>;

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
  // False when the student has a sent, grading or graded upload in this class's
  // tests: such a student can be marked as left but not deleted.
  canDelete: boolean;
}

export interface ClassDetail {
  class: ClassSummary;
  students: StudentRow[];
  tests: TestSummary[];
}

// A class the student is in, or was in (`active` false: the student left).
export interface StudentClass {
  id: number;
  name: string;
  schoolYear: number;
  active: boolean;
}

// One graded test of a student.
export interface StudentResult {
  submissionId: number;
  testCode: string;
  testTitle: string;
  className: string;
  schoolYear: number;
  // The date and hour of the test.
  date: string;
  // Out of 10.
  grade: number;
  // Items of the result that the teacher has not checked yet.
  flagCount: number;
}

// The student page (spec §9): every graded test of the student, in every
// class and school year, newest first.
export interface StudentHistory {
  student: { id: number; fullName: string };
  classes: StudentClass[];
  results: StudentResult[];
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
  // Items to check in all graded uploads, counted as in the uploads table.
  flagCount: number;
  // Whether students can open their result pages for this test.
  resultsOpen: boolean;
  // Uploads whose result page the teacher published one by one.
  publishedCount: number;
  // A finished test the teacher put away; only a done test can be archived.
  archived: boolean;
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

// One exercise of a graded student in the class report.
export interface ReportItem {
  exerciseId: string;
  points: number;
  maxPoints: number;
  // An item to check that the teacher has not checked yet.
  flagged: boolean;
}

// One graded student in the class report (spec §14.2). `active`: the student
// is still an active student of the class; a graded student who left the class
// keeps the row, but is not counted among the class's students.
export interface ReportRow {
  submissionId: number;
  studentId: number;
  studentName: string;
  active: boolean;
  total: number;
  maxTotal: number;
  // Out of 10.
  grade: number;
  // Items to check that the teacher has not checked yet, plus one for pages
  // that could not be read.
  flagCount: number;
  items: ReportItem[];
}

// An active student of the class with no graded result, and why.
export interface ReportMissing {
  studentId: number;
  studentName: string;
  status: UploadStatus;
}

// The class report of a test (spec §14.2). The statistics come from
// `classStats` (shared/stats.ts), in the browser.
export interface ClassReport {
  test: { code: string; title: string; className: string; status: TestStatus; startedAt: string | null };
  // The exercises of the test, in barem order.
  exercises: { id: string; label: string; maxPoints: number }[];
  rows: ReportRow[];
  missing: ReportMissing[];
  analysis: AnalysisInfo & { content: ClassAnalysis | null };
}

// The class analysis as the test page sees it. `stale`: grades changed after
// the analysis was written. `attempts`: failed attempts of the robot so far; a
// requested analysis with attempts left waits for the next run.
export interface AnalysisInfo {
  status: AnalysisStatus;
  stale: boolean;
  attempts: number;
}

// "Regenerează": the analysis is asked for again. `robot` says whether the
// robot was started.
export interface AnalysisAnswer {
  analysis: AnalysisInfo;
  robot: RobotStart;
}

export interface TestInfo extends TestSummary {
  uploadToken: string | null;
  multiUploadToken: string | null;
  files: Record<TestFileKind, TestFileInfo | null>;
  exerciseList: ExerciseListInfo;
  // Extra teacher comments for the barem, read by the robot as part of it.
  baremNotes: string;
  analysis: AnalysisInfo;
}

// The model and effort of the latest grading and of the latest class
// analysis. Null: none yet, or made before the settings were kept.
export interface RobotSettings {
  gradingModel: string | null;
  gradingEffort: string | null;
  analysisModel: string | null;
  analysisEffort: string | null;
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
  // The grading the row shows (`EvaluationInfo.gradedAt`), once graded.
  gradedAt: string | null;
  // The secret of the student's result page. Null until the upload has one
  // (older uploads get it when the teacher asks for the link).
  resultToken: string | null;
  // Whether this student can open the result page: the test keeps results
  // open for all, or the teacher published this upload alone.
  resultsOpen: boolean;
  // Items to check that the teacher has not checked yet, plus one for pages
  // that could not be read.
  flagCount: number;
  // The model and effort of this upload's grading; null while it has none.
  model: string | null;
  effort: string | null;
  // Why grading failed, for the teacher.
  lastError: string | null;
}

export interface TestDetail {
  test: TestInfo;
  uploads: UploadRow[];
  // The Setări checkbox: the uploads table shows its Model column.
  showModel: boolean;
  // For the robot line: when the robot last looked for work. startFailed:
  // GitHub did not take the last request to start the robot, and no run
  // checked in after it or works now.
  robot: { lastCheckAt: string | null; startFailed: boolean };
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
  // Over all this teacher's tests.
  lastModels: RobotSettings;
  // Whether the uploads table of the test page has the Model column.
  showModelColumn: boolean;
  // The model and effort the robot said it is set to use, and when it said so.
  configuredModel: string | null;
  configuredEffort: string | null;
  configuredAt: string | null;
}

// Start test: the link is /u/<uploadToken>.
export interface StartedTest {
  status: TestStatus;
  uploadToken: string;
  startedAt: string;
}

// The link that uploads for many students on one phone: /u/<multiUploadToken>.
export interface MultiUploadLink {
  multiUploadToken: string;
}

// "dispatched": the robot was asked to start at once. "next_check": GitHub did
// not take the request, and the work waits for the robot's next run. Its
// 10-minute schedule does not fire (docs/deploy.md): that run starts by hand.
export type RobotStart = 'dispatched' | 'next_check';

// "Pornește robotul" on a test in evaluation whose work waits.
export interface RobotStartAnswer {
  robot: RobotStart;
}

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

// "Recorectează": how many uploads wait for the robot again. `robot` is null
// while the test is open: they are graded after Start evaluation.
export interface RegradeAnswer {
  count: number;
  testStatus: TestStatus;
  robot: RobotStart | null;
}

// New barem comments: `robot` is set when new notes need a new exercise
// list while the test is in evaluation, and null otherwise.
export interface BaremNotesAnswer {
  baremNotes: string;
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
// `multi` is true for the link that uploads for many students on one phone:
// it never locks after one upload. The default link locks after one upload.
export interface LinkInfo {
  test: { code: string; title: string; className: string; status: TestStatus };
  students: LinkStudent[];
  multi: boolean;
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

// "Am trimis tot": how many files were sent, and the secret of the student's
// result page. The phone keeps the result link and shows it to the student.
export interface ConfirmAnswer {
  fileCount: number;
  resultToken: string;
}

// One exercise of a graded upload. `aiPoints` are the robot's points;
// `points` are the final points, which the teacher may change.
export interface EvaluationItemInfo {
  id: number;
  exerciseId: string;
  label: string;
  maxPoints: number;
  aiPoints: number;
  points: number;
  studentAnswer: string;
  comment: string;
  confidence: Confidence;
  // The robot asked the teacher to check this item, and why.
  needsReview: boolean;
  reviewReason: string;
  // The teacher marked the item as checked.
  reviewed: boolean;
  changedByTeacher: boolean;
}

// The graded result of an upload (spec §14.1).
export interface EvaluationInfo {
  // When the robot wrote this result. The teacher's corrections send it back.
  gradedAt: string;
  maxTotal: number;
  officePoints: number;
  total: number;
  // Out of 10.
  grade: number;
  summary: string;
  strengths: string[];
  recommendations: string[];
  // Pages the robot could not read, as the robot named them ("student/page-02.jpg").
  unreadable: string[];
  // The teacher checked those pages.
  pagesReviewed: boolean;
  // Items to check that the teacher has not checked yet, plus one for pages
  // that could not be read and are not checked yet.
  flagCount: number;
  items: EvaluationItemInfo[];
}

export interface SubmissionDetail {
  id: number;
  testCode: string;
  testTitle: string;
  testStatus: TestStatus;
  studentId: number;
  studentName: string;
  status: Exclude<UploadStatus, 'none'>;
  autoSubmitted: boolean;
  startedAt: string;
  submittedAt: string | null;
  // Why grading failed, for the teacher.
  lastError: string | null;
  files: SubmissionFile[];
  // Null until the upload is graded.
  evaluation: EvaluationInfo | null;
  // The secret of the student's result page. Null until the upload has one.
  resultToken: string | null;
  // Whether students can open their result pages for this test.
  resultsOpen: boolean;
}

// One exercise as the student sees it: no grading internals.
export interface StudentResultItem {
  exerciseId: string;
  label: string;
  maxPoints: number;
  points: number;
  studentAnswer: string;
  comment: string;
}

// The graded result as the student sees it: no confidence, no checks.
export interface StudentEvaluation {
  maxTotal: number;
  officePoints: number;
  total: number;
  // Out of 10.
  grade: number;
  summary: string;
  strengths: string[];
  recommendations: string[];
  items: StudentResultItem[];
}

// One student's result page. `evaluation` is null until the upload is graded.
export interface StudentResultView {
  testCode: string;
  testTitle: string;
  className: string;
  studentName: string;
  status: Exclude<UploadStatus, 'none'>;
  files: SubmissionFile[];
  evaluation: StudentEvaluation | null;
}

// The teacher's link to one student's result page.
export interface ResultLinkAnswer {
  resultToken: string;
}

// Opening or closing the result pages of a test for all students.
export interface ResultsOpenAnswer {
  resultsOpen: boolean;
}

// The path of a student's result page, under the student app.
export function studentResultPath(resultToken: string): string {
  return `/u/rezultat/${resultToken}`;
}
