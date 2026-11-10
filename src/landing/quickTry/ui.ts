import type { QuickTryAvailability } from '../../../shared/api.ts';
import { ApiError, messageOf } from '../../ui/ApiError.ts';
import { phaseOf, type TryPhase } from '../../try/phase.ts';
import { countLabel, formatFileSize } from '../../ui/format.ts';
import type { LandingApi } from './api.ts';
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
}

const FULL_TEXT =
  'Încercările gratuite de azi s-au terminat. Încearcă din nou mâine sau creează un cont: corectezi gratuit un test pentru toată clasa.';
const USED_TEXT = 'Ai făcut încercarea de azi. Mâine poți face alta.';
const NO_CHECK_TEXT = 'Verificarea nu s-a putut încărca. Reîncarcă pagina și încearcă din nou.';

const tryPath = (token: string) => `/try/${token}`;

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
  const status = box.querySelector<HTMLElement>('[data-try-status]')!;
  const statusText = box.querySelector<HTMLElement>('[data-try-status-text]')!;
  const statusLink = box.querySelector<HTMLAnchorElement>('[data-try-link]')!;
  const error = form.querySelector<HTMLElement>('[data-try-error]')!;
  const recover = form.querySelector<HTMLElement>('[data-try-recover]')!;
  const recoverLink = form.querySelector<HTMLAnchorElement>('[data-try-recover-link]')!;
  const progress = form.querySelector<HTMLElement>('[data-try-progress]')!;
  const sendButton = form.querySelector<HTMLButtonElement>('[data-try-send]')!;
  const closeButton = form.querySelector<HTMLButtonElement>('[data-try-close]')!;
  const turnstileBox = form.querySelector<HTMLElement>('[data-try-turnstile]')!;
  const refreshMs = deps.refreshMs ?? 10_000;

  let availability: QuickTryAvailability | null = null;
  let stored = readStoredTry(deps.storage, deps.now());
  let phase: TryPhase | null = null;
  let widget: Promise<TurnstileWidget> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sending = false;

  // The button, or the line that says why there is none.
  function refreshButton(): void {
    const answer = availability ? canStart(availability, stored, phase, deps.now()) : 'off';
    openButton!.hidden = answer !== 'yes';
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
    try {
      const detail = await deps.api.getTest(current.token, current.code);
      if (stored !== current) return;
      const line = statusOf(detail);
      phase = phaseOf(detail);
      show(status);
      statusText.textContent = line.text;
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
      pages: files('pages'),
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

  const pickInputs = Array.from(form.querySelectorAll<HTMLInputElement>('[data-try-pick] input[type="file"]'));
  for (const input of pickInputs) input.addEventListener('change', () => showPick(input, Array.from(input.files ?? [])));
  // Esc and a phone's back button close a dialog: not while it sends, so the
  // form stays to show how the send ended.
  dialog.addEventListener('cancel', (event) => {
    if (sending) event.preventDefault();
  });

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
      sending = false;
      closeDialog(dialog!);
      form!.reset();
      for (const input of pickInputs) showPick(input, []);
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

  const [answer] = await Promise.allSettled([deps.api.availability(), stored ? follow(stored) : Promise.resolve()]);
  if (answer.status === 'fulfilled') availability = answer.value;
  refreshButton();
}
