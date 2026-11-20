import { afterEach, describe, expect, it } from 'vitest';
import { quickTryPhonePath } from '../../shared/quickTry.ts';
import { LANG_KEY } from '../i18n/lang.ts';
import { initLangSwitch } from './langSwitch.ts';

afterEach(() => {
  document.documentElement.lang = 'ro';
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('the language link of the public pages', () => {
  it('saves the language it leads to', () => {
    document.body.innerHTML = '<a href="/en/" data-lang-switch="en">EN</a>';
    initLangSwitch();
    document.querySelector('a')!.addEventListener('click', (event) => event.preventDefault());
    document.querySelector('a')!.click();
    expect(localStorage.getItem(LANG_KEY)).toBe('en');
  });

  it('keeps English for a reader who came straight to an English page', () => {
    document.documentElement.lang = 'en';
    initLangSwitch();
    expect(localStorage.getItem(LANG_KEY)).toBe('en');
  });

  it('changes no saved choice and saves nothing on a Romanian page', () => {
    initLangSwitch();
    expect(localStorage.getItem(LANG_KEY)).toBeNull();
    localStorage.setItem(LANG_KEY, 'ro');
    document.documentElement.lang = 'en';
    initLangSwitch();
    expect(localStorage.getItem(LANG_KEY)).toBe('ro');
  });
});

describe("the Quick Try's phone address", () => {
  it('carries the English of an English page to the phone', () => {
    expect(quickTryPhonePath('tok')).toBe('/try/tok/phone');
    expect(quickTryPhonePath('tok', true)).toBe('/try/tok/phone?here=1');
    document.documentElement.lang = 'en';
    expect(quickTryPhonePath('tok')).toBe('/try/tok/phone?lang=en');
    expect(quickTryPhonePath('tok', true)).toBe('/try/tok/phone?here=1&lang=en');
  });
});
