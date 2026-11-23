import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import raw from '../../index.html?raw';
import themeScript from '../../public/theme.js?raw';
import { SIGNUP_HASH } from '../admin/pages/LoginPage.tsx';
import { THEME_KEY } from '../ui/theme.ts';
import { expandPartials } from './partials.ts';
import { initSiteMenu } from './siteMenu.ts';
import { initThemeButton, themeLabel } from './themeButton.ts';

// The page as it is served, with its shared footer in place.
const page = expandPartials(raw);
const doc = new DOMParser().parseFromString(page, 'text/html');
// The words of an element; a button's arrow is drawn, not read.
const text = (el: Element | null) => (el?.textContent ?? '').replace('→', '').replace(/\s+/g, ' ').trim();
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
      'MQGrader.ro este o platformă web dedicată profesorilor din România, care simplifică corectarea testelor: elevii încarcă pozele lucrărilor direct de pe telefon, iar fiecare lucrare este punctată rapid, conform baremului.',
    );
  });

  it('tells the day of a test by the clock, with who does each step', () => {
    const steps = all('#how .clock > li');
    expect(steps.map((li) => [text(li.querySelector('time')), text(li.querySelector('h3')), text(li.querySelector('.whos'))])).toEqual([
      ['Luni cu o zi înainte', 'Încarci testul și baremul.', 'Tu MQGrader'],
      ['11:45 ultimele minute ale orei', 'Elevii fotografiază lucrarea.', 'Elevii'],
      ['11:55 după oră', 'Pornești corectarea.', 'Tu MQGrader'],
      ['15:30 de unde ești', 'Verifici punctele nesigure.', 'Tu'],
      ['16:00 aceeași zi', 'Publici. Elevii își văd rezultatul.', 'MQGrader Tu Elevii'],
    ]);
    // The buttons she presses, in the app's own words.
    expect(text(steps[2]!)).toContain('„Închide încărcarea și pornește corectarea”');
    expect(text(steps[4]!)).toContain('„Publică rezultatele”');
    // AI is how it works, said on the first screen; the headline stays hers.
    expect(text(doc.querySelector('.hero .lede'))).toContain('cu ajutorul inteligenței artificiale');
  });

  it("keeps Laura Miron's texts word for word", () => {
    expect(text(doc.getElementById('ready-t'))).toBe('Gata cu orele pierdute noaptea târziu corectând teste!');
    expect(all('.ink .l-body').map(text)).toEqual([
      'Descoperă noua platformă care îți ia o mare greutate de pe umeri și îți oferă corectură riguroasă, exact după barem, în doar câteva minute.',
      'Ce o face diferită? Controlul rămâne 100% la tine. Știm că fiecare elev e unic și pot apărea situații nuanțate, așa că platforma îți permite să modifici oricând punctajele în cazurile discutabile sau creative.',
    ]);
    expect(text(doc.getElementById('benefits-t'))).toBe('Cum te ajută platforma noastră?');
    expect(all('#benefits .benefits h3').map(text)).toEqual(['Acuratețe după barem', 'Control total în situații discutabile', 'Economie masivă de timp']);
  });

  it('leads to the login, and to a new account', () => {
    const links = all('a').map((a) => [text(a), a.getAttribute('href')]);
    // The page is served signed out: the account links wait, hidden, for the API's answer.
    expect(all('[data-member]').every((el) => el.hasAttribute('hidden'))).toBe(true);
    expect(all('[data-guest]').some((el) => el.hasAttribute('hidden'))).toBe(false);
    expect(links.filter(([name]) => name === 'Intră în cont')).toEqual([['Intră în cont', '/teacher/']]);
    // Every way to an account, in the hero and in the bands, opens the sign-up.
    const signUps = links.filter(([name]) => name === 'Cere un cont de profesor');
    expect(signUps.length).toBeGreaterThanOrEqual(2);
    for (const link of signUps) expect(link).toEqual(['Cere un cont de profesor', `/teacher/${SIGNUP_HASH}`]);
    // One colour per action: the account is dark, the Quick Try orange.
    for (const a of all('a.btn')) if (text(a) === 'Cere un cont de profesor') expect(a.classList.contains('btn-acc')).toBe(true);
    for (const button of all('[data-try-open]')) expect(button.classList.contains('btn-go')).toBe(true);
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
    const more = all('#more ul a').map((a) => [text(a.querySelector('b')), a.getAttribute('href')]);
    expect(more).toEqual([
      ['Cum folosești MQGrader, pas cu pas', '/guide/'],
      ['Cum corectezi testele cu MQGrader', '/grading/'],
      ['Despre MQGrader', '/about/'],
      ['Cât costă', '/pricing/'],
    ]);
    // Every card says what the page is about, in one line.
    for (const a of all('#more ul a')) expect((text(a.querySelector('span')) ?? '').length).toBeGreaterThan(40);
    // The header's menu names the same four pages, then the English copy of this one.
    expect(all('.site-top nav a:not(.btn)').map((a) => a.getAttribute('href'))).toEqual(['/', '/guide/', '/grading/', '/about/', '/pricing/', '/en/']);
    // The account picture waits until the app's look settles.
    expect(doc.getElementById('aplicatia')).toBeNull();
  });

  it('gives the contact address and says who builds MQGrader', () => {
    const contact = doc.getElementById('contact');
    expect(text(contact?.querySelector('h2') ?? null)).toBe('Cine face MQGrader');
    expect(Array.from(contact?.querySelectorAll('a') ?? []).map((a) => [text(a), a.getAttribute('href')])).toEqual([
      ['Matematică cu Laura Miron', 'https://lauramiron.mqgrader.ro/'],
      ['Despre MQGrader', '/about/'],
      ['contact@mqgrader.ro', 'mailto:contact@mqgrader.ro'],
    ]);
    expect(text(contact)).toContain(
      'MQGrader este construit de Laura Miron, profesoară de matematică la Liceul Teoretic „William Shakespeare” din Timișoara și autoarea platformei Matematică cu Laura Miron, împreună cu soțul ei, tocmai pentru a lua din greutatea munților de hârtie de pe birou.',
    );
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
    const visible = all('#faq .qa li').map((li) => [text(li.querySelector('h3')), text(li.querySelector('p'))]);
    expect(visible.length).toBeGreaterThanOrEqual(8);
    expect(faq.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(visible);
    // The generated barem is revised and confirmed by the teacher, never "a proposal".
    expect(page).not.toMatch(/propunere|Barem propus/);
    expect(page).not.toMatch(/aggregateRating|"offers"/);
  });

  it('shows only real screenshots that exist, each with its size and its words', () => {
    const shots = all('img').filter((img) => (img.getAttribute('src') ?? '').startsWith('/screens/'));
    expect(shots.length).toBeGreaterThanOrEqual(12);
    for (const img of shots) {
      const src = img.getAttribute('src')!;
      expect(existsSync(resolve(__dirname, '../../public', src.slice(1))), src).toBe(true);
      expect(Number(img.getAttribute('width'))).toBeGreaterThan(0);
      expect(Number(img.getAttribute('height'))).toBeGreaterThan(0);
      expect((img.getAttribute('alt') ?? '').length).toBeGreaterThan(15);
    }
    // Below the first screen the pictures wait until they are needed.
    expect(shots.filter((img) => img.getAttribute('loading') === 'lazy').length).toBeGreaterThan(shots.length / 2);
  });

  it('shows every Quick Try button from the first paint, but only on a page that runs its script', () => {
    const buttons = all('[data-try-open]');
    expect(buttons.map(text)).toEqual(['Încearcă pe o lucrare, fără cont', 'Încearcă acum', 'Încearcă fără cont']);
    // The landing page has no price section: the prices are on /pricing/.
    expect(doc.getElementById('pricing')).toBeNull();
    // Not hidden in the markup: the buttons do not wait for the API's answer.
    for (const button of buttons) expect(button.hasAttribute('hidden')).toBe(false);
    // The head script marks a page that runs scripts; without it the stylesheet hides the buttons.
    expect(themeScript).toContain("setAttribute('data-js', '')");
    expect(readFileSync(resolve(__dirname, 'landing.css'), 'utf8')).toContain(':root:not([data-js]) [data-try-open], :root:not([data-js]) [data-try-hint] { display: none !important; }');
    // The form names the try after its test file: it asks for no name.
    expect(doc.querySelector('[data-try-form] input[name="title"]')).toBeNull();
    // The content pages send a teacher to the try on this page.
    expect(doc.getElementById('try')).not.toBeNull();
  });

  it('fits the header to a narrow phone, so the page never scrolls sideways', () => {
    const css = readFileSync(resolve(__dirname, 'landing.css'), 'utf8');
    const start = css.indexOf('@media (max-width: 440px) {');
    expect(start).toBeGreaterThan(css.indexOf('.bar .btn-small { margin-left: 6px;'));
    const block = css.slice(start, css.indexOf('\n}\n', start));
    expect(block).toContain('.bar { gap: 6px; }');
    expect(block).toContain('.bar .mark { width: 26px; height: 26px; }');
    expect(block).toContain('.bar .brand .words b { font-size: 16px; }');
    // The icons keep a 44px height to tap; only their width shrinks.
    expect(block).toContain('.bar .icon { width: 36px; }');
    expect(block).not.toMatch(/\.icon \{[^}]*height/);
    expect(block).toContain('.bar .btn-small { margin-left: 4px; padding: 0 9px; font-size: 14px; }');
    // Every page's header has the same parts the block sizes: the lockup, three icons, the two account buttons.
    const bar = doc.querySelector('.bar nav');
    expect(bar?.querySelectorAll(':scope > .icon').length).toBe(3);
    expect(bar?.querySelectorAll(':scope > .btn-small').length).toBe(2);
  });

  it('gives a phone a low header and a short menu, the page marked by a line under its name', () => {
    const css = readFileSync(resolve(__dirname, 'landing.css'), 'utf8');
    const start = css.indexOf('@media (max-width: 900px) {\n  .bar { min-height: 60px; }');
    expect(start).toBeGreaterThan(0);
    const block = css.slice(start, css.indexOf('\n}\n', start));
    // The menu opens right under the 60px header and scrolls when the screen is shorter.
    expect(block).toContain('top: 60px;');
    expect(block).toContain('max-height: calc(100dvh - 60px); overflow-y: auto;');
    // Rows of 44px, the words plain, each after its icon.
    expect(block).toContain('.links a { display: flex; align-items: center; gap: 14px; padding: 11px 0; border-radius: 0; font-size: 17px; font-weight: 400; }');
    expect(block).toContain('.nav-ico { display: block; width: 22px; height: 22px;');
    expect(block).not.toMatch(/font-weight: [5-9]00/);
    // The page the reader is on: a line under its name, not a bar at its side.
    // In long properties: Safari drops a shorthand that holds the thickness.
    expect(block).toContain('.links a[aria-current="page"] span { text-decoration-line: underline; text-decoration-thickness: 3px; text-decoration-color: var(--orange-mark);');
    expect(block).not.toMatch(/text-decoration: underline \d/);
    expect(block).not.toContain('inset 4px 0 0');
    // The icons stay out of the header of a wide screen.
    expect(css.indexOf('.nav-ico { display: none; }')).toBeLessThan(start);
    // A phone turned sideways: the five pages in three columns, a long name
    // wrapping in its own; an upright phone with its keyboard open keeps the list.
    const side = css.indexOf('@media (min-width: 540px) and (max-width: 900px) and (max-height: 500px) {');
    expect(side).toBeGreaterThan(start);
    const sideBlock = css.slice(side, css.indexOf('\n}\n', side));
    expect(sideBlock).toContain('.links.is-open { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(sideBlock).toContain('white-space: normal;');
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
