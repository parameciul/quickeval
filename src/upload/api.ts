import type { LinkInfo, SessionStart, SubmissionFile, UploadSession } from '../../shared/api.ts';
import { ApiError, NETWORK_MESSAGE, readAnswer } from '../ui/ApiError.ts';

// Everything the student app asks the server. The page gets it as a prop, so
// tests can pass a fake.
export interface UploadApi {
  getLink(token: string): Promise<LinkInfo>;
  // `secret`: the one this phone saved for the student, if any.
  startSession(token: string, studentId: number, secret: string | null): Promise<SessionStart>;
  getSession(token: string, secret: string): Promise<UploadSession>;
  // onProgress gets the sent share of the file, from 0 to 1.
  uploadFile(token: string, secret: string, file: Blob, name: string, onProgress: (sent: number) => void): Promise<SubmissionFile>;
  deleteFile(token: string, secret: string, fileId: number): Promise<void>;
  confirm(token: string, secret: string): Promise<{ fileCount: number }>;
  // A file already sent, for its preview after a page reload.
  fileBlob(token: string, secret: string, fileId: number): Promise<Blob>;
}

// The student's upload on this phone: who it is, the secret, and the files sent so far.
export interface ActiveSession {
  studentId: number;
  studentName: string;
  secret: string;
  files: SubmissionFile[];
}

const SESSION_HEADER = 'X-Upload-Session';

// The parts of XMLHttpRequest the upload uses. Tests pass a fake.
export interface UploadRequest {
  upload: { onprogress: ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  status: number;
  responseText: string;
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  getResponseHeader(name: string): string | null;
  send(body: Blob): void;
}

export interface UploadClientOptions {
  fetchImpl?: typeof fetch;
  newRequest?: () => UploadRequest;
}

export function createUploadClient(options: UploadClientOptions = {}): UploadApi {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const newRequest = options.newRequest ?? (() => new XMLHttpRequest() as unknown as UploadRequest);
  const base = (token: string) => `/api/u/${encodeURIComponent(token)}`;

  async function send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetchImpl(url, { credentials: 'same-origin', ...init });
    } catch {
      throw new ApiError(0, 'network', NETWORK_MESSAGE);
    }
  }

  async function json<T>(method: string, url: string, secret: string | null, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (secret) headers[SESSION_HEADER] = secret;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await send(url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return readAnswer<T>(res);
  }

  // XMLHttpRequest, because fetch cannot report upload progress.
  function upload(url: string, secret: string, file: Blob, name: string, onProgress: (sent: number) => void): Promise<SubmissionFile> {
    return new Promise((resolve, reject) => {
      const request = newRequest();
      request.open('PUT', url);
      request.setRequestHeader('Content-Type', file.type);
      request.setRequestHeader('X-File-Name', encodeURIComponent(name));
      request.setRequestHeader(SESSION_HEADER, secret);
      request.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
      };
      request.onerror = () => reject(new ApiError(0, 'network', NETWORK_MESSAGE));
      request.onload = () => {
        const answer = new Response(request.responseText, {
          status: request.status,
          headers: { 'Content-Type': request.getResponseHeader('Content-Type') ?? '' },
        });
        readAnswer<{ file: SubmissionFile }>(answer).then((data) => resolve(data.file), reject);
      };
      request.send(file);
    });
  }

  return {
    getLink: (token) => json<LinkInfo>('GET', base(token), null),
    startSession: (token, studentId, secret) => json<SessionStart>('POST', `${base(token)}/sessions`, secret, { studentId }),
    getSession: async (token, secret) => (await json<{ session: UploadSession }>('GET', `${base(token)}/files`, secret)).session,
    uploadFile: (token, secret, file, name, onProgress) => upload(`${base(token)}/files`, secret, file, name, onProgress),
    deleteFile: async (token, secret, fileId) => {
      await json('DELETE', `${base(token)}/files/${fileId}`, secret);
    },
    confirm: (token, secret) => json<{ fileCount: number }>('POST', `${base(token)}/confirm`, secret),
    fileBlob: async (token, secret, fileId) => {
      const res = await send(`${base(token)}/files/${fileId}`, { headers: { [SESSION_HEADER]: secret } });
      if (!res.ok) await readAnswer(res);
      return res.blob();
    },
  };
}
