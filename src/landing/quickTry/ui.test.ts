import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import page from '../../../index.html?raw';
import headers from '../../../public/_headers?raw';
import type { QuickTryAvailability, SubmissionFile } from '../../../shared/api.ts';
import { PDF_TYPE } from '../../../shared/files.ts';
import { tryTest } from '../../test/fakeTryApi.tsx';
import { ApiError } from '../../ui/ApiError.ts';
import type { LandingApi } from './api.ts';
import { PHONE_MEDIA } from '../../../shared/quickTry.ts';
import { DELETED_TRY_KEY, STORED_TRY_KEY } from './storage.ts';
import { initQuickTry, type TurnstileWidget } from './ui.ts';

const TOKEN = 'abcdefghijkmnopqrstuvwxyz2345672';
const CODE = 'PROBA-26T1';
const NOW = new Date('2026-11-10T08:00:00.000Z');
const files = { test: { name: 'test.pdf', type: PDF_TYPE }, barem: { name: 'barem.pdf', type: PDF_TYPE } };
const grading = tryTest({ status: 'evaluating', files }, { status: 'submitted' });
const graded = tryTest({ status: 'done', files }, { status: 'graded' });

let mounted = new AbortController();

afterEach(() => {
  mounted.abort();
  mounted = new AbortController();
  document.body.innerHTML = '';
  localStorage.clear();
});

function fakeLandingApi(availability: Partial<QuickTryAvailability> = {}) {
  return {
    availability: vi.fn(async () => ({ dailyLimitReached: false, admin: false, signedIn: false, siteKey: 'site-key', ...availability })),
    create: vi.fn(async (_turnstileToken?: string, _title?: string) => ({ token: TOKEN, code: CODE })),
    uploadTestFile: vi.fn(async () => {}),
    generateBarem: vi.fn(async () => {}),
    addPage: vi.fn(async () => {}),
    listPages: vi.fn(async (_token: string): Promise<SubmissionFile[]> => []),
    start: vi.fn(async () => {}),
    getTest: vi.fn(async () => grading),
  } satisfies LandingApi;
}

function fakeTurnstile(answer: string | null = 'turnstile-ok') {
  const widget: TurnstileWidget = { token: vi.fn(() => answer ?? undefined), reset: vi.fn() };
  return { load: vi.fn(async (_container: HTMLElement, _siteKey: string) => widget), widget };
}

interface PhoneDeps {
  isPhone?: () => boolean;
  go?: (path: string) => void;
  watchPhone?: (onChange: () => void) => void;
  checkAccount?: (root: ParentNode) => Promise<void>;
}

async function mount(api = fakeLandingApi(), turnstile = fakeTurnstile(), phone: PhoneDeps = {}) {
  document.body.innerHTML = new DOMParser().parseFromString(page, 'text/html').body.innerHTML;
  await initQuickTry(document, {
    api,
    storage: localStorage,
    now: () => NOW,
    loadTurnstile: turnstile.load,
    refreshMs: 5,
    origin: 'https://mqgrader.ro',
    drawQr: async () => {},
    isPhone: phone.isPhone ?? (() => false),
    go: phone.go,
    watchPhone: phone.watchPhone ?? (() => {}),
    checkAccount: phone.checkAccount ?? (async () => {}),
    signal: mounted.signal,
  });
  return { api, turnstile };
}

const button = () => screen.queryByRole('button', { name: 'Încearcă pe o lucrare, fără cont' });
// Every Quick Try button of the page: the hero's, the try section's, the end band's.
const tryButtons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[data-try-open]'));
const dialog = () => document.querySelector<HTMLDialogElement>('[data-try-dialog]')!;

function pick(label: RegExp, ...picked: File[]) {
  const input = within(dialog()).getByLabelText(label) as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: picked, configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

const pdf = (name: string) => new File(['%PDF-1.7'], name, { type: PDF_TYPE });
const photo = (name: string) => new File(['jpg'], name, { type: 'image/jpeg' });

function fillForm() {
  pick(/^Testul/, pdf('test.pdf'));
  pick(/^Baremul/, pdf('barem.pdf'));
  pick(/^Lucrarea elevului/, photo('p1.jpg'), photo('p2.jpg'));
}

const pagesRow = () => within(dialog()).getByLabelText(/^Lucrarea elevului/).closest<HTMLElement>('[data-try-pick]')!;
function sendByPhone() {
  pick(/^Testul/, pdf('test.pdf'));
  pick(/^Baremul/, pdf('barem.pdf'));
  within(pagesRow()).getByRole('button', { name: 'Cu telefonul' }).click();
  send();
}

// A page shown: from the browser's back/forward cache when `persisted`.
function pageShow(persisted: boolean): Event {
  const shown = new Event('pageshow');
  Object.defineProperty(shown, 'persisted', { value: persisted });
  return shown;
}

const send = () => within(dialog()).getByRole('button', { name: 'Trimite' }).click();
const store = (madeAt = NOW.toISOString()) => localStorage.setItem(STORED_TRY_KEY, JSON.stringify({ token: TOKEN, code: CODE, madeAt }));

describe("the landing page's Quick Try", () => {
  it('shows the button under the login, with a line on what she gets, when a try can be made', async () => {
    await mount();
    expect(button()).toBeVisible();
    expect(button()!.closest('.cta')).not.toBeNull();
    expect(screen.getByText('Gratuit: trimiți lucrarea unui elev și o primești corectată în câteva minute.')).toBeVisible();
  });

  it('hides the line with the button', async () => {
    await mount(fakeLandingApi({ dailyLimitReached: true }));
    expect(screen.getByText(/^Gratuit: trimiți lucrarea/)).not.toBeVisible();
  });

  it('shows her try as a card: its name, when she sent it, its state and its grade', async () => {
    store('2026-11-10T07:30:00.000Z');
    const api = fakeLandingApi();
    api.getTest.mockResolvedValue(
      tryTest({ status: 'done', files, title: 'Test funcții 9B' }, { status: 'graded', grade: 6.7, total: 67, maxTotal: 100, flagCount: 2 }),
    );
    await mount(api);
    const card = screen.getByRole('status');
    expect(within(card).getByText('Test funcții 9B')).toBeVisible();
    expect(card).toHaveTextContent('Trimisă 10 nov. 2026, 09:30 · Linkul merge până pe 17 noiembrie 2026');
    expect(within(card).getByText('2 puncte de verificat')).toHaveClass('try-chip', 'is-you');
    expect(within(card).getByText('6,7')).toBeVisible();
    expect(card).toHaveTextContent('67 din 100 de puncte');
  });

  it('shows no grade on the card while the paper is not graded', async () => {
    store();
    await mount();
    expect(within(screen.getByRole('status')).getByText('Se corectează')).toHaveClass('try-chip', 'is-work');
    expect(document.querySelector('[data-try-score]')).not.toBeVisible();
  });

  it('turns the button off while the Turnstile key is not set', async () => {
    await mount(fakeLandingApi({ siteKey: null }));
    expect(button()).toBeVisible();
    expect(button()).toBeDisabled();
  });

  it("says when the day's free tries are all used, and turns the buttons off", async () => {
    await mount(fakeLandingApi({ dailyLimitReached: true }));
    expect(button()).toBeDisabled();
    expect(screen.getByText(/Încercările gratuite de azi s-au terminat/)).toHaveTextContent(
      'Încercările gratuite de azi s-au terminat. Încearcă din nou mâine sau creează un cont: corectezi gratuit un test pentru toată clasa.',
    );
  });

  it("keeps one try per device per day, and shows today's try with its link", async () => {
    store();
    const { api } = await mount();
    expect(button()).toBeVisible();
    expect(button()).toBeDisabled();
    expect(button()).toHaveAttribute('title', 'Ai făcut încercarea de azi. Mâine poți face alta.');
    expect(screen.getByText('Ai făcut încercarea de azi. Mâine poți face alta.')).toBeVisible();
    expect(screen.getByText(/^Gratuit: trimiți lucrarea/)).not.toBeVisible();
    expect(api.getTest).toHaveBeenCalledWith(TOKEN, CODE);
    expect(screen.getByRole('status')).toHaveTextContent('Se corectează… Durează câteva minute.');
    expect(screen.getByRole('link', { name: 'Deschide încercarea' })).toHaveAttribute('href', `/try/${TOKEN}`);
  });

  it('follows the grading until the paper is graded', async () => {
    store();
    const api = fakeLandingApi();
    api.getTest.mockResolvedValueOnce(grading).mockResolvedValue(graded);
    await mount(api);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Lucrarea este corectată.'));
    const reads = api.getTest.mock.calls.length;
    await new Promise((done) => setTimeout(done, 30));
    expect(api.getTest.mock.calls.length).toBe(reads);
  });

  it('lets her try again today when her try failed', async () => {
    store();
    const api = fakeLandingApi();
    api.getTest.mockResolvedValue(tryTest({ files, barem: { request: 'failed', unchecked: false } }));
    await mount(api);
    expect(screen.getByRole('status')).toHaveTextContent('Încercarea nu a reușit. Nu se numără: poți face alta azi.');
    expect(button()).toBeVisible();
  });

  it('forgets a try whose link no longer works', async () => {
    store('2026-11-09T08:00:00.000Z');
    const api = fakeLandingApi();
    api.getTest.mockRejectedValue(new ApiError(404, 'unknown_try', 'Linkul nu este bun.'));
    await mount(api);
    expect(screen.queryByRole('status')).toBeNull();
    expect(button()).toBeVisible();
    expect(localStorage.getItem(STORED_TRY_KEY)).toBeNull();
  });

  it('sends the form with the Turnstile answer, keeps the link and follows the try', async () => {
    const { api, turnstile } = await mount();
    button()!.click();
    expect(dialog().hasAttribute('open')).toBe(true);
    await waitFor(() => expect(turnstile.load).toHaveBeenCalledWith(document.querySelector('[data-try-turnstile]'), 'site-key'));
    fillForm();
    send();
    await waitFor(() => expect(dialog().hasAttribute('open')).toBe(false));
    expect(api.create).toHaveBeenCalledWith('turnstile-ok', 'test');
    expect(api.start).toHaveBeenCalledWith(TOKEN);
    expect(JSON.parse(localStorage.getItem(STORED_TRY_KEY)!)).toEqual({ token: TOKEN, code: CODE, madeAt: NOW.toISOString() });
    expect(screen.getByRole('link', { name: 'Deschide încercarea' })).toHaveAttribute('href', `/try/${TOKEN}`);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Se corectează… Durează câteva minute.'));
    expect(button()).toBeDisabled();
  });

  it('names the try after its test file: the form asks for no name', async () => {
    const { api } = await mount();
    button()!.click();
    expect(within(dialog()).queryByRole('textbox')).toBeNull();
    pick(/^Testul/, pdf('Test funcții 9B.pdf'));
    pick(/^Baremul/, pdf('barem.pdf'));
    pick(/^Lucrarea elevului/, photo('p1.jpg'));
    send();
    await waitFor(() => expect(api.create).toHaveBeenCalledWith('turnstile-ok', 'Test funcții 9B'));
  });

  it('shows and hides every Quick Try button of the page together, and each one opens the form', async () => {
    await mount();
    expect(tryButtons()).toHaveLength(3);
    for (const one of tryButtons()) {
      expect(one).toBeVisible();
      one.click();
      expect(dialog().hasAttribute('open')).toBe(true);
      within(dialog()).getByRole('button', { name: 'Închide' }).click();
      expect(dialog().hasAttribute('open')).toBe(false);
    }
  });

  it('turns every Quick Try button off once the day is used', async () => {
    await mount(fakeLandingApi({ dailyLimitReached: true }));
    for (const one of tryButtons()) {
      expect(one).toBeVisible();
      expect(one).toBeDisabled();
    }
  });

  it('hides the card and turns the button off when another tab deletes the try', async () => {
    store();
    await mount(fakeLandingApi());
    expect(screen.getByRole('status')).toBeVisible();
    localStorage.removeItem(STORED_TRY_KEY);
    localStorage.setItem(DELETED_TRY_KEY, NOW.toISOString());
    window.dispatchEvent(new StorageEvent('storage', { key: STORED_TRY_KEY }));
    expect(document.querySelector('[data-try-status]')).not.toBeVisible();
    expect(button()).toBeDisabled();
  });

  it('hides the card and turns the button off when the page is shown again after a delete made on the try page', async () => {
    store();
    await mount(fakeLandingApi());
    expect(screen.getByRole('status')).toBeVisible();
    localStorage.removeItem(STORED_TRY_KEY);
    localStorage.setItem(DELETED_TRY_KEY, NOW.toISOString());
    window.dispatchEvent(pageShow(true));
    expect(document.querySelector('[data-try-status]')).not.toBeVisible();
    expect(button()).toBeDisabled();
    expect(screen.getByText('Ai făcut încercarea de azi. Mâine poți face alta.')).toBeVisible();
  });

  it('lets an administrator make another try on the same day', async () => {
    store();
    await mount(fakeLandingApi({ admin: true }));
    expect(button()).toBeEnabled();
    expect(button()).not.toHaveAttribute('title');
    expect(document.querySelector('[data-try-note]')).not.toBeVisible();
    expect(screen.getByText(/^Gratuit: trimiți lucrarea/)).toBeVisible();
  });

  it("shows the buttons before the API answers, and her try's card before its state is read", async () => {
    store();
    const api = fakeLandingApi();
    api.availability.mockReturnValue(new Promise(() => {}));
    api.getTest.mockReturnValue(new Promise(() => {}));
    document.body.innerHTML = new DOMParser().parseFromString(page, 'text/html').body.innerHTML;
    void initQuickTry(document, { api, storage: localStorage, now: () => NOW, loadTurnstile: fakeTurnstile().load, signal: mounted.signal });
    // Her try of today turns the buttons off at once: they never jump.
    expect(button()).toBeVisible();
    expect(button()).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Se citește încercarea…');
  });

  it("follows the API's answer at once, without waiting for her try's state", async () => {
    store('2026-11-09T08:00:00.000Z');
    const api = fakeLandingApi({ dailyLimitReached: true });
    api.getTest.mockReturnValue(new Promise(() => {}));
    document.body.innerHTML = new DOMParser().parseFromString(page, 'text/html').body.innerHTML;
    void initQuickTry(document, { api, storage: localStorage, now: () => NOW, loadTurnstile: fakeTurnstile().load, signal: mounted.signal });
    expect(button()).toBeEnabled();
    await waitFor(() => expect(button()).toBeDisabled());
    expect(screen.getByText(/Încercările gratuite de azi s-au terminat/)).toBeVisible();
  });

  it('opens the form before the API answers, and loads the check once it does', async () => {
    let answer: (value: QuickTryAvailability) => void = () => {};
    const api = fakeLandingApi();
    api.availability.mockReturnValue(new Promise((done) => (answer = done)));
    const turnstile = fakeTurnstile();
    document.body.innerHTML = new DOMParser().parseFromString(page, 'text/html').body.innerHTML;
    void initQuickTry(document, { api, storage: localStorage, now: () => NOW, loadTurnstile: turnstile.load, isPhone: () => false, watchPhone: () => {}, signal: mounted.signal });
    button()!.click();
    expect(dialog().hasAttribute('open')).toBe(true);
    expect(turnstile.load).not.toHaveBeenCalled();
    answer({ dailyLimitReached: false, admin: false, signedIn: false, siteKey: 'site-key' });
    await waitFor(() => expect(turnstile.load).toHaveBeenCalledWith(document.querySelector('[data-try-turnstile]'), 'site-key'));
  });

  it('turns every Quick Try button off when the API does not answer, and says why', async () => {
    const api = fakeLandingApi();
    api.availability.mockRejectedValue(new Error('offline'));
    await mount(api);
    expect(screen.getByText(/Încercarea gratuită nu este disponibilă acum/)).toBeVisible();
    for (const one of tryButtons()) {
      expect(one).toBeVisible();
      expect(one).toBeDisabled();
    }
  });

  it('keeps the barem one choice: her file, or the one made from the test', async () => {
    await mount();
    button()!.click();
    const robot = within(dialog()).getByLabelText('Nu am barem: îl generez din test') as HTMLInputElement;
    const note = () => within(dialog()).queryByText(/Baremul se face din test în câteva minute/);
    const baremRow = () => within(dialog()).getByLabelText(/^Baremul/).closest<HTMLElement>('[data-try-pick]')!;
    expect(note()).not.toBeVisible();
    pick(/^Baremul/, pdf('barem.pdf'));
    expect(baremRow()).toHaveClass('is-chosen');
    robot.click();
    expect(robot.checked).toBe(true);
    expect(note()).toBeVisible();
    // The choice empties the file she picked.
    expect(baremRow()).not.toHaveClass('is-chosen');
    expect(baremRow()).toHaveTextContent('Încarc baremul');
    // A file picked after it clears the choice.
    pick(/^Baremul/, pdf('alt-barem.pdf'));
    expect(robot.checked).toBe(false);
    expect(note()).not.toBeVisible();
    expect(baremRow()).toHaveTextContent('alt-barem.pdf');
  });

  it('shows each chosen file in its row, and empties the rows once the form is sent', async () => {
    await mount();
    button()!.click();
    const row = (label: RegExp) => within(dialog()).getByLabelText(label).closest<HTMLElement>('[data-try-pick]')!;
    expect(row(/^Testul/)).toHaveTextContent('Alege testul');
    expect(row(/^Testul/)).not.toHaveClass('is-chosen');
    fillForm();
    expect(row(/^Testul/)).toHaveTextContent('test.pdf');
    expect(row(/^Testul/)).toHaveTextContent('Schimbă');
    expect(row(/^Testul/)).toHaveClass('is-chosen');
    expect(row(/^Lucrarea elevului/)).toHaveTextContent('2 pagini');
    expect(row(/^Lucrarea elevului/)).toHaveTextContent('p1.jpg, p2.jpg');
    send();
    await waitFor(() => expect(dialog().hasAttribute('open')).toBe(false));
    expect(row(/^Testul/)).toHaveTextContent('Alege testul');
    expect(row(/^Lucrarea elevului/)).not.toHaveClass('is-chosen');
  });

  it('"Cu telefonul" marks the row as chosen and "Schimbă" puts it back', async () => {
    await mount();
    button()!.click();
    const pages = pagesRow();
    within(pages).getByRole('button', { name: 'Cu telefonul' }).click();
    expect(pages).toHaveClass('is-chosen', 'is-phone');
    expect(pages).toHaveTextContent('Faci pozele cu telefonul');
    expect(pages).toHaveTextContent('Codul QR apare după ce apeși Trimite');
    expect(within(pages).queryByRole('button', { name: 'Cu telefonul' })).toBeNull();
    expect(within(pages).getByRole('button', { name: 'Schimbă' })).toHaveFocus();
    within(pages).getByRole('button', { name: 'Schimbă' }).click();
    expect(pages).not.toHaveClass('is-chosen');
    expect(pages).not.toHaveClass('is-phone');
    expect(pages).toHaveTextContent('Alege fișierele');
    expect(within(pages).getByRole('button', { name: 'Cu telefonul' })).toBeVisible();
  });

  it('picking files after choosing the phone leaves the phone choice', async () => {
    await mount();
    button()!.click();
    const pages = pagesRow();
    within(pages).getByRole('button', { name: 'Cu telefonul' }).click();
    pick(/^Lucrarea elevului/, photo('p1.jpg'), photo('p2.jpg'));
    expect(pages).not.toHaveClass('is-phone');
    expect(pages).toHaveTextContent('2 pagini');
  });

  it('on a phone, the button says "Fă poze" and the row says the camera opens after the send', async () => {
    await mount(undefined, undefined, { isPhone: () => true });
    button()!.click();
    const pages = pagesRow();
    expect(within(pages).queryByRole('button', { name: 'Cu telefonul' })).toBeNull();
    within(pages).getByRole('button', { name: 'Fă poze' }).click();
    expect(pages).toHaveTextContent('Faci pozele cu acest telefon');
    expect(pages).toHaveTextContent('Camera se deschide după ce apeși Trimite');
  });

  it("on a phone, a send with the photos opens the try's phone page in this tab", async () => {
    const go = vi.fn();
    const { api } = await mount(undefined, undefined, { isPhone: () => true, go });
    button()!.click();
    pick(/^Testul/, pdf('test.pdf'));
    pick(/^Baremul/, pdf('barem.pdf'));
    within(pagesRow()).getByRole('button', { name: 'Fă poze' }).click();
    send();
    await waitFor(() => expect(go).toHaveBeenCalledWith(`/try/${TOKEN}/phone?here=1`));
    expect(api.addPage).not.toHaveBeenCalled();
    expect(dialog().querySelector('[data-try-phone]')).not.toBeVisible();
    expect(JSON.parse(localStorage.getItem(STORED_TRY_KEY)!)).toMatchObject({ token: TOKEN });
  });

  it('closes the form and hides the try button before it opens the phone page, so Back finds the page as it should be', async () => {
    const atGo: { open: boolean; button: boolean }[] = [];
    const go = vi.fn(() => {
      atGo.push({ open: dialog().hasAttribute('open'), button: (button() as HTMLButtonElement | null)?.disabled === false });
    });
    const { api } = await mount(undefined, undefined, { isPhone: () => true, go });
    button()!.click();
    pick(/^Testul/, pdf('test.pdf'));
    pick(/^Baremul/, pdf('barem.pdf'));
    within(pagesRow()).getByRole('button', { name: 'Fă poze' }).click();
    const reads = api.getTest.mock.calls.length;
    send();
    await waitFor(() => expect(go).toHaveBeenCalled());
    expect(atGo).toEqual([{ open: false, button: false }]);
    // The try is read when the page shows again, not just before it leaves.
    expect(api.getTest).toHaveBeenCalledTimes(reads);
  });

  it('reads the try again when the browser shows the page again from its cache', async () => {
    store();
    const api = fakeLandingApi();
    // A graded try is read once: no timer reads it again.
    api.getTest.mockResolvedValue(graded);
    await mount(api);
    await waitFor(() => expect(api.getTest).toHaveBeenCalledTimes(1));
    window.dispatchEvent(pageShow(false));
    expect(api.getTest).toHaveBeenCalledTimes(1);
    window.dispatchEvent(pageShow(true));
    await waitFor(() => expect(api.getTest).toHaveBeenCalledTimes(2));
  });

  it('on a phone, a send with no barem asks the robot for it, then opens the phone page', async () => {
    const go = vi.fn();
    const { api } = await mount(undefined, undefined, { isPhone: () => true, go });
    button()!.click();
    pick(/^Testul/, pdf('test.pdf'));
    within(dialog()).getByLabelText('Nu am barem: îl generez din test').click();
    within(pagesRow()).getByRole('button', { name: 'Fă poze' }).click();
    send();
    await waitFor(() => expect(go).toHaveBeenCalledWith(`/try/${TOKEN}/phone?here=1`));
    expect(api.generateBarem).toHaveBeenCalledWith(TOKEN, CODE);
  });

  it('on a phone, a send that broke half-way stays in the form with the link, and opens no phone page', async () => {
    const go = vi.fn();
    const api = fakeLandingApi();
    api.uploadTestFile.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new ApiError(0, 'network', 'Nu mă pot conecta la server.'));
    await mount(api, undefined, { isPhone: () => true, go });
    button()!.click();
    pick(/^Testul/, pdf('test.pdf'));
    pick(/^Baremul/, pdf('barem.pdf'));
    within(pagesRow()).getByRole('button', { name: 'Fă poze' }).click();
    send();
    await waitFor(() => expect(within(dialog()).getByRole('alert')).toHaveTextContent('Nu mă pot conecta la server.'));
    expect(within(dialog()).getByRole('link', { name: 'Deschide încercarea' })).toHaveAttribute('href', `/try/${TOKEN}`);
    expect(go).not.toHaveBeenCalled();
  });

  it('shows the pages button only once the script knows the device, and changes it when the phone turns', async () => {
    const raw = new DOMParser().parseFromString(page, 'text/html');
    expect(raw.querySelector('[data-try-phone-pick]')!.hasAttribute('hidden')).toBe(true);
    let phone = false;
    let turned = () => {};
    await mount(undefined, undefined, { isPhone: () => phone, watchPhone: (onChange) => (turned = onChange) });
    button()!.click();
    expect(within(pagesRow()).getByRole('button', { name: 'Cu telefonul' })).toBeVisible();
    phone = true;
    turned();
    expect(within(pagesRow()).getByRole('button', { name: 'Fă poze' })).toBeVisible();
  });

  it('counts a phone held sideways as a phone', () => {
    expect(PHONE_MEDIA).toBe('(pointer: coarse) and (max-width: 767.98px), (pointer: coarse) and (max-height: 500px)');
  });

  it('choosing the phone forgets picked files', async () => {
    const { api } = await mount();
    button()!.click();
    fillForm();
    within(pagesRow()).getByRole('button', { name: 'Cu telefonul' }).click();
    expect((within(dialog()).getByLabelText(/^Lucrarea elevului/) as HTMLInputElement).value).toBe('');
    send();
    await waitFor(() => expect(api.uploadTestFile).toHaveBeenCalledTimes(2));
    expect(api.addPage).not.toHaveBeenCalled();
  });

  it('after a send with the phone, the window stays open on the code', async () => {
    await mount();
    button()!.click();
    sendByPhone();
    const phone = dialog().querySelector<HTMLElement>('[data-try-phone]')!;
    await waitFor(() => expect(phone).toBeVisible());
    expect(dialog().hasAttribute('open')).toBe(true);
    expect(within(phone).getByRole('heading', { name: 'Fă pozele cu telefonul' })).toHaveFocus();
    expect(dialog().querySelector('[data-try-form]')).not.toBeVisible();
  });

  it('Esc closes the code window, and the card shows the try', async () => {
    const { api } = await mount();
    api.getTest.mockResolvedValue(tryTest({ status: 'open', files }));
    button()!.click();
    sendByPhone();
    const phone = dialog().querySelector<HTMLElement>('[data-try-phone]')!;
    await waitFor(() => expect(phone).toBeVisible());
    const cancel = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(false);
    // The browser closes the dialog after a cancel that is not prevented.
    dialog().removeAttribute('open');
    dialog().dispatchEvent(new Event('close'));
    await waitFor(() => expect(screen.getByRole('status')).toBeVisible());
    expect(screen.getByRole('link', { name: 'Deschide încercarea' })).toHaveAttribute('href', `/try/${TOKEN}`);
    expect(phone).not.toBeVisible();
    const reads = api.listPages.mock.calls.length;
    await new Promise((done) => setTimeout(done, 30));
    expect(api.listPages).toHaveBeenCalledTimes(reads);
  });

  it('after "Pornește corectarea" the window closes and the card follows the grading', async () => {
    const { api } = await mount();
    api.listPages.mockResolvedValue([{ id: 1, name: 'p1.jpg', contentType: 'image/jpeg', size: 10, position: 1 }]);
    button()!.click();
    sendByPhone();
    const start = await within(dialog()).findByRole('button', { name: 'Pornește corectarea' });
    await waitFor(() => expect(start).toBeEnabled());
    start.click();
    await waitFor(() => expect(dialog().hasAttribute('open')).toBe(false));
    expect(api.start).toHaveBeenCalledWith(TOKEN);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Se corectează… Durează câteva minute.'));
  });

  it('sends with the phone and keeps the try on the device', async () => {
    const { api } = await mount();
    button()!.click();
    pick(/^Testul/, pdf('test.pdf'));
    pick(/^Baremul/, pdf('barem.pdf'));
    within(pagesRow()).getByRole('button', { name: 'Cu telefonul' }).click();
    send();
    await waitFor(() => expect(api.uploadTestFile).toHaveBeenCalledTimes(2));
    expect(JSON.parse(localStorage.getItem(STORED_TRY_KEY)!)).toEqual({ token: TOKEN, code: CODE, madeAt: NOW.toISOString() });
    expect(api.addPage).not.toHaveBeenCalled();
    expect(api.start).not.toHaveBeenCalled();
  });

  it("moves the focus to the try's link once the form is sent", async () => {
    await mount();
    button()!.click();
    fillForm();
    send();
    await waitFor(() => expect(dialog().hasAttribute('open')).toBe(false));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Deschide încercarea' })));
  });

  it('keeps the form open while it sends, also on Esc or the back button', async () => {
    const api = fakeLandingApi();
    let finish = () => {};
    api.addPage.mockImplementationOnce(() => new Promise<void>((done) => (finish = done)));
    await mount(api);
    button()!.click();
    fillForm();
    send();
    await waitFor(() => expect(api.addPage).toHaveBeenCalled());
    const cancel = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    finish();
    await waitFor(() => expect(dialog().hasAttribute('open')).toBe(false));
    const later = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });

  it('asks the robot for the barem when she has none', async () => {
    const { api } = await mount();
    button()!.click();
    pick(/^Testul/, pdf('test.pdf'));
    within(dialog()).getByLabelText('Nu am barem: îl generez din test').click();
    pick(/^Lucrarea elevului/, photo('p1.jpg'));
    send();
    await waitFor(() => expect(dialog().hasAttribute('open')).toBe(false));
    expect(api.generateBarem).toHaveBeenCalledWith(TOKEN, CODE);
    expect(api.start).not.toHaveBeenCalled();
  });

  it('says what is missing, and sends nothing', async () => {
    const { api } = await mount();
    button()!.click();
    send();
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Alege fișierul testului.');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('asks for the Turnstile check before it sends', async () => {
    const { api } = await mount(fakeLandingApi(), fakeTurnstile(null));
    button()!.click();
    fillForm();
    send();
    await waitFor(() =>
      expect(within(dialog()).getByRole('alert')).toHaveTextContent('Așteaptă să se termine verificarea de mai jos, apoi trimite din nou.'),
    );
    expect(api.create).not.toHaveBeenCalled();
  });

  it("shows the server's refusal in the form, and a new check for the next send", async () => {
    const api = fakeLandingApi();
    api.create.mockRejectedValueOnce(new ApiError(429, 'quick_try_ip_limit', 'Limita de încercări gratuite pentru azi a fost atinsă.'));
    const { turnstile } = await mount(api);
    button()!.click();
    fillForm();
    send();
    await waitFor(() => expect(within(dialog()).getByRole('alert')).toHaveTextContent('Limita de încercări gratuite pentru azi a fost atinsă.'));
    expect(turnstile.widget.reset).toHaveBeenCalled();
    expect(dialog().hasAttribute('open')).toBe(true);
    expect(within(dialog()).getByRole('button', { name: 'Trimite' })).toBeEnabled();
    expect(localStorage.getItem(STORED_TRY_KEY)).toBeNull();
  });

  it('keeps the link of a try whose send broke half-way', async () => {
    const api = fakeLandingApi();
    api.addPage.mockRejectedValueOnce(new ApiError(0, 'network', 'Nu mă pot conecta la server.'));
    await mount(api);
    button()!.click();
    fillForm();
    send();
    await waitFor(() => expect(within(dialog()).getByRole('alert')).toHaveTextContent('Nu mă pot conecta la server.'));
    expect(within(dialog()).getByRole('link', { name: 'Deschide încercarea' })).toHaveAttribute('href', `/try/${TOKEN}`);
    expect(localStorage.getItem(STORED_TRY_KEY)).not.toBeNull();
  });

  it('makes no second try after a send broke half-way: the try page takes what is missing', async () => {
    const api = fakeLandingApi();
    api.addPage.mockRejectedValueOnce(new ApiError(0, 'network', 'Nu mă pot conecta la server.'));
    await mount(api);
    button()!.click();
    fillForm();
    send();
    await waitFor(() => expect(within(dialog()).getByRole('alert')).toHaveTextContent('Nu mă pot conecta la server.'));
    expect(within(dialog()).getByRole('button', { name: 'Trimite' })).toBeDisabled();
    send();
    await new Promise((done) => setTimeout(done, 10));
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it('lets an administrator send without Turnstile and past the limits', async () => {
    store();
    const turnstile = fakeTurnstile();
    const { api } = await mount(fakeLandingApi({ admin: true, dailyLimitReached: true, siteKey: null }), turnstile);
    button()!.click();
    fillForm();
    send();
    await waitFor(() => expect(api.create).toHaveBeenCalledWith(undefined, 'test'));
    expect(turnstile.load).not.toHaveBeenCalled();
  });

  it('says when the Turnstile check cannot load, and sends nothing', async () => {
    const turnstile = fakeTurnstile();
    turnstile.load.mockRejectedValueOnce(new Error('blocked'));
    const { api } = await mount(fakeLandingApi(), turnstile);
    button()!.click();
    await waitFor(() =>
      expect(within(dialog()).getByRole('alert')).toHaveTextContent('Verificarea nu s-a putut încărca. Reîncarcă pagina și încearcă din nou.'),
    );
    fillForm();
    send();
    await new Promise((done) => setTimeout(done, 10));
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Verificarea nu s-a putut încărca. Reîncarcă pagina și încearcă din nou.');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('shows a visitor the login and the new-account link, not the account', async () => {
    await mount();
    expect(screen.getAllByRole('link', { name: 'Intră în cont' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Cere un cont de profesor' }).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('link', { name: 'Contul tău' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Deschide contul tău' })).toBeNull();
  });

  it('shows a logged-in teacher the account instead of the login, and keeps the try', async () => {
    await mount(fakeLandingApi({ signedIn: true }));
    expect(screen.queryByRole('link', { name: 'Intră în cont' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Cere un cont de profesor' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Contul tău' })).toHaveAttribute('href', '/teacher/');
    expect(screen.getByRole('link', { name: 'Deschide contul tău' })).toHaveAttribute('href', '/teacher/');
    expect(button()).not.toBeNull();
  });

  it('keeps the login when the page cannot ask the server', async () => {
    const api = fakeLandingApi();
    api.availability.mockRejectedValue(new ApiError(0, 'network', 'Nu mă pot conecta la server.'));
    await mount(api);
    expect(screen.getAllByRole('link', { name: 'Intră în cont' })).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'Contul tău' })).toBeNull();
  });

  it('asks the sign-in alone when the availability fails, and not when it answers', async () => {
    const failing = fakeLandingApi();
    failing.availability.mockRejectedValue(new ApiError(0, 'network', 'Nu mă pot conecta la server.'));
    const checkAccount = vi.fn(async () => {});
    await mount(failing, fakeTurnstile(), { checkAccount });
    expect(checkAccount).toHaveBeenCalledWith(document);
    checkAccount.mockClear();
    await mount(fakeLandingApi({ signedIn: true }), fakeTurnstile(), { checkAccount });
    expect(checkAccount).not.toHaveBeenCalled();
  });

  it('turns the button off when the page cannot ask the server, and still follows her try', async () => {
    store('2026-11-09T08:00:00.000Z');
    const api = fakeLandingApi();
    api.availability.mockRejectedValue(new ApiError(0, 'network', 'Nu mă pot conecta la server.'));
    await mount(api);
    expect(button()).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Se corectează… Durează câteva minute.');
    expect(screen.getByRole('link', { name: 'Deschide încercarea' })).toHaveAttribute('href', `/try/${TOKEN}`);
  });

  it('closes the form with Renunță', async () => {
    await mount();
    button()!.click();
    within(dialog()).getByRole('button', { name: 'Renunță' }).click();
    expect(dialog().hasAttribute('open')).toBe(false);
  });

  it("lets the page's security policy load Turnstile and the visit counter, and nothing else new", () => {
    const policy = headers.split('\n').find((line) => line.trim().startsWith('Content-Security-Policy:'))!;
    expect(policy).toContain("script-src 'self' https://challenges.cloudflare.com https://stats.mqgrader.ro;");
    expect(policy).toContain("frame-src 'self' https://challenges.cloudflare.com;");
    expect(policy).toContain("connect-src 'self' https://stats.mqgrader.ro;");
  });
});

describe('the count of a Quick Try that was sent', () => {
  afterEach(() => {
    delete window.rybbit;
  });

  it('counts a try once its files are sent', async () => {
    const event = vi.fn();
    window.rybbit = { event };
    await mount();
    button()!.click();
    fillForm();
    send();
    await waitFor(() => expect(dialog().hasAttribute('open')).toBe(false));
    expect(event.mock.calls).toEqual([['quick-try-sent']]);
  });

  it('counts no try the server refused, and none that broke half-way', async () => {
    const event = vi.fn();
    window.rybbit = { event };
    const api = fakeLandingApi();
    api.create.mockRejectedValueOnce(new ApiError(429, 'quick_try_ip_limit', 'Limita de încercări gratuite pentru azi a fost atinsă.'));
    api.addPage.mockRejectedValueOnce(new ApiError(0, 'network', 'Nu mă pot conecta la server.'));
    await mount(api);
    button()!.click();
    fillForm();
    send();
    await waitFor(() => expect(within(dialog()).getByRole('alert')).toHaveTextContent('Limita de încercări'));
    send();
    await waitFor(() => expect(within(dialog()).getByRole('alert')).toHaveTextContent('Nu mă pot conecta la server.'));
    expect(event).not.toHaveBeenCalled();
  });

  it('on a phone, counts the try before it leaves for the phone page', async () => {
    const order: string[] = [];
    window.rybbit = { event: (name: string) => order.push(name) };
    await mount(undefined, undefined, { isPhone: () => true, go: (path) => order.push(path) });
    button()!.click();
    pick(/^Testul/, pdf('test.pdf'));
    pick(/^Baremul/, pdf('barem.pdf'));
    within(pagesRow()).getByRole('button', { name: 'Fă poze' }).click();
    send();
    await waitFor(() => expect(order).toEqual(['quick-try-sent', `/try/${TOKEN}/phone?here=1`]));
  });
});
