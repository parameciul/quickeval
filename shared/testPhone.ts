// The phone link of a teacher's test (`/phone/<token>`): the test and the
// barem, the class ones and the CES ones, photographed with a phone that is
// not logged in. The link names one test and works for PHONE_LINK_HOURS.

import type { BaremRequest } from './api.ts';

export const PHONE_LINK_HOURS = 24;

// 40 characters from a-z and 2-7: longer than an upload (16), a result (24)
// and a try (32) token, so none can be taken for another.
const PHONE_TOKEN = /^[a-z2-7]{40}$/;
export const PHONE_TOKEN_LENGTH = 40;

export function isPhoneToken(raw: string): boolean {
  return PHONE_TOKEN.test(raw);
}

// The parts a phone takes, in the order it takes them: the class test, its
// barem, then the CES ones.
export type TestPhonePart = 'test' | 'barem' | 'cesTest' | 'cesBarem';
export const TEST_PHONE_PARTS: readonly TestPhonePart[] = ['test', 'barem', 'cesTest', 'cesBarem'];
// Their names in an address, in English ("barem" is `marking-scheme`, CES is `sen`).
const PART_NAMES: Record<TestPhonePart, string> = {
  test: 'test',
  barem: 'marking-scheme',
  cesTest: 'sen-test',
  cesBarem: 'sen-marking-scheme',
};

export const isCesPart = (part: TestPhonePart) => part === 'cesTest' || part === 'cesBarem';
export const isBaremPart = (part: TestPhonePart) => part === 'barem' || part === 'cesBarem';

// What the phone page is to do: the parts it takes, and the barems to ask the
// robot for once their test arrived ("Din test" with the test from the phone).
export interface PhoneAsk {
  parts: TestPhonePart[];
  fromTest: ('barem' | 'cesBarem')[];
}

function namesOf<T extends TestPhonePart>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const named = new Set(raw.split(','));
  return allowed.filter((part) => named.has(PART_NAMES[part]));
}

// The phone page's address: `parts=` and `from-test=` by their English names;
// `here=1` on the phone that made the test (it then links back to the test).
export function testPhonePath(token: string, ask: PhoneAsk, here = false, lang: 'ro' | 'en' = 'ro'): string {
  const parts = TEST_PHONE_PARTS.filter((part) => ask.parts.includes(part)).map((part) => PART_NAMES[part]);
  const fromTest = (['barem', 'cesBarem'] as const).filter((part) => ask.fromTest.includes(part)).map((part) => PART_NAMES[part]);
  const query = [
    parts.length > 0 ? `parts=${parts.join(',')}` : '',
    fromTest.length > 0 ? `from-test=${fromTest.join(',')}` : '',
    here ? 'here=1' : '',
    lang === 'en' ? 'lang=en' : '',
  ].filter(Boolean);
  return `/phone/${token}${query.length > 0 ? `?${query.join('&')}` : ''}`;
}

// The address's ask; with no `parts`, null: the page then takes what the test misses.
export function parsePhoneAsk(params: URLSearchParams): PhoneAsk | null {
  const parts = namesOf(params.get('parts'), TEST_PHONE_PARTS);
  if (parts.length === 0) return null;
  return { parts, fromTest: namesOf(params.get('from-test'), ['barem', 'cesBarem'] as const) };
}

// What the phone page reads of its test (GET /api/phone/<token>/info): only
// which files are there and the barems' requests, never the students.
export interface PhoneLinkInfo {
  code: string;
  title: string;
  className: string;
  expiresAt: string;
  // The test has a CES variant to fill (CES students and the switch on).
  ces: boolean;
  files: Record<TestPhonePart, boolean>;
  barem: { request: BaremRequest; unchecked: boolean };
  cesBarem: { request: BaremRequest; unchecked: boolean };
}

export interface PhoneLinkCreated {
  token: string;
  expiresAt: string;
}

// The parts a test still misses, for a phone page opened without `parts`
// (the code of the test page): a barem being made is not missing.
export function missingPhoneParts(info: Pick<PhoneLinkInfo, 'ces' | 'files' | 'barem' | 'cesBarem'>): TestPhonePart[] {
  return TEST_PHONE_PARTS.filter((part) => {
    if (isCesPart(part) && !info.ces) return false;
    if (info.files[part]) return false;
    if (part === 'barem') return info.barem.request !== 'requested';
    if (part === 'cesBarem') return info.cesBarem.request !== 'requested';
    return true;
  });
}

// After a test came from the phone, whether to ask for its barem: she chose
// "Din test", and the variant has no barem and none asked for.
export function asksBaremAfter(part: TestPhonePart, ask: PhoneAsk, info: PhoneLinkInfo): boolean {
  if (part === 'test') return ask.fromTest.includes('barem') && !info.files.barem && info.barem.request === 'none' && !info.barem.unchecked;
  if (part === 'cesTest') return ask.fromTest.includes('cesBarem') && !info.files.cesBarem && info.cesBarem.request === 'none' && !info.cesBarem.unchecked;
  return false;
}
