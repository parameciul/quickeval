import { type MessageLang, pageLang, translateMessage } from './i18n/messages.ts';
// Quick Try: one free grading without an account (spec
// docs/superpowers/specs/2026-11-09-quick-try-design.md).

// Tries per IP address per Bucharest day (administrators are not counted).
export const QUICK_TRY_IP_LIMIT = 10;
// Tries per Bucharest day on the whole platform (administrators are not counted).
export const QUICK_TRY_DAILY_LIMIT = 30;
// A try's link works this many days.
export const QUICK_TRY_DAYS = 7;
// A try may change its test and barem files this many times in all (each
// change can make robot work), and ask the robot for a barem once.
export const QUICK_TRY_FILE_CHANGES = 6;
// Tries whose days are over that one visit of the landing page deletes (each
// costs one R2 call and a few D1 statements, inside a request's limits).
export const QUICK_TRY_CLEANUP_BATCH = 3;

// The guest teacher's name, class and student, and the test's title.
export const QUICK_TRY_GUEST = 'Încercare';
export const QUICK_TRY_CLASS = 'PROBA';
export const QUICK_TRY_STUDENT = 'Elev';
export const QUICK_TRY_TITLE = 'Încercare rapidă';

// A name the server stored for a try (its student, class or default title)
// in the page's language; any other name, the teacher's own, stays as it is.
export function tryName(name: string, lang: MessageLang = pageLang()): string {
  return name === QUICK_TRY_STUDENT || name === QUICK_TRY_CLASS || name === QUICK_TRY_TITLE ? translateMessage(name, lang) : name;
}

// The phone page that sends the student's pages to a try (spec
// docs/superpowers/specs/2026-11-16-quick-try-phone-photos-design.md).
// `here`: opened on the phone that sent the form, so the page shows a link to
// the try. A phone that scanned the code gets no link; that is no lock, since
// the code holds the try's whole link.
// On an English page the address carries ?lang=en: the phone that opens it
// has no saved choice (public/lang.js).
// `parts`: what the phone sends (the test, the barem, the student's pages),
// written in the address as `parts=test,marking-scheme,pages`. Left out for
// the pages alone, the address they always had.
export function quickTryPhonePath(token: string, here = false, lang: MessageLang = pageLang(), parts: readonly PhonePart[] = ['pages']): string {
  const ordered = PHONE_PARTS.filter((part) => parts.includes(part));
  const named = ordered.length > 0 && !(ordered.length === 1 && ordered[0] === 'pages') ? `parts=${ordered.map((part) => PHONE_PART_NAMES[part]).join(',')}` : '';
  const query = [here ? 'here=1' : '', named, lang === 'en' ? 'lang=en' : ''].filter(Boolean).join('&');
  return `/try/${token}/phone${query ? `?${query}` : ''}`;
}

// The parts of a try that can come from the phone, in the order the phone
// page takes them: the test, then its barem (which may be made from the
// test), then the student's pages.
export type PhonePart = 'test' | 'barem' | 'pages';
export const PHONE_PARTS: readonly PhonePart[] = ['test', 'barem', 'pages'];
// Their names in an address, in English ("barem" is `marking-scheme`).
const PHONE_PART_NAMES: Record<PhonePart, string> = { test: 'test', barem: 'marking-scheme', pages: 'pages' };

// The parts named by the address's `parts`, in order; unknown names are
// skipped. Null when it names none: the page then works them out (phonePartsOf).
export function parsePhoneParts(raw: string | null): PhonePart[] | null {
  if (!raw) return null;
  const named = new Set(raw.split(','));
  const parts = PHONE_PARTS.filter((part) => named.has(PHONE_PART_NAMES[part]));
  return parts.length > 0 ? parts : null;
}

interface TryFiles {
  files: { test: unknown; barem: unknown };
  barem: { request: string; unchecked: boolean };
}

// The parts a phone page opened without `parts` takes (the code of the try's
// own page): what the try still misses, and always the pages. A barem being
// made is not missing.
export function phonePartsOf(test: TryFiles): PhonePart[] {
  return PHONE_PARTS.filter((part) =>
    part === 'test' ? test.files.test === null : part === 'barem' ? test.files.barem === null && test.barem.request !== 'requested' : true,
  );
}

// After the test came from the phone, whether to ask for the barem made from
// it: she chose no barem of her own (the barem is not a phone part), the try
// has none, and none was asked for (a try asks once).
export function asksBaremAfterTest(parts: readonly PhonePart[], test: TryFiles): boolean {
  return !parts.includes('barem') && test.files.barem === null && test.barem.request === 'none' && !test.barem.unchecked;
}
// A phone in the hand, upright or sideways: it takes the photos itself, with
// no QR code.
export const PHONE_MEDIA = '(pointer: coarse) and (max-width: 767.98px), (pointer: coarse) and (max-height: 500px)';
// While its QR code shows, the laptop reads the try's pages this often, and
// stops after this long with no new page (the D1 read limit).
export const PHONE_REFRESH_MS = 3000;
export const PHONE_IDLE_MS = 15 * 60 * 1000;
export const PHONE_IDLE_TEXT = `Nu a venit nicio pagină de ${PHONE_IDLE_MS / 60_000} minute.`;

const QUICK_TRY_TOKEN = /^[a-z2-7]{32}$/;

// The secret part of a try's link: 32 characters from a-z and 2-7, longer than
// an upload or result token so the three cannot be confused.
export function isQuickTryToken(raw: string): boolean {
  return QUICK_TRY_TOKEN.test(raw);
}

// The calendar day in Romania, "YYYY-MM-DD": the daily limits start again at
// Bucharest midnight.
export function bucharestDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
