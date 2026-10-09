import type {
  ClassDetail,
  ClassSummary,
  CreateClassInput,
  CreateTestInput,
  EvaluationStart,
  ExerciseListAnswer,
  RobotStart,
  RobotStartAnswer,
  Settings,
  StartedTest,
  StudentRow,
  SubmissionDetail,
  Teacher,
  TestDetail,
  TestFileAnswer,
  TestSummary,
  UpdateClassInput,
} from '../../shared/api.ts';
import { uploadTypeOf, type TestFileKind } from '../../shared/files.ts';
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
  renameStudent(studentId: number, fullName: string): Promise<{ id: number; fullName: string }>;
  listTests(schoolYear: number): Promise<TestSummary[]>;
  // Returns the code of the new test.
  createTest(input: CreateTestInput): Promise<string>;
  getTest(code: string): Promise<TestDetail>;
  renameTest(code: string, title: string): Promise<{ code: string; title: string }>;
  deleteTest(code: string): Promise<void>;
  uploadTestFile(code: string, kind: TestFileKind, file: File): Promise<TestFileAnswer>;
  startTest(code: string): Promise<StartedTest>;
  reopenTest(code: string): Promise<void>;
  // Now without `at`, or at that ISO time.
  evaluateTest(code: string, at?: string): Promise<EvaluationStart>;
  cancelSchedule(code: string): Promise<void>;
  // The robot answers are null when the robot was not needed.
  acceptExerciseList(code: string): Promise<RobotStart | null>;
  retryExerciseList(code: string): Promise<RobotStart | null>;
  // "Pornește robotul": work that a stopped run left in the test.
  startRobot(code: string): Promise<RobotStart>;
  getSubmission(submissionId: number): Promise<SubmissionDetail>;
  resetSubmission(submissionId: number): Promise<void>;
  retrySubmission(submissionId: number): Promise<RobotStart | null>;
  getSettings(): Promise<Settings>;
  updateSettings(maxParallelAgents: number): Promise<Settings>;
  // A new robot key: the only time the app sees it.
  newRobotKey(): Promise<string>;
}

// Files open straight from the API: the browser sends the Access login cookie.
export function testFileUrl(code: string, kind: TestFileKind): string {
  return `/api/admin/tests/${encodeURIComponent(code)}/files/${kind}`;
}

export function submissionFileUrl(submissionId: number, fileId: number): string {
  return `/api/admin/submissions/${submissionId}/files/${fileId}`;
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
    renameStudent: async (studentId, fullName) =>
      (await request<{ student: { id: number; fullName: string } }>('PATCH', `/students/${studentId}`, { fullName })).student,
    listTests: async (schoolYear) => (await request<{ tests: TestSummary[] }>('GET', `/tests?year=${schoolYear}`)).tests,
    createTest: async (input) => (await request<{ code: string }>('POST', '/tests', input)).code,
    getTest: (code) => request<TestDetail>('GET', test(code)),
    renameTest: (code, title) => request<{ code: string; title: string }>('PATCH', test(code), { title }),
    deleteTest: async (code) => {
      await request('DELETE', test(code));
    },
    uploadTestFile: (code, kind, file) => request<TestFileAnswer>('PUT', `${test(code)}/files/${kind}`, undefined, file),
    startTest: (code) => request<StartedTest>('POST', `${test(code)}/start`),
    reopenTest: async (code) => {
      await request('POST', `${test(code)}/reopen`);
    },
    evaluateTest: (code, at) => request<EvaluationStart>('POST', `${test(code)}/evaluate`, at === undefined ? {} : { at }),
    cancelSchedule: async (code) => {
      await request('DELETE', `${test(code)}/schedule`);
    },
    acceptExerciseList: async (code) =>
      (await request<ExerciseListAnswer>('POST', `${test(code)}/exercise-list/accept`)).robot,
    retryExerciseList: async (code) =>
      (await request<ExerciseListAnswer>('POST', `${test(code)}/exercise-list/retry`)).robot,
    startRobot: async (code) => (await request<RobotStartAnswer>('POST', `${test(code)}/robot`)).robot,
    getSubmission: async (submissionId) =>
      (await request<{ submission: SubmissionDetail }>('GET', `/submissions/${submissionId}`)).submission,
    resetSubmission: async (submissionId) => {
      await request('POST', `/submissions/${submissionId}/reset`);
    },
    retrySubmission: async (submissionId) =>
      (await request<{ robot: RobotStart | null }>('POST', `/submissions/${submissionId}/retry`)).robot,
    getSettings: async () => (await request<{ settings: Settings }>('GET', '/settings')).settings,
    updateSettings: async (maxParallelAgents) =>
      (await request<{ settings: Settings }>('PATCH', '/settings', { maxParallelAgents })).settings,
    newRobotKey: async () => (await request<{ key: string }>('POST', '/settings/robot-key')).key,
  };
}
