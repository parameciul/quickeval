import { studentResultPath } from '../../shared/api.ts';

// The secret link to a student's result page, kept on the phone that sent the
// upload (spec: like the theme choice, in localStorage). After "Am trimis
// tot" the upload secret is forgotten and only this link stays. When the
// student opens the same upload link again (the same QR code), the page shows
// the kept link instead of the name list, so a lost link comes back on the
// same phone.

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

// The address to keep and to share, for one result page.
export function resultPageUrl(resultToken: string): string {
  return `${window.location.origin}${studentResultPath(resultToken)}`;
}
