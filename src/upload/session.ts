import type { LinkStudent } from '../../shared/api.ts';

// The secret that ties a student's upload to this phone (spec §10.3). It is
// kept in localStorage, so a reload or a closed tab can go on with the upload.
// Storage can be blocked; the secret then lasts until the page closes.

const key = (token: string, studentId: number) => `qe.session.${token}.${studentId}`;

export function saveSecret(token: string, studentId: number, secret: string): void {
  try {
    localStorage.setItem(key(token, studentId), secret);
  } catch {
    // Blocked storage: nothing to keep.
  }
}

export function loadSecret(token: string, studentId: number): string | null {
  try {
    return localStorage.getItem(key(token, studentId));
  } catch {
    return null;
  }
}

export function forgetSecret(token: string, studentId: number): void {
  try {
    localStorage.removeItem(key(token, studentId));
  } catch {
    // Blocked storage: nothing was kept.
  }
}

// A student whose upload this phone started and did not send yet: the app
// goes straight back to that upload.
export function savedStudent(token: string, students: LinkStudent[]): LinkStudent | null {
  return students.find((student) => student.state === 'in_progress' && loadSecret(token, student.id) !== null) ?? null;
}
