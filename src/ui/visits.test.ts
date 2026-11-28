import { afterEach, describe, expect, it, vi } from 'vitest';
import tryRaw from '../../try/index.html?raw';
import studentRaw from '../../u/index.html?raw';
import { countVisitEvent, loadTeacherCounter, STATS_SCRIPT, TEACHER_SKIP_PATTERNS, teacherCounterLoaded } from './visits.ts';

// The visit counter must never send a token: not in a path, not after "#",
// not in a query string, not in a page title, not in a referrer.

// Rybbit's own rule (server/src/analytics-script/utils.ts, patternToRegex and
// findMatchingPattern): "re:" is a raw regex, "/**/" any folders, "**" any
// text, "*" one folder name of at least one character; the first match wins.
function patternToRegex(pattern: string): RegExp {
  if (pattern.startsWith('re:')) return new RegExp(pattern.slice(3));
  const marked = pattern.replace(/\*\*/g, '__DOUBLE__').replace(/\*/g, '__SINGLE__');
  const escaped = marked
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\/__DOUBLE__\//g, '/(?:.+/)?')
    .replace(/__DOUBLE__/g, '.*')
    .replace(/\//g, '\\/')
    .replace(/__SINGLE__/g, '[^/]+');
  return new RegExp(`^${escaped}$`);
}

const firstMatch = (path: string, patterns: string[]) => patterns.find((pattern) => patternToRegex(pattern).test(path)) ?? null;

// What the counter sends as the path: the pattern that matched, or the path.
const sentPath = (path: string, patterns: string[]) => firstMatch(path, patterns) ?? path;

const counterOf = (html: string) => new DOMParser().parseFromString(html, 'text/html').querySelector<HTMLScriptElement>(`script[src="${STATS_SCRIPT}"]`);
const maskOf = (html: string) => JSON.parse(counterOf(html)!.dataset.maskPatterns!) as string[];
const skipOf = (html: string) => JSON.parse(counterOf(html)!.dataset.skipPatterns!) as string[];
const referrerOf = (html: string) => new DOMParser().parseFromString(html, 'text/html').querySelector('meta[name="referrer"]')?.getAttribute('content');

const UPLOAD = 'abcdefghijkmnop3';
const RESULT = 'qrstuvwxyz234567qrstuvwxyz';
const TRY = 'abcdefghijklmnopqrstuvwxyz234567';

// Every form a path can take: with "#" when the counter tracks fragments.
const variants = (path: string) => [path, `${path}/`, `${path}/extra`, `${path}#x`, `${path}/#x`, `${path}/extra#x`];

describe('the student pages', () => {
  const mask = maskOf(studentRaw);
  const skip = skipOf(studentRaw);

  it('load the counter, deferred, and send no referrer', () => {
    expect(counterOf(studentRaw)!.defer).toBe(true);
    expect(referrerOf(studentRaw)).toBe('no-referrer');
  });

  it('never send a token in the path', () => {
    for (const path of [`/u/${UPLOAD}`, `/u/result/${RESULT}`, `/u/rezultat/${RESULT}`].flatMap(variants)) {
      const sent = sentPath(path, mask);
      expect(sent, path).not.toContain(UPLOAD);
      expect(sent, path).not.toContain(RESULT);
    }
  });

  it('send nothing from the result page', () => {
    for (const path of ['/u/result', '/u/rezultat', ...[`/u/result/${RESULT}`, `/u/rezultat/${RESULT}`].flatMap(variants)]) {
      expect(firstMatch(path, skip), path).not.toBeNull();
    }
  });

  it('still count the test link, with its token hidden', () => {
    for (const path of ['/u/', `/u/${UPLOAD}`, '/u/resultabcdefghi']) expect(firstMatch(path, skip), path).toBeNull();
    expect(sentPath(`/u/${UPLOAD}`, mask)).toBe('/u/*');
    expect(sentPath('/u/', mask)).toBe('/u/');
  });
});

describe('the Quick Try pages', () => {
  const mask = maskOf(tryRaw);

  it('load the counter, deferred, and send no referrer', () => {
    expect(counterOf(tryRaw)!.defer).toBe(true);
    expect(referrerOf(tryRaw)).toBe('no-referrer');
  });

  it('never send a token in the path', () => {
    for (const path of [`/try/${TRY}`, `/try/${TRY}/phone`, `/try/${TRY}/telefon`].flatMap(variants)) {
      expect(sentPath(path, mask), path).not.toContain(TRY);
    }
  });

  it('keep the try and its phone page apart', () => {
    expect(sentPath(`/try/${TRY}`, mask)).toBe('/try/*');
    expect(sentPath(`/try/${TRY}/phone`, mask)).toBe('/try/*/phone');
  });
});

describe('the teacher pages', () => {
  const skipped = (path: string) => firstMatch(path, TEACHER_SKIP_PATTERNS) !== null;

  it('count only the login screen and the sign-up', () => {
    expect(skipped('/teacher/')).toBe(false);
    expect(skipped('/teacher/#new-account')).toBe(false);
  });

  it('skip every other page, and the links of the emails with their token', () => {
    for (const path of [
      '/teacher/tests',
      '/teacher/tests/9A-2026-1',
      '/teacher/settings',
      '/teacher/confirm-email',
      '/teacher/confirm-email#secret-token',
      '/teacher/new-password#secret-token',
      '/teacher/#cont-nou',
      '/teacher/#anything',
    ]) {
      expect(skipped(path), path).toBe(true);
    }
  });
});

describe('the student and Quick Try apps', () => {
  const sources = import.meta.glob(['../upload/**/*.{ts,tsx}', '../try/**/*.{ts,tsx}', '../admin/**/*.{ts,tsx}', '!**/*.test.*'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  it('never put a name or a token in the page title', () => {
    for (const [file, source] of Object.entries(sources)) expect(source, file).not.toMatch(/document\.title/);
  });

  it('read no query string but the phone page\'s "here"', () => {
    const readers = Object.entries(sources)
      .filter(([file]) => !file.startsWith('../admin/'))
      .filter(([, source]) => /useSearchParams|URLSearchParams|location\.search/.test(source))
      .map(([file]) => file);
    expect(readers).toEqual(['../try/PhonePage.tsx']);
    expect(sources['../try/PhonePage.tsx']!.match(/params\.get\('([^']+)'\)/g)).toEqual(["params.get('here')", "params.get('parts')"]);
  });
});

describe('the counter of the login screen', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    delete window.rybbit;
  });

  it('loads once, with the teacher paths it skips', () => {
    loadTeacherCounter(document, true);
    loadTeacherCounter(document, true);
    const scripts = document.head.querySelectorAll<HTMLScriptElement>(`script[src="${STATS_SCRIPT}"]`);
    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0]!.dataset.skipPatterns!)).toEqual(TEACHER_SKIP_PATTERNS);
    expect(teacherCounterLoaded()).toBe(true);
  });

  it('loads nothing outside the built site', () => {
    loadTeacherCounter(document, false);
    loadTeacherCounter();
    expect(document.head.querySelector('script')).toBeNull();
    expect(teacherCounterLoaded()).toBe(false);
  });
});

describe('countVisitEvent', () => {
  afterEach(() => {
    delete window.rybbit;
  });

  it('sends the event, with nothing else', () => {
    const event = vi.fn();
    window.rybbit = { event };
    countVisitEvent('quick-try-sent');
    expect(event).toHaveBeenCalledWith('quick-try-sent');
  });

  it('does nothing without the counter, and goes on when it breaks', () => {
    expect(() => countVisitEvent('account-request-sent')).not.toThrow();
    window.rybbit = {
      event: () => {
        throw new Error('blocked');
      },
    };
    expect(() => countVisitEvent('account-request-sent')).not.toThrow();
  });
});
