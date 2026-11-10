import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import type { EvaluationStart, QuickTryInfo, StudentResultView, SubmissionFile } from '../../shared/api.ts';
import { QUICK_TRY_CLASS, QUICK_TRY_STUDENT, QUICK_TRY_TITLE } from '../../shared/quickTry.ts';
import type { AdminApi } from '../admin/api.ts';
import { ApiError } from '../ui/ApiError.ts';
import type { TryApi } from '../try/api.ts';
import { TryRoutes } from '../try/TryApp.tsx';
import { fakeTest, fakeUpload, type FakeApi } from './fakeApi.ts';

export const TRY_TOKEN = 'abcdefghijkmnopqrstuvwxyz2345672';
export const TRY_CODE = 'PROBA-26T1';
export const TRY_SUBMISSION = 501;

// The calls of the teacher app's client a try's link allows (the allow-list of
// server/routes/quickTry.ts). A page test that reaches any other call fails.
export const TRY_ADMIN_CALLS = ['getTest', 'renameTest', 'uploadTestFile', 'generateBarem', 'acceptExerciseList', 'getSubmission', 'correctItem', 'reviewPages'] as const;

// The fake teacher app's client as a try's link sees it: base /api/try/<token>,
// and every call outside TRY_ADMIN_CALLS throws.
export function tryAdminApi(api: FakeApi): AdminApi {
  const allowed = new Set<string>(TRY_ADMIN_CALLS);
  return new Proxy(api, {
    get(target, key, receiver) {
      if (key === 'base') return `/api/try/${TRY_TOKEN}`;
      const value = Reflect.get(target, key, receiver) as unknown;
      if (typeof key === 'string' && typeof value === 'function' && !allowed.has(key)) {
        return () => {
          throw new Error(`A try's link does not allow ${key}()`);
        };
      }
      return value;
    },
  }) as AdminApi;
}

// The try's test, as GET /api/try/<token>/tests/<code> answers: an open test of
// class PROBA with one student and its one paper.
export function tryTest(overrides: Parameters<typeof fakeTest>[0] = {}, upload: Partial<Parameters<typeof fakeUpload>[0]> = {}) {
  return fakeTest({ code: TRY_CODE, title: QUICK_TRY_TITLE, className: QUICK_TRY_CLASS, status: 'open', ...overrides }, [
    fakeUpload({ studentId: 1, studentName: QUICK_TRY_STUDENT, submissionId: TRY_SUBMISSION, status: 'uploading', ...upload }),
  ]);
}

export interface FakeTryData {
  info?: Partial<QuickTryInfo>;
  pages?: SubmissionFile[];
  result?: StudentResultView;
}

// An in-memory TryApi. `start` answers like the server for a ready try.
export function createFakeTryApi(data: FakeTryData = {}) {
  let nextId = 900;
  const pages = (data.pages ??= []);
  const info: QuickTryInfo = { code: TRY_CODE, submissionId: TRY_SUBMISSION, expiresAt: '2026-11-17T10:00:00.000Z', expired: false, ...data.info };
  const api = {
    info: vi.fn(async () => structuredClone(info)),
    listPages: vi.fn(async () => structuredClone(pages)),
    addPage: vi.fn(async (file: File) => {
      const stored: SubmissionFile = { id: nextId++, name: file.name, contentType: file.type, size: file.size, position: pages.length + 1 };
      pages.push(stored);
      return structuredClone(stored);
    }),
    deletePage: vi.fn(async (fileId: number) => {
      const index = pages.findIndex((page) => page.id === fileId);
      if (index < 0) throw new ApiError(404, 'not_found', 'Nu am găsit fișierul.');
      pages.splice(index, 1);
    }),
    start: vi.fn(async (_filesVersion?: number): Promise<EvaluationStart> => ({ status: 'evaluating', evaluationAt: null, robot: 'dispatched' })),
    result: vi.fn(async () => {
      if (!data.result) throw new ApiError(404, 'unknown_try', 'Linkul nu este bun.');
      return structuredClone(data.result);
    }),
  } satisfies TryApi;
  return api;
}

export type FakeTryApi = ReturnType<typeof createFakeTryApi>;

// Renders a try's page at a path under /try/<token> (without that base), with
// the fake clients. `extra` is drawn inside the router.
export function renderTry(path: string, api: FakeApi, tryApi: FakeTryApi, extra?: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        {extra}
        <TryRoutes token={TRY_TOKEN} api={tryAdminApi(api)} tryApi={tryApi} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
