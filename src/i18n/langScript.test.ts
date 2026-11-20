import { describe, expect, it, vi } from 'vitest';
import script from '../../public/lang.js?raw';

// public/lang.js runs in the page head. It is run here with a fake page:
// <html> with its attributes, the address and the browser storage.
function run(options: { lang?: string; twin?: string; titleEn?: string; saved?: string | null; search?: string; hash?: string; storageThrows?: boolean }) {
  const attributes = new Map<string, string>([['lang', options.lang ?? 'ro']]);
  if (options.twin) attributes.set('data-twin', options.twin);
  if (options.titleEn) attributes.set('data-title-en', options.titleEn);
  const html = {
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  };
  const page = { documentElement: html, title: 'MQGrader · Profesor' };
  const location = { pathname: '/try/abc/phone', search: options.search ?? '', hash: options.hash ?? '', replace: vi.fn() };
  const history = { state: null, replaceState: vi.fn() };
  const stored = new Map<string, string>();
  if (options.saved) stored.set('quickeval.lang', options.saved);
  const localStorage = {
    getItem: (key: string) => {
      if (options.storageThrows) throw new Error('blocked');
      return stored.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (options.storageThrows) throw new Error('blocked');
      stored.set(key, value);
    },
  };
  new Function('document', 'location', 'localStorage', 'history', script)(page, location, localStorage, history);
  return { lang: attributes.get('lang'), title: page.title, replace: location.replace, saved: stored.get('quickeval.lang') ?? null, replaceState: history.replaceState };
}

describe('public/lang.js', () => {
  it('leaves a page alone when the reader chose nothing', () => {
    const page = run({ twin: '/en/guide/' });
    expect(page.replace).not.toHaveBeenCalled();
    expect(page.lang).toBe('ro');
  });

  it("sends a public page to its twin in the reader's language, with the query and the anchor", () => {
    const page = run({ twin: '/en/guide/', saved: 'en', search: '?a=1', hash: '#steps' });
    expect(page.replace).toHaveBeenCalledWith('/en/guide/?a=1#steps');
    expect(run({ lang: 'en', twin: '/guide/', saved: 'ro' }).replace).toHaveBeenCalledWith('/guide/');
  });

  it('keeps a public page that is already in the chosen language', () => {
    expect(run({ lang: 'en', twin: '/guide/', saved: 'en' }).replace).not.toHaveBeenCalled();
    expect(run({ twin: '/en/guide/', saved: 'ro' }).replace).not.toHaveBeenCalled();
  });

  it("puts the choice into an app page's <html lang>, with its English title", () => {
    const page = run({ saved: 'en', titleEn: 'MQGrader · Teacher' });
    expect(page.lang).toBe('en');
    expect(page.title).toBe('MQGrader · Teacher');
    expect(run({ saved: 'ro', titleEn: 'MQGrader · Teacher' }).title).toBe('MQGrader · Profesor');
  });

  it('takes ?lang= from a link made for another device, and saves it', () => {
    const page = run({ search: '?here=1&lang=en' });
    expect(page.lang).toBe('en');
    expect(page.saved).toBe('en');
    expect(run({ saved: 'en', search: '?lang=ro' }).lang).toBe('ro');
  });

  // RO reloads the same address: a ?lang=en left in it would win again.
  it('takes ?lang= out of the address, keeping the rest', () => {
    expect(run({ search: '?here=1&lang=en', hash: '#x' }).replaceState).toHaveBeenCalledWith(null, '', '/try/abc/phone?here=1#x');
    expect(run({ search: '?lang=en' }).replaceState).toHaveBeenCalledWith(null, '', '/try/abc/phone');
    expect(run({ search: '?here=1' }).replaceState).not.toHaveBeenCalled();
    expect(run({ twin: '/en/guide/', search: '?a=1&lang=en' }).replace).toHaveBeenCalledWith('/en/guide/?a=1');
  });

  it('ignores an unknown choice and blocked storage', () => {
    expect(run({ saved: 'fr', twin: '/en/' }).replace).not.toHaveBeenCalled();
    expect(run({ saved: 'fr' }).lang).toBe('ro');
    expect(run({ storageThrows: true, twin: '/en/' }).replace).not.toHaveBeenCalled();
    expect(run({ storageThrows: true, search: '?lang=en' }).lang).toBe('en');
  });
});
