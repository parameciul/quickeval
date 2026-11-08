import { vi } from 'vitest';
import type {
  Account,
  AnalysisAnswer,
  BaremCheckedAnswer,
  BaremGenerateAnswer,
  BaremNotesAnswer,
  ClassReport,
  ClassSummary,
  EvaluationInfo,
  EvaluationItemInfo,
  EvaluationStart,
  ItemCorrection,
  PagesReview,
  PrintRetryAnswer,
  RegradeAnswer,
  ReviewPoint,
  FinishedTest,
  ReopenAnswer,
  RobotStart,
  Settings,
  StartedTest,
  StoppedTest,
  StudentHistory,
  StudentRow,
  SubmissionDetail,
  Teacher,
  TestDetail,
  TestFileAnswer,
  TestInfo,
  TestSummary,
  UploadRow,
} from '../../shared/api.ts';
import { normalizeClassName } from '../../shared/classes.ts';
import { DOCX_TYPE, uploadTypeOf, type TestFileKind } from '../../shared/files.ts';
import type { CheckoutInput, PaymentRow } from '../../shared/payments.ts';
import { formatPoints, gradeOf, isValidCorrection, round2 } from '../../shared/scoring.ts';
import { averageGrade } from '../../shared/stats.ts';
import { studentNameKey } from '../../shared/students.ts';
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
  // The class reports, by test code.
  reports?: Record<string, ClassReport>;
  // The logged-in teacher; an administrator when missing.
  me?: Teacher;
  // The accounts on Setări; the logged-in teacher alone when missing.
  accounts?: Account[];
}

// The logged-in teacher of the page tests: Laura, an administrator.
export function fakeTeacher(overrides: Partial<Teacher> = {}): Teacher {
  return { id: 1, email: 'profesor@example.com', name: 'Laura Miron', role: 'admin', demo: false, testsEvaluated: 0, papersGraded: 0, papersWaiting: 0, ...overrides };
}

export function fakeAccount(overrides: Partial<Account> = {}): Account {
  return { ...fakeTeacher(), status: 'active', createdAt: '2026-10-06T08:00:00.000Z', approvedAt: null, ...overrides };
}

export const FAKE_TEMPORARY_PASSWORD = 'abcdefghjkmn';

// The settings of a new installation, for building fake data in tests.
export function fakeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    maxParallelAgents: 1,
    hasRobotKey: false,
    robotKeyAt: null,
    robot: { running: false, lastCheckAt: null, lastRunFinishedAt: null, lastRunSummary: null },
    lastModels: { gradingModel: null, gradingEffort: null, analysisModel: null, analysisEffort: null },
    showModelColumn: false,
    configuredModel: null,
    configuredEffort: null,
    configuredAt: null,
    lastGradedAt: null,
    ...overrides,
  };
}

export const FAKE_ROBOT_KEY = 'fake-robot-key-0123456789abcdefghijklmnopqr';
export const FAKE_ROBOT_KEY_AT = '2026-10-12T09:30:00.000Z';

export const FAKE_TOKEN = 'abcdefghijkmnop2';
export const FAKE_MULTI_TOKEN = 'bbbbbbbbbbbbbbbb';
export const FAKE_STARTED_AT = '2026-10-06T07:15:00.000Z';

const notFound = () => new ApiError(404, 'not_found', 'Nu am găsit ce cauți.');
const uploadChanged = () => new ApiError(409, 'upload_changed', 'Încărcarea s-a schimbat. Reîncarcă pagina.');

// A draft or open test with its link and a test file whose print PDF is not made yet.
const printWaits = (test: TestInfo) =>
  (test.status === 'draft' || test.status === 'open') && test.uploadToken !== null && test.files.test !== null && test.print.status === 'none';

// Like the server: what the test has for the class, and the average of its
// graded papers, follow its files and its uploads.
function withDerived({ test, ...detail }: TestDetail): TestDetail {
  const grades = detail.uploads.flatMap((row) => (row.status === 'graded' && row.grade !== null ? [row.grade] : []));
  return {
    ...detail,
    test: {
      ...test,
      prepared: {
        testFile: test.files.test !== null,
        baremFile: test.files.barem !== null,
        print: test.print.status,
        uploadLink: test.uploadToken !== null,
      },
      averageGrade: averageGrade(grades),
    },
  };
}

function summaryOf(detail: TestDetail): TestSummary {
  const { uploadToken: _token, multiUploadToken: _multi, files: _files, ...summary } = withDerived(detail).test;
  return summary;
}

// A test as the API returns it, for building fake data in tests.
export function fakeTest(overrides: Partial<TestInfo> = {}, uploads: UploadRow[] = []): TestDetail {
  return withDerived({
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
      resultsOpen: false,
      publishedCount: 0,
      archived: false,
      // Like the server: a test gets its link when it is made.
      uploadToken: FAKE_TOKEN,
      multiUploadToken: null,
      files: { test: null, barem: null },
      exerciseList: { status: 'none', message: null },
      baremNotes: '',
      barem: { request: 'none', unchecked: false },
      filesVersion: 0,
      analysis: { status: 'none', stale: false, attempts: 0 },
      print: { status: 'none', fromWord: false },
      // Made again from the files and the uploads (withDerived).
      prepared: { testFile: false, baremFile: false, print: 'none', uploadLink: false },
      averageGrade: null,
      ...overrides,
    },
    uploads,
    showModel: false,
    robot: { lastCheckAt: null, startFailed: false },
  });
}

// One test of the tests list, for building fake data in tests: a draft with
// its test file, an active barem, the print PDF and its link. The parts of
// `prepared` an override leaves out keep these values.
type SummaryOverrides = Omit<Partial<TestSummary>, 'prepared'> & { prepared?: Partial<TestSummary['prepared']> };

export function fakeSummary({ prepared, ...overrides }: SummaryOverrides = {}): TestSummary {
  return {
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
    studentCount: 24,
    submittedCount: 0,
    gradedCount: 0,
    flagCount: 0,
    resultsOpen: false,
    publishedCount: 0,
    archived: false,
    barem: { request: 'none', unchecked: false },
    prepared: { testFile: true, baremFile: true, print: 'ready', uploadLink: true, ...prepared },
    averageGrade: null,
    ...overrides,
  };
}

// One row of the uploads table, for building fake data in tests.
export function fakeUpload(overrides: Partial<UploadRow> & Pick<UploadRow, 'studentId' | 'studentName'>): UploadRow {
  return {
    active: true,
    submissionId: null,
    status: 'none',
    fileCount: 0,
    // An upload that exists started at some time; the row of a student who
    // has not started has none.
    startedAt: overrides.submissionId == null ? null : FAKE_STARTED_AT,
    submittedAt: null,
    autoSubmitted: false,
    grade: null,
    total: null,
    maxTotal: null,
    gradedAt: overrides.status === 'graded' ? '2026-10-07T09:00:00.000Z' : null,
    resultToken: null,
    resultsOpen: false,
    flagCount: 0,
    // One made-up item for every point counted, unless the test names them.
    reviewPoints: Array.from({ length: overrides.flagCount ?? 0 }, (_, index) => fakePoint(1000 + index)),
    model: null,
    effort: null,
    lastError: null,
    ...overrides,
  };
}

// One point to check, for building fake data in tests.
export function fakePoint(itemId: number, overrides: Partial<Extract<ReviewPoint, { kind: 'item' }>> = {}): ReviewPoint {
  return {
    kind: 'item',
    itemId,
    exerciseId: `E${itemId}`,
    label: `Exercițiul ${itemId}`,
    points: 1,
    maxPoints: 2,
    reason: 'Scrisul se citește greu.',
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
    page: 0,
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

// The points to check of a graded result, as the uploads list sends them:
// the pages first, then the items in order.
export function reviewPointsOf(evaluation: EvaluationInfo | null): ReviewPoint[] {
  if (!evaluation) return [];
  const items: ReviewPoint[] = evaluation.items
    .filter((item) => item.needsReview && !item.reviewed)
    .map((item) => ({
      kind: 'item',
      itemId: item.id,
      exerciseId: item.exerciseId,
      label: item.label,
      points: item.points,
      maxPoints: item.maxPoints,
      reason: item.reviewReason,
    }));
  return evaluation.unreadable.length > 0 && !evaluation.pagesReviewed ? [{ kind: 'pages', pages: [...evaluation.unreadable] }, ...items] : items;
}

// One student's upload of the test 6E2-26T1, graded unless told, for building fake data in tests.
export function fakeSubmission(overrides: Partial<SubmissionDetail> & Pick<SubmissionDetail, 'id'>): SubmissionDetail {
  return {
    testCode: '6E2-26T1',
    testTitle: 'Fracții',
    testStatus: 'done',
    studentId: 10,
    studentName: 'Pop Ion',
    status: 'graded',
    autoSubmitted: false,
    startedAt: FAKE_STARTED_AT,
    submittedAt: '2026-10-06T08:30:00.000Z',
    lastError: null,
    files: [],
    evaluation: null,
    resultToken: null,
    resultsOpen: false,
    ...overrides,
  };
}

// A graded result out of 10 with 1 point "din oficiu", for building fake data in tests.
export function fakeEvaluation(items: EvaluationItemInfo[], overrides: Partial<EvaluationInfo> = {}): EvaluationInfo {
  return recount({
    gradedAt: '2026-10-07T09:00:00.000Z',
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
  const me = data.me ?? fakeTeacher();
  const accounts = (data.accounts ??= [fakeAccount(me)]);
  const countActive = (classId: number) => (data.students[classId] ?? []).filter((s) => s.active).length;
  const findSubmission = (submissionId: number) => {
    const found = submissions.find((s) => s.id === submissionId);
    if (!found) throw notFound();
    return found;
  };
  // Like the server: an action names the upload the page shows by the time it
  // started, and an upload that started at another time is not that upload.
  const requireShown = (submissionId: number, startedAt: string) => {
    const detail = submissions.find((s) => s.id === submissionId);
    const row = tests.flatMap((t) => t.uploads).find((u) => u.submissionId === submissionId);
    const current = detail?.startedAt ?? row?.startedAt ?? null;
    if (current === null) throw notFound();
    if (current !== startedAt) throw uploadChanged();
  };
  // The uploads table shows the grade and the points to check of the upload.
  const syncRow = (submission: SubmissionDetail) => {
    for (const detail of tests) {
      const row = detail.uploads.find((u) => u.submissionId === submission.id);
      if (row) {
        Object.assign(row, {
          status: submission.status,
          grade: submission.evaluation?.grade ?? null,
          total: submission.evaluation?.total ?? null,
          flagCount: submission.evaluation?.flagCount ?? 0,
          reviewPoints: reviewPointsOf(submission.evaluation),
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
    me: vi.fn(async () => structuredClone(me)),
    login: vi.fn(async (_email: string, _password: string) => structuredClone(me)),
    signup: vi.fn(async (_input: { name: string; email: string; password: string }) => {}),
    confirmEmail: vi.fn(async (_token: string, _password: string) => {}),
    forgotPassword: vi.fn(async (_email: string) => {}),
    setNewPassword: vi.fn(async (_token: string, _newPassword: string) => {}),
    logout: vi.fn(async () => {}),
    changePassword: vi.fn(async (_current: string, _next: string) => {}),
    listAccounts: vi.fn(async () => structuredClone(accounts)),
    approveAccount: vi.fn(async (teacherId: number, createdAt: string) => {
      const account = accounts.find((a) => a.id === teacherId && a.createdAt === createdAt && a.status === 'pending');
      if (!account) throw new ApiError(409, 'not_pending', 'Contul nu mai așteaptă aprobarea.');
      Object.assign(account, { status: 'active', approvedAt: '2026-10-28T10:00:00.000Z' });
    }),
    rejectAccount: vi.fn(async (teacherId: number, createdAt: string) => {
      const index = accounts.findIndex((a) => a.id === teacherId && a.createdAt === createdAt && a.status === 'pending');
      if (index < 0) throw new ApiError(409, 'not_pending', 'Contul nu mai așteaptă aprobarea.');
      accounts.splice(index, 1);
    }),
    rejectAllAccounts: vi.fn(async (shown: { id: number; createdAt: string }[]) => {
      const gone = accounts.filter((a) => a.status === 'pending' && shown.some((s) => s.id === a.id && s.createdAt === a.createdAt));
      for (const account of gone) accounts.splice(accounts.indexOf(account), 1);
      return gone.length;
    }),
    updateAccount: vi.fn(async (teacherId: number, change: { demo?: boolean; status?: 'active' | 'disabled' }) => {
      const account = accounts.find((a) => a.id === teacherId && a.role === 'teacher' && a.status !== 'pending');
      if (!account) throw notFound();
      Object.assign(account, change);
      return structuredClone(accounts);
    }),
    resetPassword: vi.fn(async (teacherId: number) => {
      if (!accounts.some((a) => a.id === teacherId && a.role === 'teacher' && a.status !== 'pending')) throw notFound();
      return FAKE_TEMPORARY_PASSWORD;
    }),
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
        tests: tests.filter((t) => t.test.classId === classId).map(summaryOf),
        // One entry for each upload of the class's tests, like the server.
        grades: tests
          .filter((t) => t.test.classId === classId)
          .flatMap((t) =>
            t.uploads.flatMap((row) =>
              row.submissionId === null || row.status === 'none'
                ? []
                : [
                    {
                      studentId: row.studentId,
                      testCode: t.test.code,
                      submissionId: row.submissionId,
                      status: row.status,
                      grade: row.grade,
                      flagCount: row.status === 'graded' ? row.flagCount : 0,
                      total: row.total,
                      maxTotal: row.maxTotal,
                      // Open when the whole test is published or this one alone, as on the server.
                      resultsOpen: t.test.resultsOpen || row.resultsOpen,
                      resultToken: row.resultToken,
                      startedAt: row.startedAt,
                    },
                  ],
            ),
          ),
      };
    }),
    updateClass: vi.fn(async (classId: number, input: { name?: string; archived?: boolean }) => {
      const found = data.classes.find((c) => c.id === classId)!;
      if (input.name !== undefined) found.name = normalizeClassName(input.name) ?? found.name;
      if (input.archived !== undefined) found.archived = input.archived;
      return { ...found };
    }),
    // Like the server: a name already in the class (students who left count,
    // letter case does not) refuses the whole list.
    addStudents: vi.fn(async (classId: number, names: string[]) => {
      const taken = new Set((data.students[classId] ?? []).map((s) => studentNameKey(s.fullName)));
      const clashes = names.filter((name) => taken.has(studentNameKey(name)));
      if (clashes.length > 0) {
        const quoted = clashes.slice(0, 3).map((name) => `„${name}”`);
        const message =
          clashes.length === 1
            ? `Elevul ${quoted[0]} este deja în clasă.`
            : `Elevii ${quoted.join(', ')}${clashes.length > 3 ? ` și încă ${clashes.length - 3}` : ''} sunt deja în clasă.`;
        throw new ApiError(409, 'student_exists', message);
      }
      const added = names.map((fullName) => ({ id: nextId++, fullName, active: true, canDelete: true }));
      data.students[classId] = [...(data.students[classId] ?? []), ...added];
      return added;
    }),
    setStudentActive: vi.fn(async (classId: number, studentId: number, active: boolean) => {
      const student = data.students[classId]!.find((s) => s.id === studentId)!;
      student.active = active;
      return { ...student };
    }),
    // Like the server: a student with a sent, grading or graded upload in a test
    // of the class stays; any other leaves the class.
    deleteStudent: vi.fn(async (classId: number, studentId: number) => {
      const list = data.students[classId] ?? [];
      if (!list.some((s) => s.id === studentId)) throw notFound();
      const hasWork = tests.some(
        (t) =>
          t.test.classId === classId &&
          t.uploads.some((u) => u.studentId === studentId && ['submitted', 'grading', 'graded'].includes(u.status)),
      );
      if (hasWork) {
        throw new ApiError(409, 'student_has_work', 'Elevul are lucrări trimise sau corectate în această clasă. Îl poți marca „A plecat”.');
      }
      data.students[classId] = list.filter((s) => s.id !== studentId);
    }),
    // Like the server: another student of one of the same classes may not have
    // the name, but a student may change the case of their own.
    renameStudent: vi.fn(async (studentId: number, fullName: string) => {
      const key = studentNameKey(fullName);
      for (const [classId, list] of Object.entries(data.students)) {
        if (!list.some((s) => s.id === studentId)) continue;
        if (list.some((s) => s.id !== studentId && studentNameKey(s.fullName) === key)) {
          const cls = data.classes.find((c) => c.id === Number(classId));
          const where = cls ? `clasa ${cls.name}` : 'clasă';
          throw new ApiError(409, 'student_exists', `Există deja un elev cu numele „${fullName}” în ${where}.`);
        }
      }
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
      tests.filter((t) => t.test.schoolYear === schoolYear).map(summaryOf),
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
    getTest: vi.fn(async (code: string) => structuredClone(withDerived(findTest(code)))),
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
      if (kind === 'test') {
        // Like the server: a new test file needs a new print PDF, and an old draft gets its link.
        found.uploadToken ??= FAKE_TOKEN;
        found.print = { status: 'none', fromWord: info.type === DOCX_TYPE };
        return { file: info, robot: printWaits(found) ? 'dispatched' : null };
      }
      found.exerciseList = { status: 'none', message: null };
      return { file: info, robot: found.status === 'evaluating' ? 'next_check' : null };
    }),
    // Like the server: new barem comments clear the exercise list, and during
    // evaluation the robot makes it again.
    saveBaremNotes: vi.fn(async (code: string, notes: string): Promise<BaremNotesAnswer> => {
      const found = findTest(code).test;
      found.baremNotes = notes.trim();
      found.exerciseList = { status: 'none', message: null };
      return { baremNotes: found.baremNotes, robot: found.status === 'evaluating' ? 'next_check' : null };
    }),
    // Like the server: only a draft or open test with a test file asks the robot.
    generateBarem: vi.fn(async (code: string): Promise<BaremGenerateAnswer> => {
      const found = findTest(code).test;
      if (!found.files.test) throw new ApiError(409, 'no_test_file', 'Încarcă întâi testul.');
      found.barem = { ...found.barem, request: 'requested' };
      return { barem: found.barem, robot: 'dispatched' };
    }),
    // Like the server: a stale files version is refused.
    confirmBarem: vi.fn(async (code: string, filesVersion: number): Promise<BaremCheckedAnswer> => {
      const found = findTest(code).test;
      if (found.filesVersion !== filesVersion) throw new ApiError(409, 'stale', 'Baremul s-a schimbat. Reîncarcă pagina.');
      found.barem = { ...found.barem, unchecked: false };
      return { barem: found.barem };
    }),
    // Like the server: the test keeps its link (a draft made before tests got
    // their link at once gets one now), and a print PDF that still waits is
    // work for the robot.
    startTest: vi.fn(async (code: string): Promise<StartedTest> => {
      const found = findTest(code).test;
      if (found.status !== 'draft') throw new ApiError(409, 'already_started', 'Testul a început deja.');
      Object.assign(found, { status: 'open', archived: false, uploadToken: found.uploadToken ?? FAKE_TOKEN, startedAt: FAKE_STARTED_AT });
      const robot = printWaits(found) ? 'dispatched' : null;
      return { status: found.status, uploadToken: found.uploadToken ?? FAKE_TOKEN, startedAt: FAKE_STARTED_AT, robot };
    }),
    // Like the server: only an open test with no student file stops; its date
    // and schedule go, its link stays.
    stopTest: vi.fn(async (code: string): Promise<StoppedTest> => {
      const detail = findTest(code);
      const found = detail.test;
      if (found.status === 'draft') throw new ApiError(409, 'not_started', 'Testul nu a început încă.');
      if (found.status !== 'open') throw new ApiError(409, 'closed', 'Încărcarea s-a închis. Testul nu mai poate fi oprit.');
      if (found.evaluationStartedAt !== null) throw new ApiError(409, 'evaluated', 'Testul a fost deja evaluat, așa că nu mai poate fi oprit.');
      if (detail.uploads.some((row) => row.fileCount > 0)) {
        throw new ApiError(409, 'has_uploads', 'Un elev a încărcat deja lucrarea, așa că testul nu mai poate fi oprit.');
      }
      Object.assign(found, { status: 'draft', startedAt: null, evaluationAt: null });
      return { status: 'draft' };
    }),
    createMultiUploadLink: vi.fn(async (code: string) => {
      const found = findTest(code).test;
      if (found.status === 'draft') throw new ApiError(409, 'not_started', 'Testul nu a început încă.');
      if (!found.multiUploadToken) found.multiUploadToken = FAKE_MULTI_TOKEN;
      return found.multiUploadToken;
    }),
    setResultsOpen: vi.fn(async (code: string, open: boolean) => {
      const detail = findTest(code);
      detail.test.resultsOpen = open;
      // Like the server: opening leaves the count of single publishes alone,
      // closing takes them back too.
      if (!open) detail.test.publishedCount = 0;
      // Like the server: opening publishes every page, closing takes back
      // every page, including the ones published alone.
      for (const row of detail.uploads) {
        if (row.submissionId !== null) row.resultsOpen = open;
      }
      for (const sub of submissions) {
        if (sub.testCode === code) sub.resultsOpen = open;
      }
      return open;
    }),
    // Like the server: the page opens when the test is open for all, or its
    // own upload is published.
    setSubmissionResultsOpen: vi.fn(async (submissionId: number, startedAt: string, open: boolean) => {
      requireShown(submissionId, startedAt);
      for (const detail of tests) {
        const row = detail.uploads.find((u) => u.submissionId === submissionId);
        if (row) {
          const effective = open || detail.test.resultsOpen;
          row.resultsOpen = effective;
          const found = submissions.find((s) => s.id === submissionId);
          if (found) found.resultsOpen = effective;
          return effective;
        }
      }
      const found = submissions.find((s) => s.id === submissionId);
      if (found) {
        const test = tests.find((t) => t.test.code === found.testCode);
        const effective = open || (test?.test.resultsOpen ?? false);
        found.resultsOpen = effective;
        return effective;
      }
      throw notFound();
    }),
    reopenTest: vi.fn(async (code: string): Promise<ReopenAnswer> => {
      const found = findTest(code).test;
      found.status = 'open';
      found.archived = false;
      // Like the server: a print PDF that waits is work for the robot.
      return { status: 'open', robot: printWaits(found) ? 'dispatched' : null };
    }),
    // Like the server: an open test with a graded paper and none waiting is done.
    finishTest: vi.fn(async (code: string): Promise<FinishedTest> => {
      const detail = findTest(code);
      const waits = detail.uploads.some(
        (row) => row.status === 'submitted' || row.status === 'grading' || (row.status === 'uploading' && row.fileCount > 0),
      );
      if (detail.test.status !== 'open') throw new ApiError(409, 'busy', 'Testul s-a schimbat între timp. Încearcă din nou.');
      if (waits) throw new ApiError(409, 'papers_waiting', 'Mai sunt lucrări trimise care nu au fost corectate.');
      if (!detail.uploads.some((row) => row.status === 'graded')) {
        throw new ApiError(409, 'nothing_graded', 'Testul nu are nicio lucrare corectată.');
      }
      Object.assign(detail.test, { status: 'done', evaluationAt: null });
      return { status: 'done' };
    }),
    // Like the server: a failed print PDF is made again, by the robot, and a
    // draft without a link gets one and its print PDF.
    retryPrint: vi.fn(async (code: string): Promise<PrintRetryAnswer> => {
      const found = findTest(code).test;
      const beforeEvaluation = found.status === 'draft' || found.status === 'open';
      const lacksLink = found.uploadToken === null && found.files.test !== null;
      if (!beforeEvaluation || (found.print.status !== 'failed' && !lacksLink)) {
        throw new ApiError(409, 'not_failed', 'Testul cu cod QR nu poate fi încercat din nou.');
      }
      found.uploadToken ??= FAKE_TOKEN;
      found.print = { status: 'none', fromWord: found.print.fromWord };
      return { print: found.print, robot: 'dispatched' };
    }),
    // Like the server: only a finished test goes in the archive.
    setTestArchived: vi.fn(async (code: string, archived: boolean) => {
      const found = findTest(code).test;
      if (archived && found.status !== 'done') {
        throw new ApiError(409, 'not_done', 'Poți arhiva un test după ce s-a terminat corectarea.');
      }
      found.archived = archived;
      return archived;
    }),
    // Like the server: a time that has passed starts now. With submissionIds,
    // unselected uploads with files stay uploading for a later evaluation.
    evaluateTest: vi.fn(async (code: string, at?: string, submissionIds?: number[]): Promise<EvaluationStart> => {
      const detail = findTest(code);
      const found = detail.test;
      if (at !== undefined && at > new Date().toISOString()) {
        found.evaluationAt = at;
        return { status: 'open', evaluationAt: at, robot: null };
      }
      if (submissionIds !== undefined) {
        for (const row of detail.uploads) {
          if (row.submissionId === null) continue;
          const selected = submissionIds.includes(row.submissionId);
          if (!selected && row.status === 'submitted') {
            Object.assign(row, { status: 'uploading', submittedAt: null, autoSubmitted: false });
          } else if (selected && row.status === 'uploading' && row.fileCount > 0) {
            Object.assign(row, { status: 'submitted', submittedAt: new Date().toISOString(), autoSubmitted: true });
          }
        }
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
      for (const row of rows) Object.assign(row, { status: 'submitted', grade: null, gradedAt: null, flagCount: 0, lastError: null });
      if (found.test.status === 'done') found.test.status = 'evaluating';
      for (const detail of submissions) {
        if (detail.testCode === code && again(detail.status)) {
          Object.assign(detail, { status: 'submitted', testStatus: found.test.status, evaluation: null, lastError: null });
        }
      }
      return { count: rows.length, testStatus: found.test.status, robot: found.test.status === 'evaluating' ? 'next_check' : null };
    }),
    // Like the server: an open test only while its print PDF waits.
    startRobot: vi.fn(async (code: string): Promise<RobotStart> => {
      // Like the server: a draft or open test has work only while its print PDF or barem waits.
      const found = findTest(code).test;
      const waits = printWaits(found) || ((found.status === 'draft' || found.status === 'open') && found.files.test !== null && found.barem.request === 'requested');
      if (found.status !== 'evaluating' && found.status !== 'open' && !waits) throw new ApiError(409, 'not_evaluating', 'Testul nu se corectează acum.');
      if (found.status === 'open' && !waits) throw new ApiError(409, 'no_work', 'Nicio lucrare a acestui test nu așteaptă robotul.');
      return 'next_check';
    }),
    // Like the server: only a test in evaluation or done with a graded upload;
    // a finished test goes back to evaluation.
    regenerateAnalysis: vi.fn(async (code: string): Promise<AnalysisAnswer> => {
      const found = findTest(code);
      if (found.test.status !== 'evaluating' && found.test.status !== 'done') {
        throw new ApiError(409, 'not_evaluated', 'Analiza se face după ce testul a fost corectat.');
      }
      if (found.test.gradedCount === 0) throw new ApiError(409, 'no_results', 'Testul nu are lucrări corectate.');
      found.test.analysis = { status: 'requested', stale: found.test.analysis.stale, attempts: 0 };
      if (found.test.status === 'done') found.test.status = 'evaluating';
      return { analysis: found.test.analysis, robot: 'next_check' };
    }),
    getReport: vi.fn(async (code: string) => {
      const report = data.reports?.[code];
      if (!report) throw notFound();
      return structuredClone(report);
    }),
    getSubmission: vi.fn(async (submissionId: number) => structuredClone(findSubmission(submissionId))),
    getResultLink: vi.fn(async (submissionId: number, startedAt: string) => {
      requireShown(submissionId, startedAt);
      const found = submissions.find((s) => s.id === submissionId);
      if (found) {
        if (!found.resultToken) found.resultToken = `result-token-${submissionId}`;
        return found.resultToken;
      }
      for (const detail of tests) {
        const row = detail.uploads.find((u) => u.submissionId === submissionId);
        if (row) {
          if (!row.resultToken) row.resultToken = `result-token-${submissionId}`;
          return row.resultToken;
        }
      }
      throw notFound();
    }),
    resetSubmission: vi.fn(async (submissionId: number, startedAt: string) => {
      requireShown(submissionId, startedAt);
      for (const detail of tests) {
        const row = detail.uploads.find((u) => u.submissionId === submissionId);
        if (row) {
          const cleared = { submissionId: null, status: 'none', fileCount: 0, startedAt: null, submittedAt: null, autoSubmitted: false };
          Object.assign(row, { ...cleared, grade: null, total: null, maxTotal: null, gradedAt: null, resultsOpen: false, flagCount: 0, reviewPoints: [], lastError: null });
        }
      }
      const index = submissions.findIndex((s) => s.id === submissionId);
      if (index >= 0) submissions.splice(index, 1);
    }),
    retrySubmission: vi.fn(async (submissionId: number, startedAt: string): Promise<RobotStart | null> => {
      requireShown(submissionId, startedAt);
      for (const detail of tests) {
        const row = detail.uploads.find((u) => u.submissionId === submissionId);
        if (row) Object.assign(row, { status: 'submitted', lastError: null });
      }
      const found = submissions.find((s) => s.id === submissionId);
      if (found) Object.assign(found, { status: 'submitted', lastError: null });
      return 'next_check';
    }),
    // Like the server: the upload must hold the grading the page shows, and a
    // finished test goes back to evaluation. The upload is a row of a test's
    // uploads table, a detailed upload, or both.
    regradeSubmission: vi.fn(async (submissionId: number, gradedAt: string): Promise<RegradeAnswer> => {
      const found = submissions.find((s) => s.id === submissionId);
      const test = tests.find((t) => t.uploads.some((u) => u.submissionId === submissionId) || t.test.code === found?.testCode);
      const row = test?.uploads.find((u) => u.submissionId === submissionId);
      const status = found?.status ?? row?.status;
      if (status === undefined) throw notFound();
      const shown = found ? found.evaluation?.gradedAt : row?.gradedAt;
      if (status !== 'graded' || shown !== gradedAt) {
        throw new ApiError(409, 'not_graded', 'Lucrarea se corectează din nou. Reîncarcă pagina.');
      }
      const before = test?.test.status ?? found!.testStatus;
      const testStatus = before === 'done' ? 'evaluating' : before;
      if (found) Object.assign(found, { status: 'submitted', testStatus, evaluation: null });
      if (row) Object.assign(row, { status: 'submitted', grade: null, total: null, maxTotal: null, gradedAt: null, flagCount: 0, reviewPoints: [] });
      if (test) test.test.status = testStatus;
      return { count: 1, testStatus, robot: testStatus === 'evaluating' ? 'next_check' : null };
    }),
    // Like the server: the item must be in the result of the upload.
    correctItem: vi.fn(async (submissionId: number, itemId: number, change: ItemCorrection) => {
      const found = findSubmission(submissionId);
      const shown = found.evaluation?.gradedAt === change.gradedAt ? found.evaluation : undefined;
      const item = shown?.items.find((i) => i.id === itemId);
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
    reviewPages: vi.fn(async (submissionId: number, review: PagesReview) => {
      const found = findSubmission(submissionId);
      if (found.evaluation?.gradedAt !== review.gradedAt) throw new ApiError(409, 'not_graded', 'Lucrarea se corectează din nou. Reîncarcă pagina.');
      if (review.pagesReviewed !== undefined) found.evaluation.pagesReviewed = review.pagesReviewed;
      if (review.summary !== undefined) found.evaluation.summary = review.summary;
      if (review.strengths !== undefined) found.evaluation.strengths = [...review.strengths];
      if (review.recommendations !== undefined) found.evaluation.recommendations = [...review.recommendations];
      recount(found.evaluation);
      syncRow(found);
      return structuredClone(found);
    }),
    getSettings: vi.fn(async () => structuredClone(settings)),
    updateSettings: vi.fn(async (maxParallelAgents: number) => {
      settings.maxParallelAgents = maxParallelAgents;
      return structuredClone(settings);
    }),
    setShowModelColumn: vi.fn(async (show: boolean) => {
      settings.showModelColumn = show;
      return structuredClone(settings);
    }),
    newRobotKey: vi.fn(async () => {
      settings.hasRobotKey = true;
      settings.robotKeyAt = FAKE_ROBOT_KEY_AT;
      return FAKE_ROBOT_KEY;
    }),
    listPayments: vi.fn(async (): Promise<PaymentRow[]> => []),
    startCheckout: vi.fn(async (input: CheckoutInput) => `https://checkout.stripe.com/c/${input.feature}`),
  } satisfies AdminApi;
  return api;
}

export type FakeApi = ReturnType<typeof createFakeApi>;
