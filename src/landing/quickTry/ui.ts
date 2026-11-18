import type { QuickTryAvailability } from '../../../shared/api.ts';
import { PHONE_MEDIA, QUICK_TRY_DAYS, quickTryPhonePath } from '../../../shared/quickTry.ts';
import { ApiError, messageOf } from '../../ui/ApiError.ts';
import { phaseOf, scoreOf, type TryPhase } from '../../try/phase.ts';
import { countLabel, formatDate, formatDateTime, formatFileSize } from '../../ui/format.ts';
import { countVisitEvent } from '../../ui/visits.ts';
import type { LandingApi } from './api.ts';
import { openPhoneStep, type PhoneStep } from './phone.ts';
import { drawQr } from './qr.ts';
import { formProblem, sendTry, type TryForm } from './send.ts';
import { canStart, statusOf } from './status.ts';
import { forgetStoredTry, readStoredTry, saveStoredTry, type StoredTry } from './storage.ts';

// The Turnstile check in the form: its answer once the visitor passed it,
// and a new check (an answer is good for one send).
export interface TurnstileWidget {
  token(): string | undefined;
  reset(): void;
}

export type LoadTurnstile = (container: HTMLElement, siteKey: string) => Promise<TurnstileWidget>;

export interface QuickTryDeps {
  api: LandingApi;
  storage: Storage;
  now: () => Date;
  loadTurnstile: LoadTurnstile;
  // How often the status line reads the try again while the robot works.
  refreshMs?: number;
  // The QR window: the site's address, and how its code is drawn.
  origin?: string;
  drawQr?: typeof drawQr;
  // A phone takes the photos itself: after the send it opens the try's phone
  // page in its own tab, through `go`, in place of the QR window. `watchPhone`
  // calls back when that may change (the phone turns).
  isPhone?: () => boolean;
  go?: (path: string) => void;
  watchPhone?: (onChange: () => void) => void;
  // Ends the page's own listeners (tests mount the page again and again).
  signal?: AbortSignal;
}

const onAPhone = () => window.matchMedia?.(PHONE_MEDIA).matches ?? false;

const FULL_TEXT =
  'Încercările gratuite de azi s-au terminat. Încearcă din nou mâine sau creează un cont: corectezi gratuit un test pentru toată clasa.';
const USED_TEXT = 'Ai făcut încercarea de azi. Mâine poți face alta.';
const NO_CHECK_TEXT = 'Verificarea nu s-a putut încărca. Reîncarcă pagina și încearcă din nou.';

const tryPath = (token: string) => `/try/${token}`;
const DAY_MS = 24 * 60 * 60 * 1000;

// A logged-in teacher sees the link to the account where a visitor sees the
// login and the new-account link. The page is served signed out, so a crawler
// and a browser without the API's answer keep the login.
export function showAccount(root: ParentNode, signedIn: boolean): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-guest]')) el.hidden = signedIn;
  for (const el of root.querySelectorAll<HTMLElement>('[data-member]')) el.hidden = !signedIn;
}

function openDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function show(el: HTMLElement, text?: string): void {
  if (text !== undefined) el.textContent = text;
  el.hidden = false;
}

// A file row of the form: what to choose (its data-empty and data-hint), or
// the chosen file with its size, or the count and names of the chosen pages.
function showPick(input: HTMLInputElement, chosen: File[]): void {
  const row = input.closest<HTMLElement>('[data-try-pick]');
  if (!row) return;
  const name = row.querySelector<HTMLElement>('[data-try-pick-name]')!;
  const hint = row.querySelector<HTMLElement>('[data-try-pick-hint]')!;
  const action = row.querySelector<HTMLElement>('[data-try-pick-action]')!;
  row.classList.remove('is-phone');
  row.classList.toggle('is-chosen', chosen.length > 0);
  if (chosen.length === 0) {
    name.textContent = row.dataset.empty ?? '';
    hint.textContent = row.dataset.hint ?? '';
    action.textContent = input.multiple ? 'Alege fișierele' : 'Alege fișierul';
    return;
  }
  name.textContent = input.multiple ? countLabel(chosen.length, 'pagină', 'pagini') : chosen[0]!.name;
  hint.textContent = input.multiple ? chosen.map((file) => file.name).join(', ') : formatFileSize(chosen[0]!.size);
  action.textContent = 'Schimbă';
}

// The landing page's Quick Try (spec §3.1, §3.2): the button, the form in a
// window over the page, and the status line of the visitor's try with its
// link. The page has no React: this works on the page's own elements.
export async function initQuickTry(root: Document, deps: QuickTryDeps): Promise<void> {
  const box = root.querySelector<HTMLElement>('[data-try]');
  const openButton = root.querySelector<HTMLButtonElement>('[data-try-open]');
  const dialog = root.querySelector<HTMLDialogElement>('[data-try-dialog]');
  const form = root.querySelector<HTMLFormElement>('[data-try-form]');
  if (!box || !openButton || !dialog || !form) return;
  const note = box.querySelector<HTMLElement>('[data-try-note]')!;
  const hint = root.querySelector<HTMLElement>('[data-try-hint]');
  const status = box.querySelector<HTMLElement>('[data-try-status]')!;
  const statusTitle = box.querySelector<HTMLElement>('[data-try-title]')!;
  const statusChip = box.querySelector<HTMLElement>('[data-try-chip]')!;
  const statusMeta = box.querySelector<HTMLElement>('[data-try-meta]')!;
  const statusText = box.querySelector<HTMLElement>('[data-try-status-text]')!;
  const statusScore = box.querySelector<HTMLElement>('[data-try-score]')!;
  const statusGrade = box.querySelector<HTMLElement>('[data-try-grade]')!;
  const statusPoints = box.querySelector<HTMLElement>('[data-try-points]')!;
  const statusLink = box.querySelector<HTMLAnchorElement>('[data-try-link]')!;
  const error = form.querySelector<HTMLElement>('[data-try-error]')!;
  const recover = form.querySelector<HTMLElement>('[data-try-recover]')!;
  const recoverLink = form.querySelector<HTMLAnchorElement>('[data-try-recover-link]')!;
  const progress = form.querySelector<HTMLElement>('[data-try-progress]')!;
  const sendButton = form.querySelector<HTMLButtonElement>('[data-try-send]')!;
  const closeButton = form.querySelector<HTMLButtonElement>('[data-try-close]')!;
  const turnstileBox = form.querySelector<HTMLElement>('[data-try-turnstile]')!;
  const pagesInput = form.elements.namedItem('pages') as HTMLInputElement;
  const phonePick = form.querySelector<HTMLButtonElement>('[data-try-phone-pick]')!;
  const phoneUndo = form.querySelector<HTMLButtonElement>('[data-try-phone-undo]')!;
  const refreshMs = deps.refreshMs ?? 10_000;

  let availability: QuickTryAvailability | null = null;
  let stored = readStoredTry(deps.storage, deps.now());
  let phase: TryPhase | null = null;
  let widget: Promise<TurnstileWidget> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sending = false;
  // "Cu telefonul": the pages come from the phone after the send.
  let byPhone = false;
  // The QR window, while it shows.
  let phoneStep: PhoneStep | null = null;
  // On a phone: "Fă poze" and its own camera, in place of the QR code.
  let here = false;

  // The button, or the line that says why there is none.
  function refreshButton(): void {
    const answer = availability ? canStart(availability, stored, phase, deps.now()) : 'off';
    openButton!.hidden = answer !== 'yes';
    if (hint) hint.hidden = openButton!.hidden;
    note.hidden = true;
    if (answer === 'used') show(note, USED_TEXT);
    if (answer === 'full') show(note, FULL_TEXT);
    box!.hidden = note.hidden && status.hidden;
  }

  // Reads the stored try and shows where it stands; again and again while the
  // robot works. A link that no longer works (deleted or expired) is forgotten.
  async function follow(current: StoredTry): Promise<void> {
    if (timer) clearTimeout(timer);
    statusLink.href = tryPath(current.token);
    const expires = new Date(Date.parse(current.madeAt) + QUICK_TRY_DAYS * DAY_MS).toISOString();
    statusMeta.textContent = `Trimisă ${formatDateTime(current.madeAt)} · Linkul merge până pe ${formatDate(expires)}`;
    try {
      const detail = await deps.api.getTest(current.token, current.code);
      if (stored !== current) return;
      const line = statusOf(detail);
      const score = scoreOf(detail);
      phase = phaseOf(detail);
      show(status);
      statusTitle.textContent = detail.test.title;
      statusChip.textContent = line.label;
      statusChip.className = `try-chip is-${line.tone}`;
      statusText.textContent = line.text;
      statusScore.hidden = score === null;
      statusGrade.textContent = score?.grade ?? '';
      statusPoints.textContent = score?.points ?? '';
      statusLink.classList.toggle('btn-primary', !line.working);
      if (line.working) timer = setTimeout(() => void follow(current), refreshMs);
    } catch (err) {
      if (stored !== current) return;
      if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
        stored = null;
        phase = null;
        status.hidden = true;
        forgetStoredTry(deps.storage);
      } else {
        show(status);
        statusChip.textContent = '';
        statusChip.className = 'try-chip';
        statusText.textContent = 'Nu am putut citi încercarea acum.';
      }
    }
    refreshButton();
  }

  function formValues(): TryForm {
    const files = (name: string) => Array.from((form!.elements.namedItem(name) as HTMLInputElement).files ?? []);
    return {
      title: (form!.elements.namedItem('title') as HTMLInputElement).value,
      test: files('test')[0] ?? null,
      barem: files('barem')[0] ?? null,
      robotBarem: (form!.elements.namedItem('robotBarem') as HTMLInputElement).checked,
      pages: byPhone ? [] : files('pages'),
      byPhone,
    };
  }

  function sayError(text: string): void {
    show(error, text);
  }

  openButton.addEventListener('click', () => {
    error.hidden = true;
    recover.hidden = true;
    sendButton.disabled = false;
    openDialog(dialog);
    if (availability && !availability.admin && availability.siteKey && !widget) {
      widget = deps.loadTurnstile(turnstileBox, availability.siteKey);
      widget.catch(() => {
        widget = null;
        sayError(NO_CHECK_TEXT);
      });
    }
  });

  closeButton.addEventListener('click', () => closeDialog(dialog));

  // The pages row's chosen state for the phone: its name and hint, and
  // "Schimbă" in place of the two buttons. Leaving it shows the picked files.
  function choosePhone(on: boolean): void {
    byPhone = on;
    phonePick.hidden = on;
    phoneUndo.hidden = !on;
    if (!on) return showPick(pagesInput, Array.from(pagesInput.files ?? []));
    pagesInput.value = '';
    const row = pagesInput.closest<HTMLElement>('[data-try-pick]')!;
    row.classList.add('is-chosen', 'is-phone');
    row.querySelector<HTMLElement>('[data-try-pick-name]')!.textContent = here ? 'Faci pozele cu acest telefon' : 'Faci pozele cu telefonul';
    row.querySelector<HTMLElement>('[data-try-pick-hint]')!.textContent = here ? 'Camera se deschide după ce apeși Trimite' : 'Codul QR apare după ce apeși Trimite';
  }

  // The pages row's phone button, for this device. The markup keeps it hidden
  // so a phone never shows "Cu telefonul" first.
  function applyDevice(): void {
    here = (deps.isPhone ?? onAPhone)();
    phonePick.classList.toggle('is-here', here);
    phonePick.querySelector<HTMLElement>('[data-try-phone-pick-text]')!.textContent = here ? 'Fă poze' : 'Cu telefonul';
    if (byPhone) choosePhone(true);
    else phonePick.hidden = false;
  }
  applyDevice();
  (deps.watchPhone ?? ((onChange) => window.matchMedia?.(PHONE_MEDIA).addEventListener?.('change', onChange, { signal: deps.signal })))(applyDevice);

  phonePick.addEventListener('click', () => {
    choosePhone(true);
    // The button hides: the focus goes to its "Schimbă".
    phoneUndo.focus();
  });
  phoneUndo.addEventListener('click', () => {
    choosePhone(false);
    phonePick.focus();
  });

  const pickInputs = Array.from(form.querySelectorAll<HTMLInputElement>('[data-try-pick] input[type="file"]'));
  for (const input of pickInputs) {
    input.addEventListener('change', () => {
      // Picking files leaves the phone choice.
      if (input === pagesInput && byPhone) choosePhone(false);
      showPick(input, Array.from(input.files ?? []));
    });
  }
  // Esc and a phone's back button close a dialog: not while it sends, so the
  // form stays to show how the send ended.
  dialog.addEventListener('cancel', (event) => {
    if (sending || phoneStep?.busy()) event.preventDefault();
  });

  // The QR window ends (Închide, Esc, the start): the dialog closes and the
  // card follows the try, as after a send.
  function endPhoneStep(): void {
    if (!phoneStep || !stored) return;
    phoneStep.close();
    phoneStep = null;
    closeDialog(dialog!);
    void follow(stored).then(() => statusLink.focus());
  }
  dialog.addEventListener('close', endPhoneStep);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submit();
  });

  async function submit(): Promise<void> {
    error.hidden = true;
    recover.hidden = true;
    const values = formValues();
    const problem = formProblem(values);
    if (problem) return sayError(problem);
    const admin = availability?.admin ?? false;
    let check: TurnstileWidget | null = null;
    let answer: string | undefined;
    if (!admin) {
      check = widget ? await widget.catch(() => null) : null;
      if (!check) return sayError(NO_CHECK_TEXT);
      answer = check.token();
      if (!answer) return sayError('Așteaptă să se termine verificarea de mai jos, apoi trimite din nou.');
    }
    sending = true;
    sendButton.disabled = true;
    closeButton.disabled = true;
    let made: StoredTry | null = null;
    try {
      const done = await sendTry(
        deps.api,
        values,
        answer,
        {
          onCreated: (one) => {
            made = one;
            stored = one;
            phase = null;
            saveStoredTry(deps.storage, one);
          },
          onProgress: (text) => show(progress, text),
        },
        deps.now,
      );
      // Before a phone leaves for the try's phone page: the count goes out first.
      countVisitEvent('quick-try-sent');
      sending = false;
      const withPhone = values.byPhone;
      form!.reset();
      choosePhone(false);
      for (const input of pickInputs) showPick(input, []);
      if (withPhone && here) {
        // Back may show this page again from the browser's cache: closed, and
        // with no button for a second try. The try is read then ("pageshow"),
        // not now, when the answer would land on a page that is leaving.
        closeDialog(dialog!);
        refreshButton();
        (deps.go ?? ((path: string) => window.location.assign(path)))(quickTryPhonePath(done.token, true));
        return;
      }
      if (withPhone) {
        phoneStep = openPhoneStep(
          dialog!,
          { api: deps.api, origin: deps.origin ?? window.location.origin, drawQr: deps.drawQr ?? drawQr },
          done,
          { robotBarem: values.barem === null, onStarted: endPhoneStep, onClosed: endPhoneStep },
        );
        return;
      }
      closeDialog(dialog!);
      await follow(done);
      statusLink.focus();
    } catch (err) {
      sayError(messageOf(err));
      if (made) {
        recoverLink.href = tryPath((made as StoredTry).token);
        show(recover);
        void follow(made);
      }
    } finally {
      sending = false;
      progress.hidden = true;
      // A try that exists but broke half-way is not sent again (that would
      // make a second try): its page takes what is missing.
      sendButton.disabled = made !== null;
      closeButton.disabled = false;
      check?.reset();
    }
  }

  // Shown again from the browser's cache (Back from the phone page): the try
  // read again, since its pages or its state may have changed meanwhile.
  window.addEventListener(
    'pageshow',
    (event) => {
      if (!(event as PageTransitionEvent).persisted) return;
      stored = readStoredTry(deps.storage, deps.now());
      if (stored) void follow(stored);
      else refreshButton();
    },
    { signal: deps.signal },
  );

  const [answer] = await Promise.allSettled([deps.api.availability(), stored ? follow(stored) : Promise.resolve()]);
  if (answer.status === 'fulfilled') {
    availability = answer.value;
    showAccount(root, availability.signedIn);
  }
  refreshButton();
}
