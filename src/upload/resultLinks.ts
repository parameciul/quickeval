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
  // The link's short code. Null for a link kept before links had codes.
  resultCode: string | null;
}

// What the phone stored for one kept link, read with care: it is the page's
// own data, but an older version of the page wrote less.
function readSaved(raw: string, studentId: number): SavedResultLink | null {
  const parsed = JSON.parse(raw) as { resultToken?: unknown; studentName?: unknown; resultCode?: unknown };
  if (typeof parsed.resultToken !== 'string' || parsed.resultToken === '') return null;
  return {
    studentId,
    studentName: typeof parsed.studentName === 'string' ? parsed.studentName : '',
    resultToken: parsed.resultToken,
    resultCode: typeof parsed.resultCode === 'string' && parsed.resultCode !== '' ? parsed.resultCode : null,
  };
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
        const saved = readSaved(raw, studentId);
        if (saved) found.push(saved);
      } catch {
        continue;
      }
    }
  } catch {
    return [];
  }
  return found.sort((a, b) => a.studentId - b.studentId);
}

export function saveResultLink(
  uploadToken: string,
  studentId: number,
  resultToken: string,
  studentName: string,
  resultCode: string | null = null,
): void {
  try {
    localStorage.setItem(keyOf(uploadToken, studentId), JSON.stringify({ resultToken, studentName, resultCode }));
  } catch {
    // Blocked storage: the link then lasts until the page closes.
  }
}

export function loadResultLink(uploadToken: string, studentId: number): SavedResultLink | null {
  try {
    const raw = localStorage.getItem(keyOf(uploadToken, studentId));
    if (!raw) return null;
    return readSaved(raw, studentId);
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

// Writes the short code into every kept link of this result token that has
// none: a link kept before links had codes learns it when its result page
// opens, so its ticket shows the code from then on.
export function rememberResultCode(resultToken: string, resultCode: string): void {
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith('qe.result.')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed.resultToken !== resultToken || typeof parsed.resultCode === 'string') continue;
        localStorage.setItem(key, JSON.stringify({ ...parsed, resultCode }));
      } catch {
        continue;
      }
    }
  } catch {
    // Blocked storage: the ticket stays without its code.
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

// A test has two links (the default one, and the one for many uploads), each
// with its own token, and the kept result links are stored per token. So the
// phone also remembers which test each link names (`LinkInfo.test.key`): once
// the uploads closed, either link shows the result links kept through both.

const linkKeyOf = (uploadToken: string) => `qe.link.${uploadToken}`;

// Remembered for a link the server does not know (its test is gone), so the
// page never asks for it again. No test has this key.
export const UNKNOWN_TEST_KEY = '-';

// At most this many other links are asked for on one visit.
const MAX_LINKS_TO_ASK = 5;

export function rememberTestKey(uploadToken: string, testKey: string): void {
  try {
    localStorage.setItem(linkKeyOf(uploadToken), testKey);
  } catch {
    // Blocked storage: the link is asked for again on the next visit.
  }
}

// The link tokens this phone kept a result link through.
function tokensWithResults(): string[] {
  const tokens = new Set<string>();
  const prefix = 'qe.result.';
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const end = key.lastIndexOf('.');
    if (end > prefix.length) tokens.add(key.slice(prefix.length, end));
  }
  return [...tokens].sort();
}

// The other links with a kept result link whose test this phone does not
// know yet (kept before the phone remembered tests): the page asks the server
// for each, once.
export function tokensToAsk(uploadToken: string): string[] {
  try {
    return tokensWithResults()
      .filter((token) => token !== uploadToken && localStorage.getItem(linkKeyOf(token)) === null)
      .slice(0, MAX_LINKS_TO_ASK);
  } catch {
    return [];
  }
}

// The result links this phone kept for one test: through this link, and
// through every other link remembered as the same test. One per result.
export function loadTestResultLinks(uploadToken: string, testKey: string): SavedResultLink[] {
  let tokens = [uploadToken];
  try {
    if (testKey !== UNKNOWN_TEST_KEY) {
      tokens = tokens.concat(tokensWithResults().filter((token) => token !== uploadToken && localStorage.getItem(linkKeyOf(token)) === testKey));
    }
  } catch {
    // Blocked storage: only this link's own, which then come back empty too.
  }
  const found = new Map<string, SavedResultLink>();
  for (const token of tokens) {
    for (const link of loadResultLinks(token)) {
      if (!found.has(link.resultToken)) found.set(link.resultToken, link);
    }
  }
  return [...found.values()].sort((a, b) => a.studentId - b.studentId);
}

// The address to keep and to share, for one result page.
export function resultPageUrl(resultToken: string): string {
  return `${window.location.origin}${studentResultPath(resultToken)}`;
}
