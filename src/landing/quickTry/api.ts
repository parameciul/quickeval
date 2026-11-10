import type { QuickTryAvailability, QuickTryCreated, TestDetail } from '../../../shared/api.ts';
import type { TestFileKind } from '../../../shared/files.ts';
import { apiRequest, tryBase } from '../../try/api.ts';

// The calls of the landing page's Quick Try form: what it reads before the
// form, the new try, and, through the try's link, the files, the start and
// the test the status line follows. Tests pass a fake.
export interface LandingApi {
  availability(): Promise<QuickTryAvailability>;
  create(turnstileToken: string | undefined): Promise<QuickTryCreated>;
  uploadTestFile(token: string, code: string, kind: TestFileKind, file: File): Promise<void>;
  generateBarem(token: string, code: string): Promise<void>;
  addPage(token: string, file: File): Promise<void>;
  start(token: string): Promise<void>;
  getTest(token: string, code: string): Promise<TestDetail>;
}

export function createLandingApi(fetchImpl: typeof fetch = (input, init) => fetch(input, init)): LandingApi {
  const call = <T>(url: string, method: string, body?: unknown, file?: File) => apiRequest<T>(fetchImpl, url, method, body, file);
  const test = (token: string, code: string) => `${tryBase(token)}/tests/${encodeURIComponent(code)}`;
  return {
    availability: () => call<QuickTryAvailability>('/api/try/availability', 'GET'),
    create: (turnstileToken) => call<QuickTryCreated>('/api/try', 'POST', turnstileToken === undefined ? {} : { turnstileToken }),
    uploadTestFile: async (token, code, kind, file) => {
      await call(`${test(token, code)}/files/${kind}`, 'PUT', undefined, file);
    },
    generateBarem: async (token, code) => {
      await call(`${test(token, code)}/barem/generate`, 'POST');
    },
    addPage: async (token, file) => {
      await call(`${tryBase(token)}/paper`, 'PUT', undefined, file);
    },
    start: async (token) => {
      await call(`${tryBase(token)}/start`, 'POST', {});
    },
    getTest: (token, code) => call<TestDetail>(test(token, code), 'GET'),
  };
}
