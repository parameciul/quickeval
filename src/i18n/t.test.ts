import { afterEach, describe, expect, it } from 'vitest';
import { EN } from './en/index.ts';
import { currentLang, langHeaders, publicPath } from './lang.ts';
import { locale, t, tc, tl } from './t.ts';

const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

afterEach(() => {
  document.documentElement.lang = 'ro';
});

describe('the English dictionary', () => {
  // A text that starts or ends with a space is joined to another; its
  // English keeps that space, or two words run together.
  it('keeps the spaces at the ends of each Romanian text', () => {
    const edges = (text: string) => [text.match(/^\s*/)![0], text.match(/\s*$/)![0]];
    const wrong = Object.entries(EN).filter(([romanian, english]) => edges(romanian).join('|') !== edges(english).join('|'));
    expect(wrong).toEqual([]);
  });

  it('keeps every value of its Romanian text', () => {
    const wrong = Object.entries(EN).filter(([romanian, english]) => names(romanian).join() !== names(english).join());
    expect(wrong).toEqual([]);
  });

  it('has no empty text', () => {
    expect(Object.entries(EN).filter(([, english]) => english.trim() === '')).toEqual([]);
  });
});

describe('t', () => {
  it('gives the Romanian text on a Romanian page, with its values', () => {
    expect(currentLang()).toBe('ro');
    expect(t('Ești {name}?', { name: 'Ana' })).toBe('Ești Ana?');
    expect(locale()).toBe('ro-RO');
    expect(langHeaders()).toEqual({});
    expect(publicPath('/about/')).toBe('/about/');
  });

  it('gives the English text on an English page', () => {
    document.documentElement.lang = 'en';
    expect(currentLang()).toBe('en');
    expect(t('Ești {name}?', { name: 'Ana' })).toBe('Are you Ana?');
    expect(locale()).toBe('en-GB');
    expect(langHeaders()).toEqual({ 'X-MQ-Lang': 'en' });
    expect(publicPath('/about/')).toBe('/en/about/');
  });

  it('gives a text in another language than the page', () => {
    expect(tl('en', 'Salvează')).toBe('Save');
  });
});

describe('tc', () => {
  it('counts in Romanian, with "de" from 20', () => {
    expect(tc(1, 'lucrare', 'lucrări')).toBe('1 lucrare');
    expect(tc(2, 'lucrare', 'lucrări')).toBe('2 lucrări');
    expect(tc(20, 'lucrare', 'lucrări')).toBe('20 de lucrări');
  });

  it('counts in English', () => {
    document.documentElement.lang = 'en';
    expect(tc(1, 'lucrare', 'lucrări')).toBe('1 paper');
    expect(tc(20, 'lucrare', 'lucrări')).toBe('20 papers');
  });
});
