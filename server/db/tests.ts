import type { D1Database } from '@cloudflare/workers-types';
import type {
  AnalysisInfo,
  BaremRequest,
  CesVariantInfo,
  ExerciseListInfo,
  PrintStatus,
  ReviewPoint,
  TestInfo,
  TestSummary,
  UploadRow,
  UploadStatus,
} from '../../shared/api.ts';
import { DOCX_TYPE, type TestFileKind, type TestVariant } from '../../shared/files.ts';
import { QUICK_TRY_FILE_CHANGES } from '../../shared/quickTry.ts';
import { averageGrade } from '../../shared/stats.ts';
import { compareStudentNames } from '../../shared/students.ts';
import type { DetectedSubject, SubjectInfo } from '../../shared/subjects.ts';
import { type AnalysisStatus, buildTestCode, type ExerciseListStatus, type TestStatus } from '../../shared/tests.ts';
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';
import { newUploadToken } from '../secrets.ts';
import { flagCountSql } from './evaluations.ts';
import { onlyTestSql } from './lifecycle.ts';
import { baremStatuses, columns, needsBaremSql, needsPrintSql, noCesGradingSql, paperVariantSql } from './variant.ts';

export interface StoredFile {
  key: string;
  name: string;
  type: string;
}

// What each variant of a test has of its own: the files, the barem comments,
// the barem's state, the exercise list and the print PDF, with their R2 keys.
export interface VariantRecord {
  files: Record<TestFileKind, StoredFile | null>;
  exerciseList: ExerciseListInfo;
  baremNotes: string;
  barem: { request: BaremRequest; unchecked: boolean };
  filesVersion: number;
  print: { status: PrintStatus; key: string | null; fromWord: boolean };
}

// A test as the API works with it: the summary the browser sees, plus its
// database id and the R2 keys of its files. The class variant's parts are at
// the top; the CES variant's are in `ces`.
export interface TestRecord extends VariantRecord {
  id: number;
  summary: TestSummary;
  uploadToken: string | null;
  multiUploadToken: string | null;
  analysis: AnalysisInfo;
  // Null until the robot finds it or the teacher sets it.
  subject: SubjectInfo | null;
  ces: VariantRecord & {
    studentCount: number;
    off: boolean;
    papers: number;
    waiting: number;
    // CES papers the robot is grading now: their files must not change.
    grading: number;
    totalPoints: number | null;
    classTotalPoints: number | null;
  };
}

// The parts of one variant of a test.
export function variantOf(record: TestRecord, variant: TestVariant): VariantRecord {
  return variant === 'ces' ? record.ces : record;
}

interface TestRow {
  id: number;
  code: string;
  title: string;
  status: TestStatus;
  class_id: number;
  class_name: string;
  school_year: number;
  created_at: string;
  started_at: string | null;
  evaluation_at: string | null;
  evaluation_started_at: string | null;
  upload_token: string | null;
  multi_upload_token: string | null;
  test_file_key: string | null;
  test_file_name: string | null;
  test_file_type: string | null;
  barem_file_key: string | null;
  barem_file_name: string | null;
  barem_file_type: string | null;
  barem_notes: string | null;
  barem_request: BaremRequest;
  barem_unchecked: number;
  files_version: number;
  exercise_list_status: ExerciseListStatus;
  exercise_list_message: string | null;
  results_open: number;
  archived: number;
  published_count: number;
  analysis_status: AnalysisStatus;
  analysis_stale: number;
  analysis_attempts: number;
  print_status: PrintStatus;
  print_file_key: string | null;
  subject: DetectedSubject | null;
  subject_name: string;
  subject_by: 'robot' | 'teacher' | null;
  ces_test_file_key: string | null;
  ces_test_file_name: string | null;
  ces_test_file_type: string | null;
  ces_barem_file_key: string | null;
  ces_barem_file_name: string | null;
  ces_barem_file_type: string | null;
  ces_barem_notes: string | null;
  ces_barem_request: BaremRequest;
  ces_barem_unchecked: number;
  ces_files_version: number;
  ces_exercise_list_status: ExerciseListStatus;
  ces_exercise_list_message: string | null;
  ces_print_status: PrintStatus;
  ces_print_file_key: string | null;
  ces_off: number;
  ces_total_points: number | null;
  class_total_points: number | null;
  ces_student_count: number;
  ces_papers: number;
  ces_waiting: number;
  ces_grading: number;
  student_count: number;
  submitted_count: number;
  graded_count: number;
  flag_count: number;
  grades_json: string;
}

const SELECT_TEST = `
  SELECT t.id, t.code, t.title, t.status, t.class_id, c.name AS class_name, c.school_year,
    t.created_at, t.started_at, t.evaluation_at, t.evaluation_started_at, t.upload_token, t.multi_upload_token,
    t.test_file_key, t.test_file_name, t.test_file_type,
    t.barem_file_key, t.barem_file_name, t.barem_file_type, t.barem_notes, t.barem_request, t.barem_unchecked, t.files_version, t.exercise_list_status, t.exercise_list_message,
    t.results_open, t.archived, t.analysis_status, t.analysis_stale, t.analysis_attempts,
    t.print_status, t.print_file_key, t.subject, t.subject_name, t.subject_by,
    t.ces_test_file_key, t.ces_test_file_name, t.ces_test_file_type,
    t.ces_barem_file_key, t.ces_barem_file_name, t.ces_barem_file_type, t.ces_barem_notes, t.ces_barem_request, t.ces_barem_unchecked,
    t.ces_files_version, t.ces_exercise_list_status, t.ces_exercise_list_message, t.ces_print_status, t.ces_print_file_key, t.ces_off,
    json_extract(t.ces_exercise_list_json, '$.totalPoints') AS ces_total_points,
    json_extract(t.exercise_list_json, '$.totalPoints') AS class_total_points,
    (SELECT json_object('all', COUNT(*), 'ces', COALESCE(SUM(st.ces = 1), 0))
       FROM enrollments e JOIN students st ON st.id = e.student_id
       WHERE e.class_id = t.class_id AND e.active = 1) AS students_json,
    (SELECT json_object(
         'cesPapers', COALESCE(SUM(s.variant = 'ces'), 0),
         'cesWaiting', COALESCE(SUM(CASE WHEN s.status IN ('submitted', 'grading') THEN ${paperVariantSql('s', 't')} = 'ces' ELSE 0 END), 0),
         'cesGrading', COALESCE(SUM(s.status = 'grading' AND s.variant = 'ces'), 0),
         'submitted', COALESCE(SUM(s.status <> 'uploading'), 0),
         'graded', COALESCE(SUM(s.status = 'graded'), 0),
         'published', COALESCE(SUM(s.results_open = 1), 0))
       FROM submissions s WHERE s.test_id = t.id) AS papers_json,
    (SELECT json_object(
         'flags', COALESCE(SUM(${flagCountSql('ev')}), 0),
         'grades', json(json_group_array(ev.grade) FILTER (WHERE s.status = 'graded')))
       FROM evaluations ev JOIN submissions s ON s.id = ev.submission_id WHERE s.test_id = t.id) AS gradings_json
  FROM tests t JOIN classes c ON c.id = t.class_id`;

// Each count of a test comes from one pass over its table: D1 bills every row
// read, and the tests list is read again every minute while a page is open.
interface SelectedTestRow extends Omit<TestRow, CountColumn> {
  students_json: string;
  papers_json: string;
  gradings_json: string;
}

type CountColumn =
  | 'ces_student_count'
  | 'ces_papers'
  | 'ces_waiting'
  | 'ces_grading'
  | 'student_count'
  | 'submitted_count'
  | 'graded_count'
  | 'published_count'
  | 'flag_count'
  | 'grades_json';

function withCounts(row: SelectedTestRow): TestRow {
  const { students_json, papers_json, gradings_json, ...rest } = row;
  const students = JSON.parse(students_json) as { all: number; ces: number };
  const papers = JSON.parse(papers_json) as Record<'cesPapers' | 'cesWaiting' | 'cesGrading' | 'submitted' | 'graded' | 'published', number>;
  const gradings = JSON.parse(gradings_json) as { flags: number; grades: number[] | null };
  return {
    ...rest,
    ces_student_count: students.ces,
    ces_papers: papers.cesPapers,
    ces_waiting: papers.cesWaiting,
    ces_grading: papers.cesGrading,
    student_count: students.all,
    submitted_count: papers.submitted,
    graded_count: papers.graded,
    published_count: papers.published,
    flag_count: gradings.flags,
    grades_json: JSON.stringify(gradings.grades ?? []),
  };
}

function storedFile(key: string | null, name: string | null, type: string | null): StoredFile | null {
  return key && name && type ? { key, name, type } : null;
}

function toRecord(row: TestRow): TestRecord {
  const barem = { request: row.barem_request, unchecked: row.barem_unchecked === 1 };
  return {
    id: row.id,
    summary: {
      code: row.code,
      title: row.title,
      status: row.status,
      classId: row.class_id,
      className: row.class_name,
      schoolYear: row.school_year,
      createdAt: row.created_at,
      startedAt: row.started_at,
      evaluationAt: row.evaluation_at,
      evaluationStartedAt: row.evaluation_started_at,
      studentCount: row.student_count,
      submittedCount: row.submitted_count,
      gradedCount: row.graded_count,
      flagCount: row.flag_count,
      resultsOpen: row.results_open === 1,
      publishedCount: row.published_count,
      archived: row.archived === 1,
      barem,
      prepared: {
        testFile: row.test_file_key !== null,
        baremFile: row.barem_file_key !== null,
        print: row.print_status,
        uploadLink: row.upload_token !== null,
        ces: {
          wanted: row.ces_student_count > 0 && row.ces_off === 0,
          testFile: row.ces_test_file_key !== null,
          baremFile: row.ces_barem_file_key !== null,
          baremRequest: row.ces_barem_request,
        },
      },
      cesBarem:
        row.ces_test_file_key === null
          ? null
          : {
              request: row.ces_barem_request,
              unchecked: row.ces_barem_unchecked === 1,
              missing: row.ces_barem_file_key === null && row.ces_waiting > 0,
            },
      // The grades of the class report's rows, averaged the same way.
      averageGrade: averageGrade(JSON.parse(row.grades_json) as number[]),
    },
    uploadToken: row.upload_token,
    multiUploadToken: row.multi_upload_token,
    files: {
      test: storedFile(row.test_file_key, row.test_file_name, row.test_file_type),
      barem: storedFile(row.barem_file_key, row.barem_file_name, row.barem_file_type),
    },
    exerciseList: { status: row.exercise_list_status, message: row.exercise_list_message },
    baremNotes: row.barem_notes ?? '',
    barem,
    filesVersion: row.files_version,
    analysis: { status: row.analysis_status, stale: row.analysis_stale === 1, attempts: row.analysis_attempts },
    print: { status: row.print_status, key: row.print_file_key, fromWord: row.test_file_type === DOCX_TYPE },
    subject: row.subject === null ? null : { value: row.subject, name: row.subject_name, by: row.subject_by ?? 'robot' },
    ces: {
      files: {
        test: storedFile(row.ces_test_file_key, row.ces_test_file_name, row.ces_test_file_type),
        barem: storedFile(row.ces_barem_file_key, row.ces_barem_file_name, row.ces_barem_file_type),
      },
      exerciseList: { status: row.ces_exercise_list_status, message: row.ces_exercise_list_message },
      baremNotes: row.ces_barem_notes ?? '',
      barem: { request: row.ces_barem_request, unchecked: row.ces_barem_unchecked === 1 },
      filesVersion: row.ces_files_version,
      print: { status: row.ces_print_status, key: row.ces_print_file_key, fromWord: row.ces_test_file_type === DOCX_TYPE },
      studentCount: row.ces_student_count,
      off: row.ces_off === 1,
      papers: row.ces_papers,
      waiting: row.ces_waiting,
      grading: row.ces_grading,
      totalPoints: row.ces_total_points,
      classTotalPoints: row.class_total_points,
    },
  };
}

const fileInfo = (file: StoredFile | null) => (file ? { name: file.name, type: file.type } : null);

// What the teacher app sees of the CES variant: no R2 keys.
export function toCesInfo(ces: TestRecord['ces']): CesVariantInfo {
  return {
    studentCount: ces.studentCount,
    off: ces.off,
    files: { test: fileInfo(ces.files.test), barem: fileInfo(ces.files.barem) },
    baremNotes: ces.baremNotes,
    barem: ces.barem,
    filesVersion: ces.filesVersion,
    exerciseList: ces.exerciseList,
    print: { status: ces.print.status, fromWord: ces.print.fromWord },
    papers: ces.papers,
    waiting: ces.waiting,
    totalPoints: ces.totalPoints,
    classTotalPoints: ces.classTotalPoints,
  };
}

// What the teacher app sees of a test: no R2 keys.
export function toTestInfo(record: TestRecord): TestInfo {
  return {
    ...record.summary,
    uploadToken: record.uploadToken,
    multiUploadToken: record.multiUploadToken,
    files: { test: fileInfo(record.files.test), barem: fileInfo(record.files.barem) },
    exerciseList: record.exerciseList,
    baremNotes: record.baremNotes,
    barem: record.barem,
    filesVersion: record.filesVersion,
    analysis: record.analysis,
    print: { status: record.print.status, fromWord: record.print.fromWord },
    subject: record.subject,
    ces: toCesInfo(record.ces),
  };
}

// Tests of the teacher's classes in one school year, newest first.
export async function listTests(db: D1Database, teacherId: number, schoolYear: number): Promise<TestSummary[]> {
  const { results } = await db
    .prepare(`${SELECT_TEST} WHERE t.teacher_id = ? AND c.school_year = ? ORDER BY t.created_at DESC, t.id DESC`)
    .bind(teacherId, schoolYear)
    .all<SelectedTestRow>();
  return results.map((row) => toRecord(withCounts(row)).summary);
}

// Tests of one class, newest first.
export async function listClassTests(db: D1Database, teacherId: number, classId: number): Promise<TestSummary[]> {
  const { results } = await db
    .prepare(`${SELECT_TEST} WHERE t.teacher_id = ? AND t.class_id = ? ORDER BY t.number DESC`)
    .bind(teacherId, classId)
    .all<SelectedTestRow>();
  return results.map((row) => toRecord(withCounts(row)).summary);
}

export async function findTest(db: D1Database, teacherId: number, code: string): Promise<TestRecord | null> {
  const row = await db.prepare(`${SELECT_TEST} WHERE t.teacher_id = ? AND t.code = ?`).bind(teacherId, code).first<SelectedTestRow>();
  return row ? toRecord(withCounts(row)) : null;
}

export async function requireTest(db: D1Database, teacherId: number, code: string): Promise<TestRecord> {
  const record = await findTest(db, teacherId, code);
  if (!record) throw notFound();
  return record;
}

interface UploadSqlRow {
  student_id: number;
  full_name: string;
  active: number;
  ces: number;
  variant: TestVariant | null;
  submission_id: number | null;
  status: UploadStatus | null;
  started_at: string | null;
  submitted_at: string | null;
  auto_submitted: number | null;
  last_error: string | null;
  grade: number | null;
  total: number | null;
  max_total: number | null;
  graded_at: string | null;
  model: string | null;
  effort: string | null;
  result_token: string | null;
  submission_open: number | null;
  test_open: number;
  file_count: number;
  unreadable_json: string | null;
  pages_reviewed_at: string | null;
  flag_count: number;
}

interface PointSqlRow {
  submission_id: number;
  id: number;
  exercise_id: string;
  label: string;
  points: number;
  max_points: number;
  review_reason: string;
}

// The uploads table in one round trip: every active student of the class, and
// any student who left the class after starting an upload, sorted by name;
// and the points to check of each paper, counted as flagCountSql counts them.
export async function listUploads(db: D1Database, testId: number, classId: number): Promise<UploadRow[]> {
  const [uploads, points] = await db.batch<UploadSqlRow | PointSqlRow>([
    db
      .prepare(
        `SELECT st.id AS student_id, st.full_name, e.active, st.ces, s.variant,
           s.id AS submission_id, s.status, s.started_at, s.submitted_at, s.auto_submitted, s.last_error, ev.grade, ev.total, ev.max_total, ev.created_at AS graded_at, ev.model, ev.effort,
           s.result_token, s.results_open AS submission_open, (SELECT t.results_open FROM tests t WHERE t.id = ?) AS test_open,
           (SELECT COUNT(*) FROM submission_files f WHERE f.submission_id = s.id) AS file_count,
           ev.unreadable_json, ev.pages_reviewed_at,
           ${flagCountSql('ev')} AS flag_count
         FROM enrollments e
         JOIN students st ON st.id = e.student_id
         LEFT JOIN submissions s ON s.test_id = ? AND s.student_id = e.student_id
         LEFT JOIN evaluations ev ON ev.submission_id = s.id
         WHERE e.class_id = ? AND (e.active = 1 OR s.id IS NOT NULL)`,
      )
      .bind(testId, testId, classId),
    db
      .prepare(
        `SELECT ev.submission_id, i.id, i.exercise_id, i.label, i.points, i.max_points, i.review_reason
         FROM evaluation_items i
         JOIN evaluations ev ON ev.id = i.evaluation_id
         JOIN submissions s ON s.id = ev.submission_id
         WHERE s.test_id = ? AND i.needs_review = 1 AND i.reviewed_at IS NULL
         ORDER BY i.position, i.id`,
      )
      .bind(testId),
  ]);
  const itemsOf = new Map<number, ReviewPoint[]>();
  for (const row of (points?.results ?? []) as PointSqlRow[]) {
    const list = itemsOf.get(row.submission_id) ?? [];
    list.push({
      kind: 'item',
      itemId: row.id,
      exerciseId: row.exercise_id,
      label: row.label,
      points: row.points,
      maxPoints: row.max_points,
      reason: row.review_reason,
    });
    itemsOf.set(row.submission_id, list);
  }
  const pointsOf = (row: UploadSqlRow): ReviewPoint[] => {
    if (row.submission_id === null) return [];
    const pages = row.unreadable_json === null ? [] : (JSON.parse(row.unreadable_json) as string[]);
    const items = itemsOf.get(row.submission_id) ?? [];
    return pages.length > 0 && row.pages_reviewed_at === null ? [{ kind: 'pages', pages }, ...items] : items;
  };
  return ((uploads?.results ?? []) as UploadSqlRow[])
    .map((row) => ({
      studentId: row.student_id,
      studentName: row.full_name,
      active: row.active === 1,
      submissionId: row.submission_id,
      status: row.status ?? 'none',
      fileCount: row.file_count,
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
      autoSubmitted: row.auto_submitted === 1,
      grade: row.grade,
      total: row.total,
      maxTotal: row.max_total,
      gradedAt: row.graded_at,
      model: row.model,
      effort: row.effort,
      resultToken: row.result_token,
      resultsOpen: row.submission_id !== null && (row.test_open === 1 || row.submission_open === 1),
      flagCount: row.flag_count,
      reviewPoints: pointsOf(row),
      lastError: row.last_error,
      ces: row.ces === 1,
      variant: row.variant,
    }))
    .sort((a, b) => compareStudentNames(a.studentName, b.studentName));
}

const MAX_CODE_TRIES = 3;

// Makes a draft test with the class's next number, for example "6E2-26T3",
// and its upload link: the print PDF carries the link's QR code, so the
// teacher can print the test before she starts it. The number and the code are
// unique, so a test made at the same moment, or a class that had this name
// before a rename, can already hold them: the counter then moves past that
// number and the next try takes a new one (and a new link). At most 12 queries.
export async function createTest(db: D1Database, teacherId: number, classId: number, title: string, now: string, cesOff = false): Promise<string> {
  for (let attempt = 1; attempt <= MAX_CODE_TRIES; attempt++) {
    const cls = await db
      .prepare('SELECT name, school_year, next_test_number, archived FROM classes WHERE id = ? AND teacher_id = ?')
      .bind(classId, teacherId)
      .first<{ name: string; school_year: number; next_test_number: number; archived: number }>();
    if (!cls) throw notFound();
    if (cls.archived === 1) {
      throw new ApiError(409, 'class_archived', 'Clasa este arhivată. Scoate-o din arhivă ca să faci un test nou.');
    }
    const number = cls.next_test_number;
    const code = buildTestCode(cls.name, cls.school_year, number);
    try {
      await db.batch([
        db
          .prepare(
            'INSERT INTO tests (teacher_id, class_id, number, code, title, upload_token, ces_off, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .bind(teacherId, classId, number, code, title, newUploadToken(), cesOff ? 1 : 0, now, now),
        db.prepare('UPDATE classes SET next_test_number = ? WHERE id = ? AND teacher_id = ?').bind(number + 1, classId, teacherId),
      ]);
      return code;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      await db
        .prepare('UPDATE classes SET next_test_number = ? WHERE id = ? AND teacher_id = ? AND next_test_number <= ?')
        .bind(number + 1, classId, teacherId, number)
        .run();
    }
  }
  throw new ApiError(409, 'busy', 'Nu am putut alege un cod pentru test. Încearcă din nou.');
}

export async function renameTest(db: D1Database, teacherId: number, code: string, title: string, now: string): Promise<boolean> {
  const row = await db
    .prepare('UPDATE tests SET title = ?, updated_at = ? WHERE teacher_id = ? AND code = ? RETURNING id')
    .bind(title, now, teacherId, code)
    .first<{ id: number }>();
  return row !== null;
}

// draft → open: students can upload from now on, and now is the test's date.
// The test keeps the link it got when it was made, so the printed QR code
// works; a draft made before tests got their link at once gets `uploadToken`.
// Null when the test is no longer a draft.
export async function startTest(
  db: D1Database,
  teacherId: number,
  testId: number,
  uploadToken: string,
  now: string,
): Promise<{ uploadToken: string; startedAt: string } | null> {
  const row = await db
    .prepare(
      `UPDATE tests SET status = 'open', archived = 0, upload_token = COALESCE(upload_token, ?), started_at = ?, updated_at = ?
       WHERE id = ? AND teacher_id = ? AND status = 'draft'
       RETURNING upload_token, started_at`,
    )
    .bind(uploadToken, now, now, testId, teacherId)
    .first<{ upload_token: string; started_at: string }>();
  return row ? { uploadToken: row.upload_token, startedAt: row.started_at } : null;
}

// No file of a student in the test: an upload with a file, sent or not, is
// the student's work. On the alias tests.
const NO_STUDENT_FILES = `NOT EXISTS (SELECT 1 FROM submissions s JOIN submission_files f ON f.submission_id = s.id WHERE s.test_id = tests.id)
  AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = tests.id AND s.status <> 'uploading')`;

// "Oprește testul": open → draft, for a test started by mistake (on the wrong
// day). The date goes, and so does a scheduled evaluation; the link stays, so
// the printed QR code works when the test starts again. Only while no student
// has uploaded a file and the test was never evaluated (a test reopened after
// an evaluation was not started by mistake), checked in the write itself: a
// file that lands at the same moment either comes first and keeps the test
// open, or finds it no longer open. Uploads with no file stay and go on at the
// next start. False when the test is gone, is not the teacher's, is not open,
// was evaluated, or holds a student's file.
export async function stopTest(db: D1Database, teacherId: number, testId: number, now: string): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE tests SET status = 'draft', started_at = NULL, evaluation_at = NULL, updated_at = ?
       WHERE id = ? AND teacher_id = ? AND status = 'open' AND evaluation_started_at IS NULL AND ${NO_STUDENT_FILES}
       RETURNING id`,
    )
    .bind(now, testId, teacherId)
    .first<{ id: number }>();
  return row !== null;
}

// True when a student has uploaded a file to the test.
export async function hasStudentFiles(db: D1Database, testId: number): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS found FROM tests WHERE id = ? AND NOT (${NO_STUDENT_FILES})`).bind(testId).first();
  return row !== null;
}

// The link that uploads for many students on one phone. Made only when the
// teacher asks for it, on a test that already started. Returns the kept link
// when it already exists, so the button stays safe to press twice.
export async function createMultiUploadToken(
  db: D1Database,
  teacherId: number,
  testId: number,
  uploadToken: string,
  now: string,
): Promise<{ multiUploadToken: string } | null> {
  const kept = await db
    .prepare('SELECT multi_upload_token FROM tests WHERE id = ? AND teacher_id = ? AND status <> ?')
    .bind(testId, teacherId, 'draft')
    .first<{ multi_upload_token: string | null }>();
  if (!kept) return null;
  if (kept.multi_upload_token) return { multiUploadToken: kept.multi_upload_token };
  const row = await db
    .prepare(
      `UPDATE tests SET multi_upload_token = ?, updated_at = ?
       WHERE id = ? AND teacher_id = ? AND status <> ? AND multi_upload_token IS NULL
       RETURNING multi_upload_token`,
    )
    .bind(uploadToken, now, testId, teacherId, 'draft')
    .first<{ multi_upload_token: string }>();
  return row ? { multiUploadToken: row.multi_upload_token } : null;
}

// evaluating or done → open (spec §8.5). Graded results stay; a scheduled
// evaluation is cancelled; a ready analysis is marked as possibly out of date.
// A test that leaves done also leaves the archive.
// An upload that a run is grading goes back to the queue: that run's result is
// then refused, and a later run grades the upload after the next Start
// evaluation, with the files of that time. False when the test was not closed.
export async function reopenTest(db: D1Database, teacherId: number, testId: number, now: string): Promise<boolean> {
  const [reopened] = await db.batch<{ id: number }>([
    db
      .prepare(
        `UPDATE tests SET status = 'open', archived = 0, evaluation_at = NULL, updated_at = ?,
           analysis_stale = CASE WHEN analysis_status = 'ready' THEN 1 ELSE analysis_stale END
         WHERE id = ? AND teacher_id = ? AND status IN ('evaluating', 'done')
         RETURNING id`,
      )
      .bind(now, testId, teacherId),
    // Only an open test of this teacher: no upload is in grading while a test is open, except after a reopen.
    // The upload keeps the id of the run it was taken from: that run never claims it again (claimSubmission).
    db
      .prepare(
        `UPDATE submissions SET status = 'submitted'
         WHERE test_id = ? AND status = 'grading'
           AND EXISTS (SELECT 1 FROM tests t WHERE t.id = ? AND t.teacher_id = ? AND t.status = 'open')`,
      )
      .bind(testId, testId, teacherId),
  ]);
  return Boolean(reopened?.results.length);
}

// Archives a finished test, or takes any test out of the archive. The archive
// accepts only a done test, checked in the statement itself, and closes every
// result page of the test (for all, and for single students): an archived
// test's results are closed unless the teacher publishes them again. Taking a
// test out of the archive opens nothing. Returns the new mark, or null when
// nothing changed: the test is gone, is not the teacher's, or (to archive) is
// not done.
export async function setTestArchived(
  db: D1Database,
  teacherId: number,
  testId: number,
  archived: boolean,
  now: string,
): Promise<boolean | null> {
  if (!archived) {
    const row = await db
      .prepare('UPDATE tests SET archived = 0, updated_at = ? WHERE id = ? AND teacher_id = ? RETURNING archived')
      .bind(now, testId, teacherId)
      .first<{ archived: number }>();
    return row ? row.archived === 1 : null;
  }
  // The pages close only once the test is archived, so a refused archive
  // closes nothing.
  const [test] = await db.batch<{ archived: number }>([
    db
      .prepare(
        "UPDATE tests SET archived = 1, results_open = 0, updated_at = ? WHERE id = ? AND teacher_id = ? AND status = 'done' RETURNING archived",
      )
      .bind(now, testId, teacherId),
    db
      .prepare(
        `UPDATE submissions SET results_open = 0 WHERE test_id = ? AND results_open = 1
          AND EXISTS (SELECT 1 FROM tests t WHERE t.id = ? AND t.teacher_id = ? AND t.archived = 1)`,
      )
      .bind(testId, testId, teacherId),
  ]);
  const row = test?.results[0];
  return row ? row.archived === 1 : null;
}

// Points the test at a new test or barem file of the variant, and counts the
// change in the variant's files_version. A new test file also clears the print
// PDF made from the old one, and gives `uploadToken` to a draft made before
// tests got their link at once (every other test has its link), so its print
// PDF waits for the robot. A new barem also clears the exercise list, which
// the robot made from the old one (spec §8.5). Returns the test's status, the
// key of the print PDF the change cleared, and the key of the file it replaced
// (the caller deletes their objects), or null when the test is gone. The keys
// are read in the same batch as the write, so a print or a generated barem the
// robot saves meanwhile is not left in R2.
// A Quick Try test (table tests) changes its files at most
// QUICK_TRY_FILE_CHANGES times: each change can make robot work.
const QUICK_TRY_FILES_LEFT = `(quick_try = 0 OR files_version < ${QUICK_TRY_FILE_CHANGES})`;

// The SET part that forgets a subject the robot found; the teacher's stays.
// A subject found with an exercise list stays with that list, which a new test
// file does not reset. A list that failed because the robot found a subject
// not graded (`alta`) waits again, so the robot reads the new file, except:
// the teacher set `alta` (reading again changes nothing), the test is a Quick
// Try (it ended, and gave its place back), or the test is of a demo account
// whose one test is now another (ONLY_TEST: its papers would be graded with no
// start). SQLite reads every right side before it writes, so all of them see
// the old row.
const ENDED_UNSUPPORTED = "exercise_list_status = 'failed' AND subject = 'alta'";
const MAY_READ_AGAIN = `(subject_by = 'robot' AND quick_try = 0 AND ${onlyTestSql('tests')})`;
const READ_AGAIN = `(${ENDED_UNSUPPORTED} AND ${MAY_READ_AGAIN})`;
const STAYS_UNSUPPORTED = `(${ENDED_UNSUPPORTED} AND NOT ${MAY_READ_AGAIN})`;
const ROBOT_SUBJECT_GOES = `(subject_by = 'robot' AND exercise_list_status NOT IN ('ready', 'accepted', 'problem') AND NOT ${STAYS_UNSUPPORTED})`;
const SUBJECT_FROM_ROBOT_CLEARED = `subject = CASE WHEN ${ROBOT_SUBJECT_GOES} THEN NULL ELSE subject END,
           subject_name = CASE WHEN ${ROBOT_SUBJECT_GOES} THEN '' ELSE subject_name END,
           subject_by = CASE WHEN ${ROBOT_SUBJECT_GOES} THEN NULL ELSE subject_by END,
           exercise_list_json = CASE WHEN ${READ_AGAIN} THEN NULL ELSE exercise_list_json END,
           exercise_list_message = CASE WHEN ${READ_AGAIN} THEN NULL ELSE exercise_list_message END,
           exercise_list_attempts = CASE WHEN ${READ_AGAIN} THEN 0 ELSE exercise_list_attempts END,
           exercise_list_status = CASE WHEN ${READ_AGAIN} THEN 'none' ELSE exercise_list_status END, `;

// A new class barem resets the list, except one that ended at a subject not
// graded and may not be read again (see above).
function listResetSql(variant: TestVariant): string {
  const c = columns(variant);
  const keep = (col: string, reset: string) =>
    variant === 'class' ? `${col} = CASE WHEN ${STAYS_UNSUPPORTED} THEN ${col} ELSE ${reset} END` : `${col} = ${reset}`;
  return [
    keep(c('exercise_list_status'), "'none'"),
    keep(c('exercise_list_json'), 'NULL'),
    keep(c('exercise_list_message'), 'NULL'),
    keep(c('exercise_list_attempts'), '0'),
  ].join(', ');
}

export async function saveTestFile(
  db: D1Database,
  teacherId: number,
  testId: number,
  kind: TestFileKind,
  file: StoredFile,
  now: string,
  uploadToken: string,
  variant: TestVariant = 'class',
): Promise<{ status: TestStatus; clearedPrintKey: string | null; replacedKey: string | null; readAgain: boolean } | null> {
  const c = columns(variant);
  const statuses = baremStatuses(variant);
  // A CES file turns the CES switch on.
  const on = variant === 'ces' ? 'ces_off = 0, ' : '';
  // A new class test file is read again for its subject, unless the teacher set it.
  const subject = variant === 'class' ? SUBJECT_FROM_ROBOT_CLEARED : '';
  const sql =
    kind === 'test'
      ? `UPDATE tests SET ${on}${subject}${c('test_file_key')} = ?, ${c('test_file_name')} = ?, ${c('test_file_type')} = ?, updated_at = ?,
           ${c('files_version')} = ${c('files_version')} + 1,
           ${c('print_status')} = 'none', ${c('print_attempts')} = 0, ${c('print_file_key')} = NULL, upload_token = COALESCE(upload_token, ?),
           ${c('barem_request')} = CASE WHEN ${c('barem_unchecked')} = 1 AND status IN (${statuses}) THEN 'requested' ELSE ${c('barem_request')} END,
           ${c('barem_request_attempts')} = CASE WHEN ${c('barem_unchecked')} = 1 AND status IN (${statuses}) THEN 0 ELSE ${c('barem_request_attempts')} END
         WHERE id = ? AND teacher_id = ? ${noCesGradingSql(variant)} AND ${QUICK_TRY_FILES_LEFT}
         RETURNING status, exercise_list_status AS list_status`
      : `UPDATE tests SET ${on}${c('barem_file_key')} = ?, ${c('barem_file_name')} = ?, ${c('barem_file_type')} = ?, updated_at = ?,
           ${c('files_version')} = ${c('files_version')} + 1,
           ${listResetSql(variant)},
           ${c('barem_unchecked')} = 0, ${c('barem_request')} = 'none', ${c('barem_request_attempts')} = 0
         WHERE id = ? AND teacher_id = ? ${noCesGradingSql(variant)} AND ${QUICK_TRY_FILES_LEFT}
         RETURNING status`;
  const [before, written] = await db.batch<{
    print_file_key?: string | null;
    replaced_key?: string | null;
    ended_unsupported?: number;
    status?: TestStatus;
    list_status?: ExerciseListStatus;
  }>([
    db
      .prepare(
        `SELECT ${c('print_file_key')} AS print_file_key, ${kind === 'test' ? c('test_file_key') : c('barem_file_key')} AS replaced_key,
           ${ENDED_UNSUPPORTED} AS ended_unsupported
         FROM tests WHERE id = ? AND teacher_id = ?`,
      )
      .bind(testId, teacherId),
    kind === 'test'
      ? db.prepare(sql).bind(file.key, file.name, file.type, now, uploadToken, testId, teacherId)
      : db.prepare(sql).bind(file.key, file.name, file.type, now, testId, teacherId),
  ]);
  const status = written?.results[0]?.status;
  if (!status) return null;
  const row = before?.results[0];
  // The batch runs as one transaction: `before` is the row this write changed.
  const readAgain = kind === 'test' && variant === 'class' && row?.ended_unsupported === 1 && written?.results[0]?.list_status === 'none';
  return { status, clearedPrintKey: kind === 'test' ? (row?.print_file_key ?? null) : null, replacedKey: row?.replaced_key ?? null, readAgain };
}

// Points the variant at new barem comments, as if its barem file changed (spec
// §8.5): its exercise list is cleared and its files_version goes up, so a list
// the robot made from the old notes is refused. Returns the test's status, or
// null when the test is gone.
export async function saveBaremNotes(
  db: D1Database,
  teacherId: number,
  testId: number,
  notes: string,
  now: string,
  variant: TestVariant = 'class',
): Promise<TestStatus | null> {
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('barem_notes')} = ?, updated_at = ?, ${c('files_version')} = ${c('files_version')} + 1,
         ${c('exercise_list_status')} = 'none', ${c('exercise_list_json')} = NULL, ${c('exercise_list_message')} = NULL, ${c('exercise_list_attempts')} = 0
       WHERE id = ? AND teacher_id = ? ${noCesGradingSql(variant)}
       RETURNING status`,
    )
    .bind(notes, now, testId, teacherId)
    .first<{ status: TestStatus }>();
  return row?.status ?? null;
}

// Every R2 key of a test: its test and barem files and all student files.
export async function listTestKeys(db: D1Database, record: TestRecord): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT f.r2_key FROM submission_files f JOIN submissions s ON s.id = f.submission_id WHERE s.test_id = ?')
    .bind(record.id)
    .all<{ r2_key: string }>();
  const keys = results.map((row) => row.r2_key);
  for (const variant of [record, record.ces]) {
    for (const file of [variant.files.test, variant.files.barem]) if (file) keys.push(file.key);
    if (variant.print.key) keys.push(variant.print.key);
  }
  return keys;
}

// True when the variant still waits for its print PDF.
export async function needsPrint(db: D1Database, testId: number, variant: TestVariant = 'class'): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS found FROM tests t WHERE t.id = ? AND ${needsPrintSql(variant)}`).bind(testId).first();
  return row !== null;
}

// True when the robot has a barem of the variant to generate for the test.
export async function needsBarem(db: D1Database, testId: number, variant: TestVariant = 'class'): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS found FROM tests t WHERE t.id = ? AND ${needsBaremSql(variant)}`).bind(testId).first();
  return row !== null;
}

// "Generează baremul": the robot is asked to write the barem of the variant
// from its test file. For the class barem a scheduled evaluation is cleared,
// because the barem must be checked first; the CES barem holds back only the
// CES papers, so the schedule stays. False when the test is gone, is not the
// teacher's, is past the statuses of baremStatuses, or has no test file of the
// variant. A Quick Try test asks here only when it has no barem and never
// asked before; a new test file can still ask again while a generated barem
// waits for its check, within the try's QUICK_TRY_FILE_CHANGES.
export async function requestBarem(db: D1Database, teacherId: number, testId: number, now: string, variant: TestVariant = 'class'): Promise<boolean> {
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('barem_request')} = 'requested', ${c('barem_request_attempts')} = 0,
         ${variant === 'class' ? 'evaluation_at = NULL,' : ''} updated_at = ?
       WHERE id = ? AND teacher_id = ? AND status IN (${baremStatuses(variant)}) AND ${c('test_file_key')} IS NOT NULL ${noCesGradingSql(variant)}
         AND (quick_try = 0 OR (barem_request = 'none' AND barem_unchecked = 0 AND barem_file_key IS NULL))
       RETURNING id`,
    )
    .bind(now, testId, teacherId)
    .first<{ id: number }>();
  return row !== null;
}

// The teacher checked the generated barem of the variant as the page showed
// it. Returns the test's status, or null when the test is gone, is not the
// teacher's, the barem is not waiting for a check, a new barem is being
// generated or its generation failed (the barem is then the old test's), or a
// file of the variant changed since the page was read.
export async function confirmBarem(
  db: D1Database,
  teacherId: number,
  testId: number,
  filesVersion: number,
  now: string,
  variant: TestVariant = 'class',
): Promise<TestStatus | null> {
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('barem_unchecked')} = 0, updated_at = ?
       WHERE id = ? AND teacher_id = ? AND ${c('files_version')} = ? AND ${c('barem_unchecked')} = 1 AND ${c('barem_request')} = 'none'
       RETURNING status`,
    )
    .bind(now, testId, teacherId, filesVersion)
    .first<{ status: TestStatus }>();
  return row?.status ?? null;
}

// "Încearcă din nou": a failed print PDF of the variant goes back to the
// queue. Also "Pregătește testul cu cod QR" for a draft made before tests got
// their link at once: it gets `uploadToken`, and its print PDF waits for the
// robot. False when the test is gone, is not the teacher's, is past uploads,
// or its print neither failed nor lacks a link (with a test file to print).
export async function retryPrint(
  db: D1Database,
  teacherId: number,
  testId: number,
  uploadToken: string,
  now: string,
  variant: TestVariant = 'class',
): Promise<boolean> {
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('print_status')} = 'none', ${c('print_attempts')} = 0, upload_token = COALESCE(upload_token, ?), updated_at = ?
       WHERE id = ? AND teacher_id = ? AND status IN ('draft', 'open')
         AND (${c('print_status')} = 'failed' OR (upload_token IS NULL AND ${c('test_file_key')} IS NOT NULL))
       RETURNING id`,
    )
    .bind(uploadToken, now, testId, teacherId)
    .first<{ id: number }>();
  return row !== null;
}

// "Șterge varianta CES": every CES column goes back to empty, and the CES files
// version goes up, so a robot job on the old files is refused. Only while no
// paper went to grading with the CES variant, checked in the write: such a
// paper keeps its variant (a regrade reads the CES files). Returns the R2 keys
// of the CES files (read in the same batch, so a print or barem the robot
// saves meanwhile is not left), or null when nothing was removed.
export async function removeCesVariant(db: D1Database, teacherId: number, testId: number, now: string): Promise<string[] | null> {
  const [before, removed] = await db.batch<{ ces_test_file_key?: string | null; ces_barem_file_key?: string | null; ces_print_file_key?: string | null; id?: number }>([
    db.prepare('SELECT ces_test_file_key, ces_barem_file_key, ces_print_file_key FROM tests WHERE id = ? AND teacher_id = ?').bind(testId, teacherId),
    db
      .prepare(
        `UPDATE tests SET ces_test_file_key = NULL, ces_test_file_name = NULL, ces_test_file_type = NULL,
           ces_barem_file_key = NULL, ces_barem_file_name = NULL, ces_barem_file_type = NULL, ces_barem_notes = NULL,
           ces_barem_request = 'none', ces_barem_request_attempts = 0, ces_barem_unchecked = 0,
           ces_exercise_list_json = NULL, ces_exercise_list_status = 'none', ces_exercise_list_message = NULL, ces_exercise_list_attempts = 0,
           ces_print_status = 'none', ces_print_file_key = NULL, ces_print_attempts = 0,
           ces_files_version = ces_files_version + 1, updated_at = ?
         WHERE id = ? AND teacher_id = ? AND (ces_test_file_key IS NOT NULL OR ces_barem_file_key IS NOT NULL)
           AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = tests.id AND s.variant = 'ces')
         RETURNING id`,
      )
      .bind(now, testId, teacherId),
  ]);
  if (!removed?.results[0]) return null;
  const row = before?.results[0];
  return [row?.ces_test_file_key, row?.ces_barem_file_key, row?.ces_print_file_key].filter((key): key is string => typeof key === 'string');
}

// The CES switch. Off: no separate test for the CES students; the CES files go,
// in the same guarded write as removeCesVariant (refused once a paper went to
// grading with the CES variant). Returns the R2 keys to delete, or null when
// the test is not the teacher's or a CES paper blocks it. On: the switch only.
export async function setCesOff(db: D1Database, teacherId: number, testId: number, off: boolean, now: string): Promise<string[] | null> {
  if (!off) {
    const row = await db
      .prepare('UPDATE tests SET ces_off = 0, updated_at = ? WHERE id = ? AND teacher_id = ? RETURNING id')
      .bind(now, testId, teacherId)
      .first<{ id: number }>();
    return row ? [] : null;
  }
  const [before, written] = await db.batch<{ ces_test_file_key?: string | null; ces_barem_file_key?: string | null; ces_print_file_key?: string | null; id?: number }>([
    db.prepare('SELECT ces_test_file_key, ces_barem_file_key, ces_print_file_key FROM tests WHERE id = ? AND teacher_id = ?').bind(testId, teacherId),
    db
      .prepare(
        `UPDATE tests SET ces_off = 1, ces_test_file_key = NULL, ces_test_file_name = NULL, ces_test_file_type = NULL,
           ces_barem_file_key = NULL, ces_barem_file_name = NULL, ces_barem_file_type = NULL, ces_barem_notes = NULL,
           ces_barem_request = 'none', ces_barem_request_attempts = 0, ces_barem_unchecked = 0,
           ces_exercise_list_json = NULL, ces_exercise_list_status = 'none', ces_exercise_list_message = NULL, ces_exercise_list_attempts = 0,
           ces_print_status = 'none', ces_print_file_key = NULL, ces_print_attempts = 0,
           ces_files_version = ces_files_version + 1, updated_at = ?
         WHERE id = ? AND teacher_id = ?
           AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = tests.id AND s.variant = 'ces')
         RETURNING id`,
      )
      .bind(now, testId, teacherId),
  ]);
  if (!written?.results[0]) return null;
  const row = before?.results[0];
  return [row?.ces_test_file_key, row?.ces_barem_file_key, row?.ces_print_file_key].filter((key): key is string => typeof key === 'string');
}

// Deletes the test row; its uploads and file rows go with it (ON DELETE CASCADE).
export async function deleteTestRow(db: D1Database, teacherId: number, testId: number): Promise<void> {
  await db.prepare('DELETE FROM tests WHERE id = ? AND teacher_id = ?').bind(testId, teacherId).run();
}
