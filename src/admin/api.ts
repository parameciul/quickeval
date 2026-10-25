import type {
  AnalysisAnswer,
  BaremNotesAnswer,
  ClassDetail,
  ClassReport,
  ClassSummary,
  CreateClassInput,
  CreateTestInput,
  EvaluationStart,
  ExerciseListAnswer,
  ItemCorrection,
  PagesReview,
  RegradeAnswer,
  ResultsOpenAnswer,
  ResultLinkAnswer,
  RobotStart,
  RobotStartAnswer,
  Settings,
  PrintRetryAnswer,
  ReopenAnswer,
  StartedTest,
  StudentHistory,
  StudentRow,
  SubmissionDetail,
  Teacher,
  TestDetail,
  TestFileAnswer,
  TestSummary,
  UpdateClassInput,
} from '../../shared/api.ts';
import { uploadTypeOf, type TestFileKind } from '../../shared/files.ts';
import { studentResultPath } from '../../shared/api.ts';
import { ApiError, NETWORK_MESSAGE, readAnswer } from '../ui/ApiError.ts';

export { ApiError };

// Everything the teacher app asks the server. Pages get it from useApi(), so
// tests can pass a fake.
export interface AdminApi {
  me(): Promise<Teacher>;
  listClasses(schoolYear: number): Promise<ClassSummary[]>;
  createClass(input: CreateClassInput): Promise<ClassSummary>;
  getClass(classId: number): Promise<ClassDetail>;
  updateClass(classId: number, input: UpdateClassInput): Promise<ClassSummary>;
  addStudents(classId: number, names: string[]): Promise<StudentRow[]>;
  setStudentActive(classId: number, studentId: number, active: boolean): Promise<StudentRow>;
  // Removes the student from the class; refused when the student has sent or graded work there.
  deleteStudent(classId: number, studentId: number): Promise<void>;
  renameStudent(studentId: number, fullName: string): Promise<{ id: number; fullName: string }>;
  getStudentHistory(studentId: number): Promise<StudentHistory>;
  listTests(schoolYear: number): Promise<TestSummary[]>;
  // Returns the code of the new test.
  createTest(input: CreateTestInput): Promise<string>;
  getTest(code: string): Promise<TestDetail>;
  renameTest(code: string, title: string): Promise<{ code: string; title: string }>;
  deleteTest(code: string): Promise<void>;
  uploadTestFile(code: string, kind: TestFileKind, file: File): Promise<TestFileAnswer>;
  // Extra teacher comments for the barem, read by the robot as part of it.
  saveBaremNotes(code: string, notes: string): Promise<BaremNotesAnswer>;
  startTest(code: string): Promise<StartedTest>;
  reopenTest(code: string): Promise<ReopenAnswer>;
  // "Încearcă din nou" on a print PDF that failed.
  retryPrint(code: string): Promise<PrintRetryAnswer>;
  // Puts a finished test in the archive, or takes it out. Resolves to the new mark.
  setTestArchived(code: string, archived: boolean): Promise<boolean>;
  // The link that uploads for many students on one phone, made only on demand.
  createMultiUploadLink(code: string): Promise<string>;
  // Opens or closes the students' result pages of a test.
  setResultsOpen(code: string, open: boolean): Promise<boolean>;
  // Publishes one student's result page, or takes it back, while the rest of
  // the class stays as it is.
  setSubmissionResultsOpen(submissionId: number, startedAt: string, open: boolean): Promise<boolean>;
  // Now without `at`, or at that ISO time. With `submissionIds`, now only
  // the selected uploads are graded.
  evaluateTest(code: string, at?: string, submissionIds?: number[]): Promise<EvaluationStart>;
  cancelSchedule(code: string): Promise<void>;
  // The robot answers are null when the robot was not needed.
  acceptExerciseList(code: string): Promise<RobotStart | null>;
  retryExerciseList(code: string): Promise<RobotStart | null>;
  // "Pornește robotul": work that a stopped run left in the test.
  startRobot(code: string): Promise<RobotStart>;
  // "Regenerează": the class analysis is written again.
  regenerateAnalysis(code: string): Promise<AnalysisAnswer>;
  // The rows of the class report.
  getReport(code: string): Promise<ClassReport>;
  // "Recorectează tot": graded and failed uploads wait for the robot again.
  regradeTest(code: string): Promise<RegradeAnswer>;
  getSubmission(submissionId: number): Promise<SubmissionDetail>;
  // The teacher's link to one student's result page, for sharing.
  getResultLink(submissionId: number, startedAt: string): Promise<string>;
  // The actions on an upload name the upload the page shows by the time it
  // started (`startedAt`): an old page changes nothing of another student.
  resetSubmission(submissionId: number, startedAt: string): Promise<void>;
  retrySubmission(submissionId: number, startedAt: string): Promise<RobotStart | null>;
  regradeSubmission(submissionId: number, gradedAt: string): Promise<RegradeAnswer>;
  // The teacher's corrections answer with the whole upload: new total and grade.
  correctItem(submissionId: number, itemId: number, correction: ItemCorrection): Promise<SubmissionDetail>;
  reviewPages(submissionId: number, review: PagesReview): Promise<SubmissionDetail>;
  getSettings(): Promise<Settings>;
  updateSettings(maxParallelAgents: number): Promise<Settings>;
  // The Model column of the class report, for all tests.
  setShowModelColumn(show: boolean): Promise<Settings>;
  // A new robot key: the only time the app sees it.
  newRobotKey(): Promise<string>;
}

// Files open straight from the API: the browser sends the Access login cookie.
export function testFileUrl(code: string, kind: TestFileKind): string {
  return `/api/admin/tests/${encodeURIComponent(code)}/files/${kind}`;
}

// The test with the QR code, made for printing.
export function printFileUrl(code: string): string {
  return `/api/admin/tests/${encodeURIComponent(code)}/print`;
}

export function submissionFileUrl(submissionId: number, fileId: number): string {
  return `/api/admin/submissions/${submissionId}/files/${fileId}`;
}

// The address to share with a student for one result page.
export function studentResultUrl(resultToken: string): string {
  return `${window.location.origin}${studentResultPath(resultToken)}`;
}


// The Cloudflare Access login ended. The app reloads the page so Access shows
// its login screen.
export class LoginExpiredError extends Error {
  constructor() {
    super('Sesiunea a expirat. Reîncarcă pagina ca să intri din nou.');
  }
}

const RELOAD_KEY = 'quickeval.loginReloadAt';
const RELOAD_GAP_MS = 10_000;

// Reloads at most once per 10 seconds, so a broken login can never cause a reload loop.
// The parameters exist for tests; the defaults reload the real page.
export function reloadForLogin(reload: () => void = () => window.location.reload(), now: () => number = Date.now): void {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (now() - last < RELOAD_GAP_MS) return;
    sessionStorage.setItem(RELOAD_KEY, String(now()));
  } catch {
    return;
  }
  reload();
}

export interface ApiClientOptions {
  fetchImpl?: typeof fetch;
  onLoginExpired?: () => void;
}

export function createApiClient(options: ApiClientOptions = {}): AdminApi {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const onLoginExpired = options.onLoginExpired ?? reloadForLogin;

  // A JSON body, or a file sent raw with its type and URI-encoded name.
  async function request<T>(method: string, path: string, body?: unknown, file?: File): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    let payload: BodyInit | undefined;
    if (file) {
      headers['Content-Type'] = uploadTypeOf(file) || 'application/octet-stream';
      headers['X-File-Name'] = encodeURIComponent(file.name);
      payload = file;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await fetchImpl(`/api/admin${path}`, {
        method,
        headers,
        credentials: 'same-origin',
        // An expired Access session answers with a redirect to the login page on
        // another origin. 'manual' turns it into an opaqueredirect response here.
        redirect: 'manual',
        ...(payload === undefined ? {} : { body: payload }),
      });
    } catch {
      throw new ApiError(0, 'network', NETWORK_MESSAGE);
    }
    const isJson = (res.headers.get('Content-Type') ?? '').includes('application/json');
    if (res.type === 'opaqueredirect' || ((res.status === 401 || res.status === 403) && !isJson)) {
      onLoginExpired();
      throw new LoginExpiredError();
    }
    return readAnswer<T>(res);
  }

  const test = (code: string) => `/tests/${encodeURIComponent(code)}`;

  return {
    me: async () => (await request<{ teacher: Teacher }>('GET', '/me')).teacher,
    listClasses: async (schoolYear) =>
      (await request<{ classes: ClassSummary[] }>('GET', `/classes?year=${schoolYear}`)).classes,
    createClass: async (input) => (await request<{ class: ClassSummary }>('POST', '/classes', input)).class,
    getClass: (classId) => request<ClassDetail>('GET', `/classes/${classId}`),
    updateClass: async (classId, input) =>
      (await request<{ class: ClassSummary }>('PATCH', `/classes/${classId}`, input)).class,
    addStudents: async (classId, names) =>
      (await request<{ students: StudentRow[] }>('POST', `/classes/${classId}/students`, { names })).students,
    setStudentActive: async (classId, studentId, active) =>
      (await request<{ student: StudentRow }>('PATCH', `/classes/${classId}/students/${studentId}`, { active })).student,
    deleteStudent: async (classId, studentId) => {
      await request('DELETE', `/classes/${classId}/students/${studentId}`);
    },
    renameStudent: async (studentId, fullName) =>
      (await request<{ student: { id: number; fullName: string } }>('PATCH', `/students/${studentId}`, { fullName })).student,
    getStudentHistory: (studentId) => request<StudentHistory>('GET', `/students/${studentId}/history`),
    listTests: async (schoolYear) => (await request<{ tests: TestSummary[] }>('GET', `/tests?year=${schoolYear}`)).tests,
    createTest: async (input) => (await request<{ code: string }>('POST', '/tests', input)).code,
    getTest: (code) => request<TestDetail>('GET', test(code)),
    renameTest: (code, title) => request<{ code: string; title: string }>('PATCH', test(code), { title }),
    deleteTest: async (code) => {
      await request('DELETE', test(code));
    },
    uploadTestFile: (code, kind, file) => request<TestFileAnswer>('PUT', `${test(code)}/files/${kind}`, undefined, file),
    saveBaremNotes: (code, notes) => request<BaremNotesAnswer>('PUT', `${test(code)}/barem-notes`, { notes }),
    startTest: (code) => request<StartedTest>('POST', `${test(code)}/start`),
    createMultiUploadLink: async (code) =>
      (await request<{ multiUploadToken: string }>('POST', `${test(code)}/multi-link`)).multiUploadToken,
    setResultsOpen: async (code, open) =>
      (await request<ResultsOpenAnswer>('POST', `${test(code)}/results/${open ? 'open' : 'close'}`)).resultsOpen,
    setSubmissionResultsOpen: async (submissionId, startedAt, open) =>
      (await request<ResultsOpenAnswer>('POST', `/submissions/${submissionId}/results/${open ? 'open' : 'close'}`, { startedAt })).resultsOpen,
    reopenTest: (code) => request<ReopenAnswer>('POST', `${test(code)}/reopen`),
    retryPrint: (code) => request<PrintRetryAnswer>('POST', `${test(code)}/print/retry`),
    setTestArchived: async (code, archived) =>
      (await request<{ archived: boolean }>('POST', `${test(code)}/${archived ? 'archive' : 'unarchive'}`)).archived,
    evaluateTest: (code, at, submissionIds) =>
      request<EvaluationStart>(
        'POST',
        `${test(code)}/evaluate`,
        at === undefined && submissionIds === undefined ? {} : { ...(at === undefined ? {} : { at }), ...(submissionIds === undefined ? {} : { submissionIds }) },
      ),
    cancelSchedule: async (code) => {
      await request('DELETE', `${test(code)}/schedule`);
    },
    acceptExerciseList: async (code) =>
      (await request<ExerciseListAnswer>('POST', `${test(code)}/exercise-list/accept`)).robot,
    retryExerciseList: async (code) =>
      (await request<ExerciseListAnswer>('POST', `${test(code)}/exercise-list/retry`)).robot,
    startRobot: async (code) => (await request<RobotStartAnswer>('POST', `${test(code)}/robot`)).robot,
    regenerateAnalysis: (code) => request<AnalysisAnswer>('POST', `${test(code)}/analysis/regenerate`),
    getReport: async (code) => (await request<{ report: ClassReport }>('GET', `${test(code)}/report`)).report,
    regradeTest: (code) => request<RegradeAnswer>('POST', `${test(code)}/regrade`),
    getSubmission: async (submissionId) =>
      (await request<{ submission: SubmissionDetail }>('GET', `/submissions/${submissionId}`)).submission,
    getResultLink: async (submissionId, startedAt) =>
      (await request<ResultLinkAnswer>('GET', `/submissions/${submissionId}/result-link?startedAt=${encodeURIComponent(startedAt)}`)).resultToken,
    resetSubmission: async (submissionId, startedAt) => {
      await request('POST', `/submissions/${submissionId}/reset`, { startedAt });
    },
    retrySubmission: async (submissionId, startedAt) =>
      (await request<{ robot: RobotStart | null }>('POST', `/submissions/${submissionId}/retry`, { startedAt })).robot,
    regradeSubmission: (submissionId, gradedAt) => request<RegradeAnswer>('POST', `/submissions/${submissionId}/regrade`, { gradedAt }),
    correctItem: async (submissionId, itemId, correction) =>
      (await request<{ submission: SubmissionDetail }>('PATCH', `/submissions/${submissionId}/items/${itemId}`, correction)).submission,
    reviewPages: async (submissionId, review) =>
      (await request<{ submission: SubmissionDetail }>('PATCH', `/submissions/${submissionId}/evaluation`, review)).submission,
    getSettings: async () => (await request<{ settings: Settings }>('GET', '/settings')).settings,
    updateSettings: async (maxParallelAgents) =>
      (await request<{ settings: Settings }>('PATCH', '/settings', { maxParallelAgents })).settings,
    setShowModelColumn: async (showModelColumn) =>
      (await request<{ settings: Settings }>('PATCH', '/settings', { showModelColumn })).settings,
    newRobotKey: async () => (await request<{ key: string }>('POST', '/settings/robot-key')).key,
  };
}
