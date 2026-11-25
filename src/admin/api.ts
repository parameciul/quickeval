import { langHeaders } from '../i18n/lang.ts';
import type {
  DataVersion,
  Account,
  AccountDetail,
  AnalysisAnswer,
  BaremCheckedAnswer,
  BaremGenerateAnswer,
  BaremNotesAnswer,
  CesOffAnswer,
  ClassDetail,
  ClassReport,
  ClassSummary,
  CreateClassInput,
  CreateTestInput,
  EvaluationStart,
  ExerciseListAnswer,
  ItemCorrection,
  PagesReview,
  PrintRetryAnswer,
  RefusedAccount,
  RegradeAnswer,
  SubjectAnswer,
  FinishedTest,
  ReopenAnswer,
  UploadsClosedAnswer,
  ResultsOpenAnswer,
  ResultLinkAnswer,
  RobotStart,
  RobotStartAnswer,
  SearchResults,
  Settings,
  SignupInput,
  StartedTest,
  StoppedTest,
  StudentHistory,
  StudentRow,
  SubmissionDetail,
  MeAnswer,
  Teacher,
  TestDetail,
  TestFileAnswer,
  TestSummary,
  UpdateClassInput,
  Viewing,
} from '../../shared/api.ts';
import { CES_PATH, TEST_FILE_PATHS, uploadTypeOf, type TestFileKind, type TestVariant } from '../../shared/files.ts';
import type { CheckoutAnswer, CheckoutInput, PaymentRow } from '../../shared/payments.ts';
import type { Subject } from '../../shared/subjects.ts';
import type { UsagePeriod, UsageSource, UsageStats } from '../../shared/usage.ts';
import { studentResultPath } from '../../shared/api.ts';
import { ApiError, NETWORK_MESSAGE, readAnswer } from '../ui/ApiError.ts';
import { t } from '../i18n/t.ts';
import { believedViewHeader, goToSettings } from './shell/viewing.ts';

export { ApiError };

// The logged-in teacher, with the administrator's view of the account when one is on.
export interface Me extends Teacher {
  viewing: Viewing | null;
}

// Everything the teacher app asks the server. Pages get it from useApi(), so
// tests can pass a fake.
export interface AdminApi {
  // The address the calls and the file links start with: /api/admin, or
  // /api/try/<token> for a Quick Try's link.
  base: string;
  me(): Promise<Me>;
  // A text that changes with every change the pages show (DataVersion).
  dataVersion(): Promise<string>;
  login(email: string, password: string): Promise<Teacher>;
  // A new account first confirms its email, then waits for an administrator's approval.
  signup(input: SignupInput): Promise<void>;
  // The link from the confirmation email (its token), with the password chosen at the sign-up.
  confirmEmail(token: string, password: string): Promise<void>;
  // "Am uitat parola": a link goes to the email, if it has an account.
  forgotPassword(email: string): Promise<void>;
  // The link from the reset email (its token), with the new password.
  setNewPassword(token: string, newPassword: string): Promise<void>;
  logout(): Promise<void>;
  // Setări, administrators only: "Vezi ca" starts a read only view of a teacher's account.
  startView(accountId: number, password: string): Promise<Viewing>;
  // "Ieși" from the view; the administrator's own account shows again.
  endView(): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  // Setări, administrators only.
  listAccounts(): Promise<Account[]>;
  // "Detalii": one account with its history, what it made and what it used.
  getAccount(teacherId: number): Promise<AccountDetail>;
  // The newest requests an administrator refused; the accounts are gone.
  listRefusedAccounts(): Promise<RefusedAccount[]>;
  // Name the account the page shows by the time it was asked for: ids come back.
  approveAccount(teacherId: number, createdAt: string): Promise<void>;
  rejectAccount(teacherId: number, createdAt: string): Promise<void>;
  // "Refuză toate": how many went (those approved meanwhile stay).
  rejectAllAccounts(accounts: { id: number; createdAt: string }[]): Promise<number>;
  updateAccount(teacherId: number, change: { demo?: boolean; status?: 'active' | 'disabled' }): Promise<Account[]>;
  // Whether the test page shows the account "Indicații suplimentare pentru corectare".
  setShowBaremNotes(teacherId: number, show: boolean): Promise<Account[]>;
  // A new password for a teacher who forgot theirs: the only time the app sees it.
  resetPassword(teacherId: number): Promise<string>;
  listClasses(schoolYear: number): Promise<ClassSummary[]>;
  createClass(input: CreateClassInput): Promise<ClassSummary>;
  getClass(classId: number): Promise<ClassDetail>;
  updateClass(classId: number, input: UpdateClassInput): Promise<ClassSummary>;
  addStudents(classId: number, names: string[]): Promise<StudentRow[]>;
  setStudentActive(classId: number, studentId: number, active: boolean): Promise<StudentRow>;
  // Removes the student from the class; refused when the student has sent or graded work there.
  deleteStudent(classId: number, studentId: number): Promise<void>;
  renameStudent(studentId: number, fullName: string): Promise<{ id: number; fullName: string }>;
  // Marks the student as CES, or takes the mark away.
  setStudentCes(studentId: number, ces: boolean): Promise<{ id: number; ces: boolean }>;
  getStudentHistory(studentId: number): Promise<StudentHistory>;
  // The students, classes and tests of the year whose name holds the search.
  search(query: string, schoolYear: number): Promise<SearchResults>;
  listTests(schoolYear: number): Promise<TestSummary[]>;
  // Returns the code of the new test.
  createTest(input: CreateTestInput): Promise<string>;
  getTest(code: string): Promise<TestDetail>;
  renameTest(code: string, title: string): Promise<{ code: string; title: string }>;
  // "Schimbă": the test's subject, set by the teacher.
  setSubject(code: string, subject: Subject): Promise<SubjectAnswer>;
  deleteTest(code: string): Promise<void>;
  // `variant` "ces": the CES variant's file, comments, barem, print PDF or exercise list.
  uploadTestFile(code: string, kind: TestFileKind, file: File, variant?: TestVariant): Promise<TestFileAnswer>;
  // Extra teacher comments for the barem, read by the robot as part of it.
  saveBaremNotes(code: string, notes: string, variant?: TestVariant): Promise<BaremNotesAnswer>;
  // "Generează baremul": the robot writes a barem from the test file.
  generateBarem(code: string, variant?: TestVariant): Promise<BaremGenerateAnswer>;
  // "Am verificat baremul": names the files version the page showed.
  confirmBarem(code: string, filesVersion: number, variant?: TestVariant): Promise<BaremCheckedAnswer>;
  // "Șterge varianta CES": only while no paper went to grading with it.
  setCesOff(code: string, off: boolean): Promise<CesOffAnswer>;
  startTest(code: string): Promise<StartedTest>;
  // "Oprește testul": an open test with no student file is a draft again.
  stopTest(code: string): Promise<StoppedTest>;
  reopenTest(code: string): Promise<ReopenAnswer>;
  // "Marchează ca terminat": an open test whose sent papers are all graded is done.
  finishTest(code: string): Promise<FinishedTest>;
  // "Încearcă din nou" on a print PDF that failed, and "Pregătește testul cu
  // cod QR" on a draft made before tests got their link at once.
  retryPrint(code: string, variant?: TestVariant): Promise<PrintRetryAnswer>;
  // Puts a finished test in the archive, or takes it out. Resolves to the new mark.
  setTestArchived(code: string, archived: boolean): Promise<boolean>;
  // "Închide încărcarea" (closed) and its undo, on an open test: the grading does not start.
  setUploadsClosed(code: string, closed: boolean): Promise<UploadsClosedAnswer>;
  // The link that uploads for many students on one phone, made on its first copy or QR code.
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
  acceptExerciseList(code: string, variant?: TestVariant): Promise<RobotStart | null>;
  retryExerciseList(code: string, variant?: TestVariant): Promise<RobotStart | null>;
  // "Pornește robotul": work that a stopped run left in the test.
  startRobot(code: string): Promise<RobotStart>;
  // "Regenerează": the class analysis is written again.
  regenerateAnalysis(code: string): Promise<AnalysisAnswer>;
  // The rows of the class report.
  getReport(code: string): Promise<ClassReport>;
  // "Recorectează tot": graded and failed uploads wait for the robot again.
  regradeTest(code: string): Promise<RegradeAnswer>;
  getSubmission(submissionId: number): Promise<SubmissionDetail>;
  // One page of a paper as the student sent it (a photo or a PDF), for the
  // teacher to download or copy.
  submissionFile(submissionId: number, fileId: number): Promise<Blob>;
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
  // The usage statistics of a period (administrators only).
  getUsage(source: UsageSource, period: UsagePeriod): Promise<UsageStats>;
  updateSettings(maxParallelAgents: number): Promise<Settings>;
  // The Model column of the class report, for all tests.
  setShowModelColumn(show: boolean): Promise<Settings>;
  // A new robot key: the only time the app sees it.
  newRobotKey(): Promise<string>;
  // The teacher's own payments, newest first.
  listPayments(): Promise<PaymentRow[]>;
  // Resolves to the Stripe payment page for one feature of the catalog.
  startCheckout(input: CheckoutInput): Promise<string>;
}

// The part of a test's address that names its variant: the CES variant's
// routes are under /sen.
function variantPath(code: string, variant: TestVariant | undefined): string {
  return `/tests/${encodeURIComponent(code)}${variant === 'ces' ? `/${CES_PATH}` : ''}`;
}

export const ADMIN_BASE = '/api/admin';

// Files open straight from the API: the browser sends the login cookie (or
// the address carries a Quick Try's token, in `base`).
export function testFileUrl(code: string, kind: TestFileKind, variant?: TestVariant, base = ADMIN_BASE): string {
  return `${base}${variantPath(code, variant)}/files/${TEST_FILE_PATHS[kind]}`;
}

// The test with the QR code, made for printing.
export function printFileUrl(code: string, variant?: TestVariant): string {
  return `/api/admin${variantPath(code, variant)}/print`;
}

export function submissionFileUrl(submissionId: number, fileId: number, base = ADMIN_BASE): string {
  return `${base}/submissions/${submissionId}/files/${fileId}`;
}

// The address to share with a student for one result page.
export function studentResultUrl(resultToken: string): string {
  return `${window.location.origin}${studentResultPath(resultToken)}`;
}


// A login page in front of the app (Cloudflare Access, while it still guards
// /teacher) answered instead of the API. The app reloads the page so it shows.
export class LoginExpiredError extends Error {
  constructor() {
    super(t('Sesiunea a expirat. Reîncarcă pagina ca să intri din nou.'));
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

// The view this tab shows, claimed on every admin request: the server answers
// 409 when that view is no longer the one the cookie carries. Nothing before
// the first /me.
function claimHeaders(): Record<string, string> {
  const claim = believedViewHeader();
  return claim === undefined ? {} : { 'X-MQ-View': claim };
}

export interface ApiClientOptions {
  fetchImpl?: typeof fetch;
  onLoginExpired?: () => void;
  // /api/admin by default; a Quick Try's page passes /api/try/<token>. The
  // login calls keep /api/auth.
  base?: string;
  // The view of a teacher's account ended (the server answered 409
  // impersonation_ended); Setări by default.
  onViewEnded?: () => void;
}

export function createApiClient(options: ApiClientOptions = {}): AdminApi {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const onLoginExpired = options.onLoginExpired ?? reloadForLogin;
  const apiBase = options.base ?? ADMIN_BASE;
  const onViewEnded = options.onViewEnded ?? (apiBase === ADMIN_BASE ? () => goToSettings(true) : () => undefined);

  // A JSON body, or a file sent raw with its type and URI-encoded name.
  // `base` is the client's base, or /api/auth for the login page.
  async function request<T>(method: string, path: string, body?: unknown, file?: File, base = apiBase): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json', ...langHeaders(), ...(base === ADMIN_BASE ? claimHeaders() : {}) };
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
      res = await fetchImpl(`${base}${path}`, {
        method,
        headers,
        credentials: 'same-origin',
        // An expired Access session answers with a redirect to its login page on
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
    try {
      return await readAnswer<T>(res);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.code === 'impersonation_ended') onViewEnded();
      throw error;
    }
  }

  // A file of the API, as it is: its bytes, or the API's error.
  async function file(path: string): Promise<Blob> {
    let res: Response;
    try {
      res = await fetchImpl(`${apiBase}${path}`, { method: 'GET', headers: { ...langHeaders(), ...(apiBase === ADMIN_BASE ? claimHeaders() : {}) }, credentials: 'same-origin', redirect: 'manual' });
    } catch {
      throw new ApiError(0, 'network', NETWORK_MESSAGE);
    }
    const isJson = (res.headers.get('Content-Type') ?? '').includes('application/json');
    if (res.type === 'opaqueredirect' || ((res.status === 401 || res.status === 403) && !isJson)) {
      onLoginExpired();
      throw new LoginExpiredError();
    }
    if (!res.ok) {
      try {
        return await readAnswer<never>(res);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409 && error.code === 'impersonation_ended') onViewEnded();
        throw error;
      }
    }
    return res.blob();
  }

  const test = (code: string) => `/tests/${encodeURIComponent(code)}`;

  return {
    base: apiBase,
    me: async () => {
      const answer = await request<MeAnswer>('GET', '/me');
      return { ...answer.teacher, viewing: answer.viewing ?? null };
    },
    dataVersion: async () => (await request<DataVersion>('GET', '/version')).version,
    login: async (email, password) =>
      (await request<{ teacher: Teacher }>('POST', '/login', { email, password }, undefined, '/api/auth')).teacher,
    signup: async (input) => {
      await request('POST', '/signup', input, undefined, '/api/auth');
    },
    confirmEmail: async (token, password) => {
      await request('POST', '/confirm', { token, password }, undefined, '/api/auth');
    },
    forgotPassword: async (email) => {
      await request('POST', '/forgot-password', { email }, undefined, '/api/auth');
    },
    setNewPassword: async (token, newPassword) => {
      await request('POST', '/reset-password', { token, newPassword }, undefined, '/api/auth');
    },
    startView: async (accountId, password) =>
      (await request<{ viewing: Viewing }>('POST', `/accounts/${accountId}/impersonation`, { mode: 'view', password })).viewing,
    endView: async () => {
      await request('DELETE', '/impersonation');
    },
    logout: async () => {
      await request('POST', '/logout', undefined, undefined, '/api/auth');
    },
    changePassword: async (currentPassword, newPassword) => {
      await request('POST', '/account/password', { currentPassword, newPassword });
    },
    listAccounts: async () => (await request<{ accounts: Account[] }>('GET', '/accounts')).accounts,
    getAccount: (teacherId) => request<AccountDetail>('GET', `/accounts/${teacherId}`),
    listRefusedAccounts: async () => (await request<{ refused: RefusedAccount[] }>('GET', '/accounts/refused')).refused,
    approveAccount: async (teacherId, createdAt) => {
      await request('POST', `/accounts/${teacherId}/approve`, { createdAt });
    },
    rejectAccount: async (teacherId, createdAt) => {
      await request('POST', `/accounts/${teacherId}/reject`, { createdAt });
    },
    rejectAllAccounts: async (accounts) => (await request<{ deleted: number }>('POST', '/accounts/reject-all', { accounts })).deleted,
    updateAccount: async (teacherId, change) =>
      (await request<{ accounts: Account[] }>('PATCH', `/accounts/${teacherId}`, change)).accounts,
    setShowBaremNotes: async (teacherId, show) =>
      (await request<{ accounts: Account[] }>('PUT', `/accounts/${teacherId}/marking-scheme-notes`, { show })).accounts,
    resetPassword: async (teacherId) => (await request<{ password: string }>('POST', `/accounts/${teacherId}/password`)).password,
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
    setStudentCes: async (studentId, ces) =>
      (await request<{ student: { id: number; ces: boolean } }>('PUT', `/students/${studentId}/${CES_PATH}`, { ces })).student,
    getStudentHistory: (studentId) => request<StudentHistory>('GET', `/students/${studentId}/history`),
    search: (query, schoolYear) => request<SearchResults>('GET', `/search?q=${encodeURIComponent(query)}&year=${schoolYear}`),
    listTests: async (schoolYear) => (await request<{ tests: TestSummary[] }>('GET', `/tests?year=${schoolYear}`)).tests,
    createTest: async (input) => (await request<{ code: string }>('POST', '/tests', input)).code,
    getTest: (code) => request<TestDetail>('GET', test(code)),
    renameTest: (code, title) => request<{ code: string; title: string }>('PATCH', test(code), { title }),
    setSubject: (code, subject) => request<SubjectAnswer>('PUT', `${test(code)}/subject`, { subject }),
    deleteTest: async (code) => {
      await request('DELETE', test(code));
    },
    uploadTestFile: (code, kind, file, variant) => request<TestFileAnswer>('PUT', `${variantPath(code, variant)}/files/${TEST_FILE_PATHS[kind]}`, undefined, file),
    saveBaremNotes: (code, notes, variant) => request<BaremNotesAnswer>('PUT', `${variantPath(code, variant)}/marking-scheme-notes`, { notes }),
    generateBarem: (code, variant) => request<BaremGenerateAnswer>('POST', `${variantPath(code, variant)}/marking-scheme/generate`),
    confirmBarem: (code, filesVersion, variant) =>
      request<BaremCheckedAnswer>('POST', `${variantPath(code, variant)}/marking-scheme/checked`, { filesVersion }),
    setCesOff: (code, off) => request<CesOffAnswer>('PUT', `${test(code)}/${CES_PATH}/off`, { off }),
    startTest: (code) => request<StartedTest>('POST', `${test(code)}/start`),
    stopTest: (code) => request<StoppedTest>('POST', `${test(code)}/stop`),
    setUploadsClosed: (code, closed) => request<UploadsClosedAnswer>('POST', `${test(code)}/uploads/${closed ? 'close' : 'open'}`),
    createMultiUploadLink: async (code) =>
      (await request<{ multiUploadToken: string }>('POST', `${test(code)}/multi-link`)).multiUploadToken,
    setResultsOpen: async (code, open) =>
      (await request<ResultsOpenAnswer>('POST', `${test(code)}/results/${open ? 'open' : 'close'}`)).resultsOpen,
    setSubmissionResultsOpen: async (submissionId, startedAt, open) =>
      (await request<ResultsOpenAnswer>('POST', `/submissions/${submissionId}/results/${open ? 'open' : 'close'}`, { startedAt })).resultsOpen,
    reopenTest: (code) => request<ReopenAnswer>('POST', `${test(code)}/reopen`),
    finishTest: (code) => request<FinishedTest>('POST', `${test(code)}/finish`),
    retryPrint: (code, variant) => request<PrintRetryAnswer>('POST', `${variantPath(code, variant)}/print/retry`),
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
    acceptExerciseList: async (code, variant) =>
      (await request<ExerciseListAnswer>('POST', `${variantPath(code, variant)}/exercise-list/accept`)).robot,
    retryExerciseList: async (code, variant) =>
      (await request<ExerciseListAnswer>('POST', `${variantPath(code, variant)}/exercise-list/retry`)).robot,
    startRobot: async (code) => (await request<RobotStartAnswer>('POST', `${test(code)}/robot`)).robot,
    regenerateAnalysis: (code) => request<AnalysisAnswer>('POST', `${test(code)}/analysis/regenerate`),
    getReport: async (code) => (await request<{ report: ClassReport }>('GET', `${test(code)}/report`)).report,
    regradeTest: (code) => request<RegradeAnswer>('POST', `${test(code)}/regrade`),
    getSubmission: async (submissionId) =>
      (await request<{ submission: SubmissionDetail }>('GET', `/submissions/${submissionId}`)).submission,
    submissionFile: (submissionId, fileId) => file(`/submissions/${submissionId}/files/${fileId}`),
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
    getUsage: async (source, period) => (await request<{ stats: UsageStats }>('GET', `/stats?source=${source}&period=${period}`)).stats,
    updateSettings: async (maxParallelAgents) =>
      (await request<{ settings: Settings }>('PATCH', '/settings', { maxParallelAgents })).settings,
    setShowModelColumn: async (showModelColumn) =>
      (await request<{ settings: Settings }>('PATCH', '/settings', { showModelColumn })).settings,
    newRobotKey: async () => (await request<{ key: string }>('POST', '/settings/robot-key')).key,
    listPayments: async () => (await request<{ payments: PaymentRow[] }>('GET', '/payments')).payments,
    startCheckout: async (input) => (await request<CheckoutAnswer>('POST', '/payments/checkout', input)).url,
  };
}
