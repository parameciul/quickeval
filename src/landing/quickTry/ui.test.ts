import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import page from '../../../index.html?raw';
import headers from '../../../public/_headers?raw';
import type { QuickTryAvailability } from '../../../shared/api.ts';
import { PDF_TYPE } from '../../../shared/files.ts';
import { tryTest } from '../../test/fakeTryApi.tsx';
import { ApiError } from '../../ui/ApiError.ts';
import type { LandingApi } from './api.ts';
import { STORED_TRY_KEY } from './storage.ts';
import { initQuickTry, type TurnstileWidget } from './ui.ts';

const TOKEN = 'abcdefghijkmnopqrstuvwxyz2345672';
const CODE = 'PROBA-26T1';
const NOW = new Date('2026-11-10T08:00:00.000Z');
const files = { test: { name: 'test.pdf', type: PDF_TYPE }, barem: { name: 'barem.pdf', type: PDF_TYPE } };
const grading = tryTest({ status: 'evaluating', files }, { status: 'submitted' });
const graded = tryTest({ status: 'done', files }, { status: 'graded' });

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

function fakeLandingApi(availability: Partial<QuickTryAvailability> = {}) {
  return {
    availability: vi.fn(async () => ({ dailyLimitReached: false, admin: false, siteKey: 'site-key', ...availability })),
    create: vi.fn(async (_turnstileToken?: string, _title?: string) => ({ token: TOKEN, code: CODE })),
    uploadTestFile: vi.fn(async () => {}),
    generateBarem: vi.fn(async () => {}),
    addPage: vi.fn(async () => {}),
    start: vi.fn(async () => {}),
    getTest: vi.fn(async () => grading),
  } satisfies LandingApi;
}

function fakeTurnstile(answer: string | null = 'turnstile-ok') {
  const widget: TurnstileWidget = { token: vi.fn(() => answer ?? undefined), reset: vi.fn() };
  return { load: vi.fn(async (_container: HTMLElement, _siteKey: string) => widget), widget };
}

async function mount(api = fakeLandingApi(), turnstile = fakeTurnstile()) {
  document.body.innerHTML = new DOMParser().parseFromString(page, 'text/html').body.innerHTML;
  await initQuickTry(document, { api, storage: localStorage, now: () => NOW, loadTurnstile: turnstile.load, refreshMs: 5 });
  return { api, turnstile };
}

const button = () => screen.queryByRole('button', { name: 'Încearcă acum, fără cont' });
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

  it('shows no button while the Turnstile key is not set', async () => {
    await mount(fakeLandingApi({ siteKey: null }));
    expect(button()).toBeNull();
  });

  it("says when the day's free tries are all used", async () => {
    await mount(fakeLandingApi({ dailyLimitReached: true }));
    expect(button()).toBeNull();
    expect(screen.getByText(/Încercările gratuite de azi s-au terminat/)).toHaveTextContent(
      'Încercările gratuite de azi s-au terminat. Încearcă din nou mâine sau creează un cont: corectezi gratuit un test pentru toată clasa.',
    );
  });

  it("keeps one try per device per day, and shows today's try with its link", async () => {
    store();
    const { api } = await mount();
    expect(button()).toBeNull();
    expect(screen.getByText('Ai făcut încercarea de azi. Mâine poți face alta.')).toBeVisible();
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
    expect(button()).toBeNull();
  });

  it('sends the name she writes for the try', async () => {
    const { api } = await mount();
    button()!.click();
    const name = within(dialog()).getByRole('textbox', { name: /Numele testului/ }) as HTMLInputElement;
    name.value = 'Test funcții 9B';
    fillForm();
    send();
    await waitFor(() => expect(api.create).toHaveBeenCalledWith('turnstile-ok', 'Test funcții 9B'));
  });

  it('shows each chosen file in its row, and empties the rows once the form is sent', async () => {
    await mount();
    button()!.click();
    const row = (label: RegExp) => within(dialog()).getByLabelText(label).closest('label')!;
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
    within(dialog()).getByLabelText('Nu am barem: fă-l din test').click();
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

  it('shows no button when the page cannot ask the server, and still follows her try', async () => {
    store('2026-11-09T08:00:00.000Z');
    const api = fakeLandingApi();
    api.availability.mockRejectedValue(new ApiError(0, 'network', 'Nu mă pot conecta la server.'));
    await mount(api);
    expect(button()).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Se corectează… Durează câteva minute.');
    expect(screen.getByRole('link', { name: 'Deschide încercarea' })).toHaveAttribute('href', `/try/${TOKEN}`);
  });

  it('closes the form with Renunță', async () => {
    await mount();
    button()!.click();
    within(dialog()).getByRole('button', { name: 'Renunță' }).click();
    expect(dialog().hasAttribute('open')).toBe(false);
  });

  it("lets the page's security policy load Turnstile, and nothing else new", () => {
    const policy = headers.split('\n').find((line) => line.trim().startsWith('Content-Security-Policy:'))!;
    expect(policy).toContain("script-src 'self' https://challenges.cloudflare.com;");
    expect(policy).toContain('frame-src https://challenges.cloudflare.com;');
    expect(policy).toContain("connect-src 'self';");
  });
});
