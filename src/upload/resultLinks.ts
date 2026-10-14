import { studentResultPath, type LinkStudent } from '../../shared/api.ts';

// The secret link to a student's result page, kept on the phone that sent the
// upload (spec: like the theme choice, in localStorage). After "Am trimis
// tot" the upload secret is forgotten and only this link stays. On the link
// for many uploads the page shows the kept links above the name list, so one
// phone can send for several students in turn. On the default link the phone
// locks after one sent upload (see singleUploadLocked): the page shows only
// the kept link, so a student cannot send for a classmate by mistake or on
// purpose. Once the uploads closed, the page shows only the kept link, so a
// lost link comes back on the same phone.

export interface SavedResultLink {
  studentId: number;
  studentName: string;
  resultToken: string;
}

const keyOf = (uploadToken: string, studentId: number) => `qe.result.${uploadToken}.${studentId}`;

// All result links this phone kept for one upload link. On a shared phone
// several students may each have one.
export function loadResultLinks(uploadToken: string): SavedResultLink[] {
  const found: SavedResultLink[] = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      const prefix = `qe.result.${uploadToken}.`;
      if (!key?.startsWith(prefix)) continue;
      const studentId = Number(key.slice(prefix.length));
      if (!Number.isInteger(studentId) || studentId <= 0) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { resultToken?: unknown; studentName?: unknown };
        if (typeof parsed.resultToken !== 'string' || parsed.resultToken === '') continue;
        found.push({
          studentId,
          studentName: typeof parsed.studentName === 'string' ? parsed.studentName : '',
          resultToken: parsed.resultToken,
        });
      } catch {
        continue;
      }
    }
  } catch {
    return [];
  }
  return found.sort((a, b) => a.studentId - b.studentId);
}

export function saveResultLink(uploadToken: string, studentId: number, resultToken: string, studentName: string): void {
  try {
    localStorage.setItem(keyOf(uploadToken, studentId), JSON.stringify({ resultToken, studentName }));
  } catch {
    // Blocked storage: the link then lasts until the page closes.
  }
}

export function loadResultLink(uploadToken: string, studentId: number): SavedResultLink | null {
  try {
    const raw = localStorage.getItem(keyOf(uploadToken, studentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { resultToken?: unknown; studentName?: unknown };
    if (typeof parsed.resultToken !== 'string' || parsed.resultToken === '') return null;
    return {
      studentId,
      studentName: typeof parsed.studentName === 'string' ? parsed.studentName : '',
      resultToken: parsed.resultToken,
    };
  } catch {
    return null;
  }
}

// Forgets every kept link with this result token, from any upload link. The
// result page calls it when the server answers 404: the upload is gone, so
// the kept link must not come back on the upload page.
export function forgetResultLinkByToken(resultToken: string): void {
  try {
    const doomed: string[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith('qe.result.')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { resultToken?: unknown };
        if (parsed.resultToken === resultToken) doomed.push(key);
      } catch {
        continue;
      }
    }
    for (const key of doomed) localStorage.removeItem(key);
  } catch {
    // Blocked storage: nothing to forget.
  }
}

// Drops the kept links whose upload the teacher reset: the student is back in
// the name list (`none` or `in_progress`), so the old result link is stale.
// Links of students who left the class stay: they still prove this phone sent.
export function pruneStaleResultLinks(uploadToken: string, students: LinkStudent[]): void {
  try {
    for (const link of loadResultLinks(uploadToken)) {
      const student = students.find((item) => item.id === link.studentId);
      if (student && student.state !== 'done') {
        try {
          localStorage.removeItem(keyOf(uploadToken, link.studentId));
        } catch {
          // Blocked storage: nothing to forget.
        }
      }
    }
  } catch {
    // Blocked storage: nothing to forget.
  }
}

// Whether the default (single-upload) link on this phone already sent an
// upload that still counts: at least one kept result link whose student
// already sent (or left the class after sending). Callers first prune the
// stale links, so a reset upload unlocks the phone again.
export function singleUploadLocked(uploadToken: string): boolean {
  return loadResultLinks(uploadToken).length > 0;
}

// The address to keep and to share, for one result page.
export function resultPageUrl(resultToken: string): string {
  return `${window.location.origin}${studentResultPath(resultToken)}`;
}
