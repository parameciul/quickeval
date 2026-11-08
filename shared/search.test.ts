import { describe, expect, it } from 'vitest';
import { foldForSearch, isSearchable, matchRange, searchMatcher } from './search.ts';

describe('foldForSearch', () => {
  it('drops the Romanian diacritics, comma and cedilla forms alike', () => {
    expect(foldForSearch('Ștefan Țăran Îonescu Ânca')).toBe('stefan taran ionescu anca');
    expect(foldForSearch('Ştefan Ţăran')).toBe('stefan taran');
  });

  it('drops the accents of other languages and folds the letters with none', () => {
    expect(foldForSearch('Éva Öztürk Łukasz Groß')).toBe('eva ozturk lukasz gross');
  });

  it('reads a decomposed letter as the plain one', () => {
    expect(foldForSearch('Ștefan')).toBe('stefan');
  });

  it('trims and joins the spaces', () => {
    expect(foldForSearch('  Ana \t  Pop ')).toBe('ana pop');
  });
});

describe('isSearchable', () => {
  it('needs two letters', () => {
    expect(isSearchable('a')).toBe(false);
    expect(isSearchable(' ș ')).toBe(false);
    expect(isSearchable('șt')).toBe(true);
  });
});

describe('searchMatcher', () => {
  it('finds the search anywhere in the text, folded', () => {
    const matches = searchMatcher('stef');
    expect(matches('Ștefan Radu')).toBe(true);
    expect(matches('Ioana Stefănescu')).toBe(true);
    expect(matches('Teorema lui Stewart')).toBe(false);
  });

  it('finds nothing for an empty search', () => {
    expect(searchMatcher('  ')('Ana')).toBe(false);
  });
});

describe('matchRange', () => {
  it('marks the letters of the original text', () => {
    expect(matchRange('Ștefan Radu', 'stef')).toEqual({ start: 0, end: 4 });
    expect(matchRange('Ioana Stefănescu', 'ȘTEFĂ')).toEqual({ start: 6, end: 11 });
  });

  it('keeps the accent of a decomposed letter inside the mark', () => {
    const text = 'Ștefan';
    const range = matchRange(text, 'st');
    expect(range).toEqual({ start: 0, end: 3 });
    expect(text.slice(range!.start, range!.end)).toBe('Șt');
    expect(matchRange('Ana Ș', 's')).toEqual({ start: 4, end: 6 });
  });

  it('maps a letter that folds into two', () => {
    expect(matchRange('Groß Ana', 'ana')).toEqual({ start: 5, end: 8 });
  });

  it('agrees with the matcher on every slice of a name', () => {
    const names = ['Ștefan Radu', 'Ioana  Stefănescu', 'S\u0326tefan Ţăran', 'Groß Łukasz', 'Éva Öztürk', 'Ana-Maria Îonescu'];
    for (const name of names) {
      for (let start = 0; start < name.length; start++) {
        for (let end = start + 1; end <= name.length; end++) {
          const query = name.slice(start, end);
          expect(matchRange(name, query) !== null, `${name} / ${query}`).toBe(searchMatcher(query)(name));
        }
      }
    }
  });

  it('gives null when the search is not there', () => {
    expect(matchRange('Ana', 'pop')).toBeNull();
    expect(matchRange('Ana', '')).toBeNull();
  });
});
