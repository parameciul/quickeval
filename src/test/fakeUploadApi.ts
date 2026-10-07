import { vi } from 'vitest';
import type { LinkInfo, SubmissionFile } from '../../shared/api.ts';
import { ApiError } from '../ui/ApiError.ts';
import type { UploadApi } from '../upload/api.ts';

// An in-memory UploadApi for student-app tests. Every method is a vi.fn, so
// tests can check calls or replace one answer with mockRejectedValueOnce.

export const LINK_TOKEN = 'abcdefghijkmnop2';

export function linkInfo(overrides: Partial<LinkInfo['test']> = {}): LinkInfo {
  return {
    test: { code: '6E2-26T1', title: 'Fracții', className: '6E2', status: 'open', ...overrides },
    students: [
      { id: 10, name: 'Ionescu Ana', state: 'none' },
      { id: 11, name: 'Pop Ion', state: 'none' },
      { id: 12, name: 'Stan Eva', state: 'done' },
    ],
  };
}

interface FakeSession {
  studentId: number;
  secret: string;
  files: SubmissionFile[];
  sent: boolean;
}

export function createFakeUploadApi(info: LinkInfo = linkInfo()) {
  const sessions: FakeSession[] = [];
  let nextFileId = 100;
  const noSession = () => new ApiError(401, 'no_session', 'Încărcarea nu mai este valabilă. Alege-ți din nou numele.');
  const bySecret = (secret: string) => {
    const found = sessions.find((s) => s.secret === secret);
    if (!found) throw noSession();
    return found;
  };
  const view = (session: FakeSession) => ({
    submissionId: session.studentId + 1000,
    studentId: session.studentId,
    studentName: info.students.find((s) => s.id === session.studentId)?.name ?? '',
    status: session.sent ? ('submitted' as const) : ('uploading' as const),
    files: [...session.files],
  });

  const api = {
    getLink: vi.fn(async (_token: string) => structuredClone(info)),
    startSession: vi.fn(async (_token: string, studentId: number, secret: string | null) => {
      const student = info.students.find((s) => s.id === studentId);
      if (!student) throw new ApiError(404, 'unknown_student', 'Nu am găsit numele tău în listă.');
      if (student.state === 'done') throw new ApiError(409, 'already_submitted', 'Lucrarea ta a fost deja trimisă.');
      const existing = sessions.find((s) => s.studentId === studentId);
      if (existing) {
        if (existing.secret !== secret) {
          throw new ApiError(409, 'other_device', 'Încărcarea a început pe alt telefon. Roagă profesorul să o reseteze.');
        }
        return { session: view(existing) };
      }
      const created = { studentId, secret: `secret-${studentId}`, files: [], sent: false };
      sessions.push(created);
      student.state = 'in_progress';
      return { secret: created.secret, session: view(created) };
    }),
    getSession: vi.fn(async (_token: string, secret: string) => view(bySecret(secret))),
    uploadFile: vi.fn(async (_token: string, secret: string, file: Blob, name: string, onProgress: (sent: number) => void) => {
      const session = bySecret(secret);
      onProgress(1);
      const stored = { id: nextFileId++, name, contentType: file.type, size: file.size, position: session.files.length + 1 };
      session.files.push(stored);
      return stored;
    }),
    deleteFile: vi.fn(async (_token: string, secret: string, fileId: number) => {
      const session = bySecret(secret);
      session.files = session.files.filter((f) => f.id !== fileId);
    }),
    confirm: vi.fn(async (_token: string, secret: string) => {
      const session = bySecret(secret);
      session.sent = true;
      const student = info.students.find((s) => s.id === session.studentId);
      if (student) student.state = 'done';
      return { fileCount: session.files.length };
    }),
    fileBlob: vi.fn(async (_token: string, _secret: string, _fileId: number) => new Blob(['jpeg'], { type: 'image/jpeg' })),
    // Test helper: an upload this phone started before (for example before a reload).
    seedSession(studentId: number, files: SubmissionFile[] = []) {
      sessions.push({ studentId, secret: `secret-${studentId}`, files, sent: false });
      const student = info.students.find((s) => s.id === studentId);
      if (student) student.state = 'in_progress';
    },
    // Test helper: the teacher reset this student's upload.
    dropSession(studentId: number) {
      const index = sessions.findIndex((s) => s.studentId === studentId);
      if (index >= 0) sessions.splice(index, 1);
      const student = info.students.find((s) => s.id === studentId);
      if (student) student.state = 'none';
    },
  } satisfies UploadApi & Record<string, unknown>;
  return api;
}

export type FakeUploadApi = ReturnType<typeof createFakeUploadApi>;
