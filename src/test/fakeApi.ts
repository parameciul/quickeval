import { vi } from 'vitest';
import type {
  ClassSummary,
  EvaluationInfo,
  EvaluationItemInfo,
  EvaluationStart,
  ItemCorrection,
  RegradeAnswer,
  RobotStart,
  Settings,
  StudentHistory,
  StudentRow,
  SubmissionDetail,
  TestDetail,
  TestFileAnswer,
  TestInfo,
  TestSummary,
  UploadRow,
} from '../../shared/api.ts';
import { normalizeClassName } from '../../shared/classes.ts';
import { uploadTypeOf, type TestFileKind } from '../../shared/files.ts';
import { formatPoints, gradeOf, isValidCorrection, round2 } from '../../shared/scoring.ts';
import { buildTestCode } from '../../shared/tests.ts';
import { ApiError, type AdminApi } from '../admin/api.ts';

// An in-memory AdminApi for page tests. Every method is a vi.fn, so tests can
// check calls or replace one answer with mockRejectedValueOnce.
export interface FakeData {
  classes: ClassSummary[];
  students: Record<number, StudentRow[]>;
  tests?: TestDetail[];
  submissions?: SubmissionDetail[];
  settings?: Settings;
  histories?: StudentHistory[];
}

// The settings of a new installation, for building fake data in tests.
export function fakeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    maxParallelAgents: 1,
    hasRobotKey: false,
    robot: { running: false, lastCheckAt: null, lastRunFinishedAt: null, lastRunSummary: null },
    lastGradedAt: null,
    ...overrides,
  };
}

export const FAKE_ROBOT_KEY = 'fake-robot-key-0123456789abcdefghijklmnopqr';

export const FAKE_TOKEN = 'abcdefghijkmnop2';
export const FAKE_STARTED_AT = '2026-10-06T07:15:00.000Z';

const notFound = () => new ApiError(404, 'not_found', 'Nu am găsit ce cauți.');

function summaryOf(test: TestInfo): TestSummary {
  const { uploadToken: _token, files: _files, ...summary } = test;
  return summary;
}

// A test as the API returns it, for building fake data in tests.
export function fakeTest(overrides: Partial<TestInfo> = {}, uploads: UploadRow[] = []): TestDetail {
  return {
    test: {
      code: '6E2-26T1',
      title: 'Fracții',
      status: 'draft',
      classId: 1,
      className: '6E2',
      schoolYear: 2026,
      createdAt: '2026-10-05T08:00:00.000Z',
      startedAt: null,
      evaluationAt: null,
      evaluationStartedAt: null,
      studentCount: uploads.filter((row) => row.active).length,
      submittedCount: uploads.filter((row) => row.status !== 'none' && row.status !== 'uploading').length,
      gradedCount: uploads.filter((row) => row.status === 'graded').length,
      flagCount: uploads.reduce((sum, row) => sum + row.flagCount, 0),
      uploadToken: null,
      files: { test: null, barem: null },
      exerciseList: { status: 'none', message: null },
      ...overrides,
    },
    uploads,
    robot: { lastCheckAt: null, startFailed: false },
  };
}

// One row of the uploads table, for building fake data in tests.
export function fakeUpload(overrides: Partial<UploadRow> & Pick<UploadRow, 'studentId' | 'studentName'>): UploadRow {
  return {
    active: true,
    submissionId: null,
    status: 'none',
    fileCount: 0,
    startedAt: null,
    submittedAt: null,
    autoSubmitted: false,
    grade: null,
    flagCount: 0,
    lastError: null,
    ...overrides,
  };
}

// One graded item, for building fake data in tests.
export function fakeItem(overrides: Partial<EvaluationItemInfo> & Pick<EvaluationItemInfo, 'id' | 'exerciseId'>): EvaluationItemInfo {
  return {
    label: `Exercițiul ${overrides.exerciseId}`,
    maxPoints: 4.5,
    aiPoints: overrides.points ?? 4.5,
    points: 4.5,
    studentAnswer: '3/4',
    comment: 'Corect.',
    confidence: 'high',
    needsReview: false,
    reviewReason: '',
    reviewed: false,
    changedByTeacher: false,
    ...overrides,
  };
}

// Like the server: the total, the grade, and the items to check follow the items.
function recount(evaluation: EvaluationInfo): EvaluationInfo {
  evaluation.total = round2(evaluation.items.reduce((sum, item) => sum + item.points, 0) + evaluation.officePoints);
  evaluation.grade = gradeOf(evaluation.total, evaluation.maxTotal);
  evaluation.flagCount =
    evaluation.items.filter((item) => item.needsReview && !item.reviewed).length +
    (evaluation.unreadable.length > 0 && !evaluation.pagesReviewed ? 1 : 0);
  return evaluation;
}

// A graded result out of 10 with 1 point "din oficiu", for building fake data in tests.
export function fakeEvaluation(items: EvaluationItemInfo[], overrides: Partial<EvaluationInfo> = {}): EvaluationInfo {
  return recount({
    maxTotal: 10,
    officePoints: 1,
    total: 0,
    grade: 0,
    summary: 'Ai lucrat bine.',
    strengths: [],
    recommendations: [],
    unreadable: [],
    pagesReviewed: false,
    flagCount: 0,
    items,
    ...overrides,
  });
}

export function createFakeApi(data: FakeData = { classes: [], students: {} }) {
  let nextId = 1000;
  const tests = (data.tests ??= []);
  const submissions = (data.submissions ??= []);
  const settings = (data.settings ??= fakeSettings());
  const countActive = (classId: number) => (data.students[classId] ?? []).filter((s) => s.active).length;
  const findSubmission = (submissionId: number) => {
    const found = submissions.find((s) => s.id === submissionId);
    if (!found) throw notFound();
    return found;
  };
  // The uploads table shows the grade and the items to check of the upload.
  const syncRow = (submission: SubmissionDetail) => {
    for (const detail of tests) {
      const row = detail.uploads.find((u) => u.submissionId === submission.id);
      if (row) {
        Object.assign(row, {
          status: submission.status,
          grade: submission.evaluation?.grade ?? null,
          flagCount: submission.evaluation?.flagCount ?? 0,
        });
      }
    }
  };
  const findTest = (code: string) => {
    const found = tests.find((t) => t.test.code === code);
    if (!found) throw notFound();
    return found;
  };

  const api = {
    me: vi.fn(async () => ({ id: 1, email: 'profesor@example.com', name: 'Laura Miron' })),
    listClasses: vi.fn(async (schoolYear: number) =>
      data.classes.filter((c) => c.schoolYear === schoolYear).map((c) => ({ ...c, studentCount: countActive(c.id) })),
    ),
    createClass: vi.fn(async (input: { name: string; schoolYear: number }) => {
      const name = normalizeClassName(input.name);
      if (!name) throw new ApiError(400, 'invalid', 'Numele clasei are 1-8 litere și cifre, de exemplu 6E2.');
      const created: ClassSummary = { id: nextId++, name, schoolYear: input.schoolYear, archived: false, studentCount: 0 };
      data.classes.push(created);
      return created;
    }),
    getClass: vi.fn(async (classId: number) => {
      const found = data.classes.find((c) => c.id === classId);
      if (!found) throw notFound();
      return {
        class: { ...found, studentCount: countActive(classId) },
        students: [...(data.students[classId] ?? [])],
        tests: tests.filter((t) => t.test.classId === classId).map((t) => summaryOf(t.test)),
      };
    }),
    updateClass: vi.fn(async (classId: number, input: { name?: string; archived?: boolean }) => {
      const found = data.classes.find((c) => c.id === classId)!;
      if (input.name !== undefined) found.name = normalizeClassName(input.name) ?? found.name;
      if (input.archived !== undefined) found.archived = input.archived;
      return { ...found };
    }),
    addStudents: vi.fn(async (classId: number, names: string[]) => {
      const added = names.map((fullName) => ({ id: nextId++, fullName, active: true }));
      data.students[classId] = [...(data.students[classId] ?? []), ...added];
      return added;
    }),
    setStudentActive: vi.fn(async (classId: number, studentId: number, active: boolean) => {
      const student = data.students[classId]!.find((s) => s.id === studentId)!;
      student.active = active;
      return { ...student };
    }),
    renameStudent: vi.fn(async (studentId: number, fullName: string) => {
      for (const list of Object.values(data.students)) {
        const student = list.find((s) => s.id === studentId);
        if (student) student.fullName = fullName;
      }
      return { id: studentId, fullName };
    }),
    getStudentHistory: vi.fn(async (studentId: number) => {
      const found = data.histories?.find((history) => history.student.id === studentId);
      if (!found) throw notFound();
      return structuredClone(found);
    }),
    listTests: vi.fn(async (schoolYear: number) =>
      tests.filter((t) => t.test.schoolYear === schoolYear).map((t) => summaryOf(t.test)),
    ),
    createTest: vi.fn(async (input: { classId: number; title: string }) => {
      const cls = data.classes.find((c) => c.id === input.classId);
      if (!cls) throw notFound();
      const number = tests.filter((t) => t.test.classId === cls.id).length + 1;
      const students = (data.students[cls.id] ?? []).filter((s) => s.active);
      const uploads = students.map((s) => fakeUpload({ studentId: s.id, studentName: s.fullName }));
      const created = fakeTest(
        { code: buildTestCode(cls.name, cls.schoolYear, number), title: input.title, classId: cls.id, className: cls.name, schoolYear: cls.schoolYear },
        uploads,
      );
      tests.unshift(created);
      return created.test.code;
    }),
    getTest: vi.fn(async (code: string) => structuredClone(findTest(code))),
    renameTest: vi.fn(async (code: string, title: string) => {
      findTest(code).test.title = title;
      return { code, title };
    }),
    deleteTest: vi.fn(async (code: string) => {
      tests.splice(tests.indexOf(findTest(code)), 1);
    }),
    // Like the server: a new barem clears the exercise list, and during
    // evaluation the robot makes it again.
    uploadTestFile: vi.fn(async (code: string, kind: TestFileKind, file: File): Promise<TestFileAnswer> => {
      const found = findTest(code).test;
      const info = { name: file.name, type: uploadTypeOf(file) };
      found.files[kind] = info;
      if (kind === 'test') return { file: info, robot: null };
      found.exerciseList = { status: 'none', message: null };
      return { file: info, robot: found.status === 'evaluating' ? 'next_check' : null };
    }),
    startTest: vi.fn(async (code: string) => {
      const found = findTest(code).test;
      Object.assign(found, { status: 'open', uploadToken: FAKE_TOKEN, startedAt: FAKE_STARTED_AT });
      return { status: found.status, uploadToken: FAKE_TOKEN, startedAt: FAKE_STARTED_AT };
    }),
    reopenTest: vi.fn(async (code: string) => {
      findTest(code).test.status = 'open';
    }),
    // Like the server: a time that has passed starts now.
    evaluateTest: vi.fn(async (code: string, at?: string): Promise<EvaluationStart> => {
      const found = findTest(code).test;
      if (at !== undefined && at > new Date().toISOString()) {
        found.evaluationAt = at;
        return { status: 'open', evaluationAt: at, robot: null };
      }
      Object.assign(found, { status: 'evaluating', evaluationAt: null, evaluationStartedAt: new Date().toISOString() });
      return { status: 'evaluating', evaluationAt: null, robot: 'next_check' };
    }),
    cancelSchedule: vi.fn(async (code: string) => {
      findTest(code).test.evaluationAt = null;
    }),
    acceptExerciseList: vi.fn(async (code: string): Promise<RobotStart | null> => {
      const found = findTest(code).test;
      found.exerciseList.status = 'accepted';
      return found.status === 'evaluating' ? 'next_check' : null;
    }),
    retryExerciseList: vi.fn(async (code: string): Promise<RobotStart | null> => {
      const found = findTest(code).test;
      found.exerciseList = { status: 'none', message: null };
      return found.status === 'evaluating' ? 'next_check' : null;
    }),
    // Like the server: graded and failed uploads wait for the robot again.
    regradeTest: vi.fn(async (code: string): Promise<RegradeAnswer> => {
      const found = findTest(code);
      const again = (status: string) => status === 'graded' || status === 'failed';
      const rows = found.uploads.filter((row) => again(row.status));
      if (rows.length === 0) throw new ApiError(409, 'nothing_to_regrade', 'Testul nu are lucrări corectate.');
      for (const row of rows) Object.assign(row, { status: 'submitted', grade: null, flagCount: 0, lastError: null });
      if (found.test.status === 'done') found.test.status = 'evaluating';
      for (const detail of submissions) {
        if (detail.testCode === code && again(detail.status)) {
          Object.assign(detail, { status: 'submitted', testStatus: found.test.status, evaluation: null, lastError: null });
        }
      }
      return { count: rows.length, testStatus: found.test.status, robot: found.test.status === 'evaluating' ? 'next_check' : null };
    }),
    startRobot: vi.fn(async (code: string): Promise<RobotStart> => {
      if (findTest(code).test.status !== 'evaluating') throw new ApiError(409, 'not_evaluating', 'Testul nu se corectează acum.');
      return 'next_check';
    }),
    getSubmission: vi.fn(async (submissionId: number) => structuredClone(findSubmission(submissionId))),
    resetSubmission: vi.fn(async (submissionId: number) => {
      for (const detail of tests) {
        const row = detail.uploads.find((u) => u.submissionId === submissionId);
        if (row) {
          const cleared = { submissionId: null, status: 'none', fileCount: 0, startedAt: null, submittedAt: null, autoSubmitted: false };
          Object.assign(row, { ...cleared, grade: null, flagCount: 0, lastError: null });
        }
      }
      const index = submissions.findIndex((s) => s.id === submissionId);
      if (index >= 0) submissions.splice(index, 1);
    }),
    retrySubmission: vi.fn(async (submissionId: number): Promise<RobotStart | null> => {
      for (const detail of tests) {
        const row = detail.uploads.find((u) => u.submissionId === submissionId);
        if (row) Object.assign(row, { status: 'submitted', lastError: null });
      }
      const found = submissions.find((s) => s.id === submissionId);
      if (found) Object.assign(found, { status: 'submitted', lastError: null });
      return 'next_check';
    }),
    // Like the server: a finished test goes back to evaluation. The upload is
    // a row of a test's uploads table, a detailed upload, or both.
    regradeSubmission: vi.fn(async (submissionId: number): Promise<RegradeAnswer> => {
      const found = submissions.find((s) => s.id === submissionId);
      const test = tests.find((t) => t.uploads.some((u) => u.submissionId === submissionId) || t.test.code === found?.testCode);
      const row = test?.uploads.find((u) => u.submissionId === submissionId);
      const status = found?.status ?? row?.status;
      if (status === undefined) throw notFound();
      if (status !== 'graded') throw new ApiError(409, 'not_graded', 'Lucrarea nu este corectată acum.');
      const before = test?.test.status ?? found!.testStatus;
      const testStatus = before === 'done' ? 'evaluating' : before;
      if (found) Object.assign(found, { status: 'submitted', testStatus, evaluation: null });
      if (row) Object.assign(row, { status: 'submitted', grade: null, flagCount: 0 });
      if (test) test.test.status = testStatus;
      return { count: 1, testStatus, robot: testStatus === 'evaluating' ? 'next_check' : null };
    }),
    // Like the server: the item must be in the result of the upload.
    correctItem: vi.fn(async (submissionId: number, itemId: number, change: ItemCorrection) => {
      const found = findSubmission(submissionId);
      const item = found.evaluation?.items.find((i) => i.id === itemId);
      if (!found.evaluation || !item) throw new ApiError(409, 'not_graded', 'Lucrarea se corectează din nou. Reîncarcă pagina.');
      if (change.points !== undefined && !isValidCorrection(change.points, item.maxPoints)) {
        throw new ApiError(400, 'invalid_points', `Punctajul este între 0 și ${formatPoints(item.maxPoints)}, din 0,05 în 0,05.`);
      }
      if (change.points !== undefined) item.points = change.points;
      if (change.comment !== undefined) item.comment = change.comment;
      if (change.points !== undefined || change.comment !== undefined) item.changedByTeacher = true;
      if (change.reviewed !== undefined) item.reviewed = change.reviewed;
      recount(found.evaluation);
      syncRow(found);
      return structuredClone(found);
    }),
    reviewPages: vi.fn(async (submissionId: number, pagesReviewed: boolean) => {
      const found = findSubmission(submissionId);
      if (!found.evaluation) throw new ApiError(409, 'not_graded', 'Lucrarea se corectează din nou. Reîncarcă pagina.');
      found.evaluation.pagesReviewed = pagesReviewed;
      recount(found.evaluation);
      syncRow(found);
      return structuredClone(found);
    }),
    getSettings: vi.fn(async () => structuredClone(settings)),
    updateSettings: vi.fn(async (maxParallelAgents: number) => {
      settings.maxParallelAgents = maxParallelAgents;
      return structuredClone(settings);
    }),
    newRobotKey: vi.fn(async () => {
      settings.hasRobotKey = true;
      return FAKE_ROBOT_KEY;
    }),
  } satisfies AdminApi;
  return api;
}

export type FakeApi = ReturnType<typeof createFakeApi>;
