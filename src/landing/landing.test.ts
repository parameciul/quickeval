import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import raw from '../../index.html?raw';
import { SIGNUP_HASH } from '../admin/pages/LoginPage.tsx';
import { THEME_KEY } from '../ui/theme.ts';
import { expandPartials } from './partials.ts';
import { initSiteMenu } from './siteMenu.ts';
import { initThemeButton, themeLabel } from './themeButton.ts';

// The page as it is served, with its shared footer in place.
const page = expandPartials(raw);
const doc = new DOMParser().parseFromString(page, 'text/html');
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const all = (selector: string) => Array.from(doc.querySelectorAll(selector));

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-theme');
});

describe('the landing page', () => {
  it('says what MQGrader does on the first screen', () => {
    // Laura's statement is the heading, the one h1 of the page.
    expect(all('h1').map(text)).toEqual(['Weekendul tău, fără teancul de lucrări.']);
    expect(text(doc.querySelector('.l-lede'))).toBe(
      'MQGrader este o platformă web pentru profesorii de matematică din România. Elevii trimit pozele lucrărilor de pe telefon. Fiecare lucrare primește punctaj conform baremului.',
    );
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
      'Fiecare elev primește un link cu rezultatul lui: nota, punctele pe fiecare exercițiu, explicații detaliate pentru fiecare problemă rezolvată corect sau greșit și o sinteză finală cu ce merge bine și recomandări. Raportul clasei, un PDF pentru fiecare elev și CSV pentru catalog.',
    );
    // The sentence is not a bold lead: it reads like the rest of the stage.
    expect(stages[5]!.querySelector('b')).toBeNull();
  });

  it("keeps Laura Miron's texts word for word", () => {
    expect(text(doc.getElementById('gata-t'))).toBe('Gata cu orele pierdute noaptea târziu corectând teze și teste!');
    expect(all('.ink .l-body').map(text)).toEqual([
      'Descoperă noua platformă care îți ia o mare greutate de pe umeri și îți oferă corectură riguroasă, exact după barem, în doar câteva minute.',
      'Ce o face diferită? Controlul rămâne 100% la tine. Știm că fiecare elev e unic și pot apărea situații nuanțate, așa că platforma îți permite să modifici oricând punctajele în cazurile discutabile sau creative.',
    ]);
    expect(text(doc.getElementById('ajutor-t'))).toBe('Cum te ajută platforma noastră?');
    expect(all('#ajutor .benefits h3').map(text)).toEqual(['Acuratețe după barem', 'Control total în situații discutabile', 'Economie masivă de timp']);
  });

  it('leads to the login, and to a new account', () => {
    const links = all('a').map((a) => [text(a), a.getAttribute('href')]);
    // The page is served signed out: the account links wait, hidden, for the API's answer.
    expect(all('[data-member]').every((el) => el.hasAttribute('hidden'))).toBe(true);
    expect(all('[data-guest]').some((el) => el.hasAttribute('hidden'))).toBe(false);
    expect(links.filter(([name]) => name === 'Intră în cont')).toEqual([
      ['Intră în cont', '/teacher/'],
      ['Intră în cont', '/teacher/'],
    ]);
    expect(links).toContainEqual(['Cere un cont de profesor', `/teacher/${SIGNUP_HASH}`]);
  });

  it('shows the brand with its byline and never a meaning of MQ', () => {
    const lockups = all('.brand .words').map((w) => [text(w.querySelector('b')), text(w.querySelector('span'))]);
    expect(lockups).toEqual([
      ['MQGrader', 'by Laura Miron'],
      ['MQGrader', 'by Laura Miron'],
    ]);
    expect(page).not.toMatch(/Quantitative/i);
  });

  it('sends readers from its own text to the pages that answer a search', () => {
    const more = all('#mai-multe .more-list a').map((a) => [text(a.querySelector('b')), a.getAttribute('href')]);
    expect(more).toEqual([
      ['Cum corectezi testele de matematică după barem', '/ghid/'],
      ['Baremul de corectare', '/barem/'],
      ['Despre MQGrader', '/despre/'],
      ['Cât costă', '/preturi/'],
    ]);
    // Every card says what the page is about, in one line.
    for (const a of all('#mai-multe .more-list a')) expect((text(a.querySelector('span')) ?? '').length).toBeGreaterThan(40);
    // The header's menu names the same four pages.
    expect(all('.site-top nav a:not(.btn)').map((a) => a.getAttribute('href'))).toEqual(['#cum', '#ajutor', '/ghid/', '/barem/', '/despre/', '/preturi/']);
    // The account picture waits until the app's look settles.
    expect(doc.getElementById('aplicatia')).toBeNull();
  });

  it('gives the contact address and says who builds MQGrader', () => {
    const contact = doc.getElementById('contact');
    expect(text(contact?.querySelector('h2') ?? null)).toBe('Contact');
    expect(Array.from(contact?.querySelectorAll('a') ?? []).map((a) => [text(a), a.getAttribute('href')])).toEqual([
      ['contact@mqgrader.ro', 'mailto:contact@mqgrader.ro'],
    ]);
    expect(text(contact)).toContain('Laura Miron, profesoară de matematică la Liceul William Shakespeare din Timișoara');
    const ld = JSON.parse(text(doc.querySelector('script[type="application/ld+json"]')));
    const org = ld['@graph'].find((n: { '@type': string }) => n['@type'] === 'Organization');
    expect(org.email).toBe('contact@mqgrader.ro');
    expect(org.contactPoint.email).toBe('contact@mqgrader.ro');
  });

  it('may be indexed, and names its own address', () => {
    const robots = doc.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '';
    expect(robots).toMatch(/^index\b/);
    expect(robots).not.toContain('noindex');
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://mqgrader.ro/');
    expect(doc.documentElement.getAttribute('lang')).toBe('ro');
    expect(page).not.toContain('quickeval.pages.dev');
  });

  it('has a title and a description of a good length, and a share card', () => {
    expect(doc.title.length).toBeLessThanOrEqual(65);
    const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
    expect(description.length).toBeGreaterThanOrEqual(70);
    expect(description.length).toBeLessThanOrEqual(165);
    const meta = (property: string) => doc.querySelector(`meta[property="${property}"]`)?.getAttribute('content');
    expect(meta('og:url')).toBe('https://mqgrader.ro/');
    expect(meta('og:image')).toBe('https://mqgrader.ro/og-image.png');
    expect(meta('og:locale')).toBe('ro_RO');
    expect(doc.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary_large_image');
  });

  it('carries structured data that matches the visible questions', () => {
    const ld = JSON.parse(text(doc.querySelector('script[type="application/ld+json"]')));
    const nodes: { '@type': string; mainEntity?: { name: string; acceptedAnswer: { text: string } }[] }[] = ld['@graph'];
    expect(nodes.map((n) => n['@type'])).toEqual(
      expect.arrayContaining(['Organization', 'Person', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage']),
    );
    const faq = nodes.find((n) => n['@type'] === 'FAQPage')!.mainEntity!;
    const visible = all('#intrebari .benefits li').map((li) => [text(li.querySelector('h3')), text(li.querySelector('p'))]);
    expect(faq.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(visible);
    expect(page).not.toMatch(/aggregateRating|"offers"/);
  });

  it('has no inline script or style, which the security policy blocks', () => {
    const code = all('script').filter((s) => s.getAttribute('type') !== 'application/ld+json');
    expect(code.every((s) => s.getAttribute('src') && !text(s))).toBe(true);
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

describe('the menu of the public pages', () => {
  // The page as it is served: the links wait behind the ☰ button on a phone.
  function mount() {
    document.body.innerHTML = doc.body.innerHTML;
    initSiteMenu(document);
    return {
      button: document.querySelector<HTMLButtonElement>('[data-nav-toggle]')!,
      links: document.querySelector<HTMLElement>('[data-nav-links]')!,
    };
  }

  it('opens the header links from the ☰ button, and closes them with Esc', async () => {
    const { button, links } = mount();
    expect(button.getAttribute('aria-controls')).toBe(links.id);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(links.classList.contains('is-open')).toBe(false);

    await userEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(links.classList.contains('is-open')).toBe(true);

    await userEvent.keyboard('{Escape}');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(links.classList.contains('is-open')).toBe(false);
    expect(button).toHaveFocus();
  });

  it('closes on a click elsewhere and on a link of the menu', async () => {
    const { button, links } = mount();
    await userEvent.click(button);
    await userEvent.click(document.body);
    expect(links.classList.contains('is-open')).toBe(false);

    await userEvent.click(button);
    await userEvent.click(links.querySelector('a')!);
    expect(links.classList.contains('is-open')).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
