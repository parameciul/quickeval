import type { EvaluationStart, QuickTryInfo, StudentResultView, SubmissionFile } from '../../shared/api.ts';
import { uploadTypeOf } from '../../shared/files.ts';
import { ApiError, NETWORK_MESSAGE, readAnswer } from '../ui/ApiError.ts';

// The calls of a Quick Try's page that are its own (the test, its files and
// the review go through the teacher app's client, at tryBase). The page gets
// it as a prop, so tests can pass a fake.
export interface TryApi {
  info(): Promise<QuickTryInfo>;
  // The student's pages, in upload order.
  listPages(): Promise<SubmissionFile[]>;
  addPage(file: File): Promise<SubmissionFile>;
  deletePage(fileId: number): Promise<void>;
  // "Pornește corectarea". `filesVersion`: the version of the robot's barem
  // the page showed, which then counts as checked.
  start(filesVersion?: number): Promise<EvaluationStart>;
  // The page the student would see.
  result(): Promise<StudentResultView>;
}

export function tryBase(token: string): string {
  return `/api/try/${token}`;
}

// A page of the student's paper opens straight from the API: the link is the key.
export function pageFileUrl(token: string, fileId: number): string {
  return `${tryBase(token)}/paper/${fileId}`;
}

// One call of the API: a JSON body, or one file as the whole body (its name
// in X-File-Name). The answer is JSON; a refusal throws its ApiError. The
// landing page's form uses it too.
export async function apiRequest<T>(fetchImpl: typeof fetch, url: string, method: string, body?: unknown, file?: File): Promise<T> {
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
    res = await fetchImpl(url, { method, headers, credentials: 'same-origin', ...(payload === undefined ? {} : { body: payload }) });
  } catch {
    throw new ApiError(0, 'network', NETWORK_MESSAGE);
  }
  return readAnswer<T>(res);
}

export function createTryClient(token: string, options: { fetchImpl?: typeof fetch } = {}): TryApi {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const base = tryBase(token);
  const request = <T>(method: string, path: string, body?: unknown, file?: File) => apiRequest<T>(fetchImpl, `${base}${path}`, method, body, file);

  return {
    info: () => request<QuickTryInfo>('GET', ''),
    listPages: async () => (await request<{ files: SubmissionFile[] }>('GET', '/paper')).files,
    addPage: async (file) => (await request<{ file: SubmissionFile }>('PUT', '/paper', undefined, file)).file,
    deletePage: async (fileId) => {
      await request('DELETE', `/paper/${fileId}`);
    },
    start: (filesVersion) => request<EvaluationStart>('POST', '/start', filesVersion === undefined ? {} : { filesVersion }),
    result: async () => (await request<{ result: StudentResultView }>('GET', '/result')).result,
  };
}
