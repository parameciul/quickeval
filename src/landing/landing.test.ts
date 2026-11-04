import { afterEach, describe, expect, it } from 'vitest';
import page from '../../index.html?raw';
import { SIGNUP_HASH } from '../admin/pages/LoginPage.tsx';
import { THEME_KEY } from '../ui/theme.ts';
import { initThemeButton, themeLabel } from './landing.ts';

const doc = new DOMParser().parseFromString(page, 'text/html');
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const all = (selector: string) => Array.from(doc.querySelectorAll(selector));

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-theme');
});

describe('the landing page', () => {
  it('says what MQGrader does on the first screen', () => {
    expect(all('h1').map(text)).toEqual(['Weekendul tău, fără teancul de lucrări.']);
    expect(text(doc.querySelector('.l-lede'))).toBe('Elevii trimit pozele lucrărilor de pe telefon. Fiecare lucrare primește punctaj conform baremului.');
  });

  it('shows the six stages in order, with who does each one', () => {
    const stages = all('.flow-v li');
    expect(stages.map((li) => text(li.querySelector('h3')))).toEqual([
      'Pregătire Tu',
      'Tipărire Tu',
      'În clasă Elevii',
      'Corectare MQGrader',
      'Verificare Tu',
      'Rezultate Tu',
    ]);
    expect(text(stages[5]!.querySelector('p'))).toBe(
      'Fiecare elev primește un link cu rezultatul lui. Raportul clasei, un PDF pentru fiecare elev și CSV pentru catalog.',
    );
  });

  it("keeps Laura Miron's texts word for word", () => {
    expect(text(doc.getElementById('gata-t'))).toBe('Gata cu orele pierdute noaptea târziu corectând teze și teste!');
    expect(all('.ink .l-body').map(text)).toEqual([
      'Descoperă noua platformă care îți ia o mare greutate de pe umeri și îți oferă corectură riguroasă, exact după barem, în doar câteva minute.',
      'Ce o face diferită? Controlul rămâne 100% la tine. Știm că fiecare elev e unic și pot apărea situații nuanțate, așa că platforma îți permite să modifici oricând punctajele în cazurile discutabile sau creative.',
    ]);
    expect(text(doc.getElementById('ajutor-t'))).toBe('Cum te ajută platforma noastră?');
    expect(all('.benefits h3').map(text)).toEqual(['Acuratețe după barem', 'Control total în situații discutabile', 'Economie masivă de timp']);
  });

  it('leads to the login, and to a new account', () => {
    const links = all('a').map((a) => [text(a), a.getAttribute('href')]);
    expect(links.filter(([name]) => name === 'Intră în cont')).toEqual([
      ['Intră în cont', '/admin/'],
      ['Intră în cont', '/admin/'],
    ]);
    expect(links).toContainEqual(['Cere un cont de profesor', `/admin/${SIGNUP_HASH}`]);
  });

  it('shows the brand with its byline and never a meaning of MQ', () => {
    const lockups = all('.brand .words').map((w) => [text(w.querySelector('b')), text(w.querySelector('span'))]);
    expect(lockups).toEqual([
      ['MQGrader', 'by Laura Miron'],
      ['MQGrader', 'by Laura Miron'],
    ]);
    expect(page).not.toMatch(/Quantitative/i);
  });

  it('stays out of search engines', () => {
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
  });

  it('has no inline script or style, which the security policy blocks', () => {
    expect(all('script').every((s) => s.getAttribute('src') && !text(s))).toBe(true);
    expect(all('[style]')).toEqual([]);
    expect(all('*').filter((el) => Array.from(el.attributes).some((a) => a.name.startsWith('on')))).toEqual([]);
    expect(all('style')).toEqual([]);
  });
});

describe('the theme button of the landing page', () => {
  function mount() {
    document.body.innerHTML = doc.body.innerHTML;
    initThemeButton(document);
    return document.querySelector<HTMLButtonElement>('[data-theme-toggle]')!;
  }

  it('names the theme it switches to', () => {
    expect(themeLabel('light')).toBe('Temă întunecată');
    expect(themeLabel('dark')).toBe('Temă luminoasă');
  });

  it('switches to dark and back, and keeps the choice', () => {
    const button = mount();
    expect(button.getAttribute('aria-label')).toBe('Temă întunecată');
    button.click();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(button.getAttribute('aria-label')).toBe('Temă luminoasă');
    button.click();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(button.getAttribute('aria-label')).toBe('Temă întunecată');
  });

  it('starts from the saved choice', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    expect(mount().getAttribute('aria-label')).toBe('Temă luminoasă');
  });
});
