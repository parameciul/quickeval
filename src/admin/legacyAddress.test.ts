import { describe, expect, it } from 'vitest';
import { englishAddress, englishHash, englishPath, englishSearch } from './legacyAddress.ts';

describe('englishPath', () => {
  it.each([
    ['/teste/nou', '/tests/new'],
    ['/teste/nou/', '/tests/new/'],
    ['/teste/6E2-26T1', '/tests/6E2-26T1'],
    ['/teste/6E2-26T1/elevi/5', '/tests/6E2-26T1/papers/5'],
    ['/teste/6E2-26T1/raport', '/tests/6E2-26T1/report'],
    ['/teste/6E2-26T1/verificare', '/tests/6E2-26T1/review'],
    ['/clase', '/classes'],
    ['/clase/3', '/classes/3'],
    ['/elevi/10', '/students/10'],
    ['/cautare', '/search'],
    ['/setari', '/settings'],
    ['/cont', '/account'],
    ['/confirma-email', '/confirm-email'],
    ['/parola-noua', '/new-password'],
  ])('turns %s into %s', (old, now) => {
    expect(englishPath(old)).toBe(now);
  });

  it('leaves English paths and unknown paths alone', () => {
    for (const path of ['/', '/tests/new', '/tests/6E2-26T1/papers/5', '/classes/3', '/phone', '/telefon', '/nimic', '']) {
      expect(englishPath(path)).toBe(path);
    }
  });

  it('turns only the parts it knows, at their own place', () => {
    // "nou" only as the whole second part, and a test part only after a code.
    expect(englishPath('/teste/nou/elevi')).toBe('/tests/nou/papers');
    expect(englishPath('/clase/elevi')).toBe('/classes/elevi');
    expect(englishPath('/teste/6E2-26T1/altceva')).toBe('/tests/6E2-26T1/altceva');
  });

  it('never takes a name of Object for an old part', () => {
    expect(englishPath('/toString')).toBe('/toString');
    expect(englishPath('/teste/X/constructor')).toBe('/tests/X/constructor');
  });
});

describe('englishSearch', () => {
  it('turns the old names and values into English ones', () => {
    expect(englishSearch('?lucrare=12&punct=34')).toBe('?paper=12&item=34');
    expect(englishSearch('?lucrare=12&punct=pagini&vedere=toate')).toBe('?paper=12&item=pages&view=all');
    expect(englishSearch('?vedere=verificare')).toBe('?view=review');
    expect(englishSearch('?clasa=2&arhivate=1')).toBe('?class=2&archived=1');
    expect(englishSearch('?q=stef&arata=elevi')).toBe('?q=stef&show=students');
    expect(englishSearch('?tab=corectarea')).toBe('?tab=grading');
    expect(englishSearch('?tab=robotul')).toBe('?tab=robot');
    expect(englishSearch('?tab=conturi')).toBe('?tab=accounts');
    expect(englishSearch('?q=pop&arata=clase')).toBe('?q=pop&show=classes');
    expect(englishSearch('?q=pop&arata=teste')).toBe('?q=pop&show=tests');
  });

  it("keeps Stripe's session_id when it turns the payment's return", () => {
    expect(englishSearch('?plata=reusita&session_id=cs_test_a1')).toBe('?payment=success&session_id=cs_test_a1');
    expect(englishSearch('?plata=anulata')).toBe('?payment=cancelled');
  });

  it('leaves an English or unknown query as it is, to the character', () => {
    for (const search of ['', '?', '?q=stef%20ana', '?paper=12&item=pages', '?tab=altceva', '?here=1']) {
      expect(englishSearch(search)).toBe(search);
    }
  });

  it('keeps the text of a search when it turns its other names', () => {
    const search = englishSearch('?q=%C8%99tefan+ana%2B1&arata=elevi');
    expect(search).toBe('?q=%C8%99tefan+ana%2B1&show=students');
    expect(new URLSearchParams(search).get('q')).toBe('ștefan ana+1');
    expect(new URLSearchParams(englishSearch('?q=a%20b&clasa=2')).get('q')).toBe('a b');
  });

  it('turns a value only under its own name', () => {
    expect(englishSearch('?q=toate')).toBe('?q=toate');
    expect(englishSearch('?q=elevi&punct=7')).toBe('?q=elevi&item=7');
  });

  it('never takes a name of Object for an old name or value', () => {
    expect(englishSearch('?constructor=1&tab=toString')).toBe('?constructor=1&tab=toString');
  });
});

describe('englishHash', () => {
  it.each([
    ['#pregatire', '#prepare'],
    ['#tiparire', '#print'],
    ['#in-clasa', '#in-class'],
    ['#corectare', '#grading'],
    ['#verificare', '#review'],
    ['#rezultate', '#results'],
    ['#pe-scurt', '#summary'],
    ['#exercitii', '#exercises'],
    ['#analiza', '#analysis'],
    ['#cont-nou', '#new-account'],
  ])('turns %s into %s', (old, now) => {
    expect(englishHash(old)).toBe(now);
  });

  it('keeps an email token and any other hash as it is', () => {
    for (const hash of ['', '#Zk3-q_9xYw', '#results', '#corectare2', '#toString']) expect(englishHash(hash)).toBe(hash);
  });
});

describe('englishAddress', () => {
  it('gives null for an English address', () => {
    expect(englishAddress({ pathname: '/tests/6E2-26T1', search: '?paper=1', hash: '#review' })).toBeNull();
  });

  it('turns every part of an old address at once', () => {
    expect(englishAddress({ pathname: '/teste/6E2-26T1/elevi/5', search: '?punct=pagini', hash: '#verificare' })).toEqual({
      pathname: '/tests/6E2-26T1/papers/5',
      search: '?item=pages',
      hash: '#review',
    });
  });

  it('keeps the token of an old email link', () => {
    expect(englishAddress({ pathname: '/parola-noua', search: '', hash: '#abc_DEF-123' })).toEqual({
      pathname: '/new-password',
      search: '',
      hash: '#abc_DEF-123',
    });
  });
});
