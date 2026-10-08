import { vi } from 'vitest';
import type {
  ClassSummary,
  EvaluationStart,
  RobotStart,
  StudentRow,
  SubmissionDetail,
  TestDetail,
  TestInfo,
  TestSummary,
  UploadRow,
} from '../../shared/api.ts';
import { normalizeClassName } from '../../shared/classes.ts';
import { uploadTypeOf, type TestFileKind } from '../../shared/files.ts';
import { buildTestCode } from '../../shared/tests.ts';
import { ApiError, type AdminApi } from '../admin/api.ts';

// An in-memory AdminApi for page tests. Every method is a vi.fn, so tests can
// check calls or replace one answer with mockRejectedValueOnce.
export interface FakeData {
  classes: ClassSummary[];
  students: Record<number, StudentRow[]>;
  tests?: TestDetail[];
  submissions?: SubmissionDetail[];
}

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
      uploadToken: null,
      files: { test: null, barem: null },
      exerciseList: { status: 'none', message: null },
      ...overrides,
    },
    uploads,
    robot: { lastCheckAt: null },
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

export function createFakeApi(data: FakeData = { classes: [], students: {} }) {
  let nextId = 1000;
  const tests = (data.tests ??= []);
  const submissions = (data.submissions ??= []);
  const countActive = (classId: number) => (data.students[classId] ?? []).filter((s) => s.active).length;
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
    uploadTestFile: vi.fn(async (code: string, kind: TestFileKind, file: File) => {
      const info = { name: file.name, type: uploadTypeOf(file) };
      findTest(code).test.files[kind] = info;
      return info;
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
    acceptExerciseList: vi.fn(async (code: string) => {
      findTest(code).test.exerciseList.status = 'accepted';
    }),
    retryExerciseList: vi.fn(async (code: string): Promise<RobotStart | null> => {
      const found = findTest(code).test;
      found.exerciseList = { status: 'none', message: null };
      return found.status === 'evaluating' ? 'next_check' : null;
    }),
    getSubmission: vi.fn(async (submissionId: number) => {
      const found = submissions.find((s) => s.id === submissionId);
      if (!found) throw notFound();
      return structuredClone(found);
    }),
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
      return 'next_check';
    }),
  } satisfies AdminApi;
  return api;
}

export type FakeApi = ReturnType<typeof createFakeApi>;
