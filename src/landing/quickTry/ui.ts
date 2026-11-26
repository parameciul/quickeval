import type { QuickTryAvailability } from '../../../shared/api.ts';
import { PHONE_MEDIA, PHONE_PARTS, QUICK_TRY_DAYS, quickTryPhonePath, type PhonePart } from '../../../shared/quickTry.ts';
import { ApiError, messageOf } from '../../ui/ApiError.ts';
import { phaseOf, scoreOf, type TryPhase } from '../../try/phase.ts';
import { countLabel, formatDate, formatDateTime, formatFileSize } from '../../ui/format.ts';
import { checkPick, picturesToPdf, type MakePdf, type PickCheck } from '../../ui/picturesPdf.ts';
import { countVisitEvent } from '../../ui/visits.ts';
import type { LandingApi } from './api.ts';
import { openPhoneStep, type PhoneStep } from './phone.ts';
import { drawQr } from './qr.ts';
import { formProblem, sendTry, type TryForm } from './send.ts';
import { canStart, statusOf, type StartAnswer } from './status.ts';
import { DELETED_TRY_KEY, forgetStoredTry, readDeletedAt, readStoredTry, saveStoredTry, STORED_TRY_KEY, type StoredTry } from './storage.ts';
import { t } from '../../i18n/t.ts';
import { initAccountLinks, showAccount } from '../account.ts';

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
  // Asks whether a teacher is logged in, when the availability gave no answer.
  checkAccount?: (root: ParentNode) => Promise<void>;
  // Makes photos of the test or the barem into one PDF (tests pass a fake).
  makePdf?: MakePdf;
}

const onAPhone = () => window.matchMedia?.(PHONE_MEDIA).matches ?? false;

const FULL_TEXT =
  t('Încercările gratuite de azi s-au terminat. Încearcă din nou mâine sau creează un cont: corectezi gratuit un test pentru toată clasa.');
const USED_TEXT = t('Ai făcut încercarea de azi. Mâine poți face alta.');
const OFF_TEXT = t('Încercarea gratuită nu este disponibilă acum. Reîncarcă pagina mai târziu.');
const NO_CHECK_TEXT = t('Verificarea nu s-a putut încărca. Reîncarcă pagina și încearcă din nou.');

const tryPath = (token: string) => `/try/${token}`;
const DAY_MS = 24 * 60 * 60 * 1000;

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
// the chosen file with its size, or the count and names of the chosen pages
// (or of the photos of the test or the barem).
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
    action.textContent = input.name === 'pages' ? t('Alege fișierele') : t('Alege fișierul');
    return;
  }
  const pages = input.name === 'pages';
  const many = pages || chosen.length > 1;
  name.textContent = !many ? chosen[0]!.name : pages ? countLabel(chosen.length, 'pagină', 'pagini') : countLabel(chosen.length, 'poză', 'poze');
  hint.textContent = many ? chosen.map((file) => file.name).join(', ') : formatFileSize(chosen[0]!.size);
  action.textContent = t('Schimbă');
}

// The landing page's Quick Try (spec §3.1, §3.2): its buttons (the hero's,
// the try section's and the end band's), the form in a
// window over the page, and the status line of the visitor's try with its
// link. The page has no React: this works on the page's own elements.
export async function initQuickTry(root: Document, deps: QuickTryDeps): Promise<void> {
  const box = root.querySelector<HTMLElement>('[data-try]');
  const openButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-try-open]'));
  const dialog = root.querySelector<HTMLDialogElement>('[data-try-dialog]');
  const form = root.querySelector<HTMLFormElement>('[data-try-form]');
  if (!box || openButtons.length === 0 || !dialog || !form) return;
  const note = root.querySelector<HTMLElement>('[data-try-note]')!;
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
  // The window's × and "Renunță".
  const closeButtons = Array.from(form.querySelectorAll<HTMLButtonElement>('[data-try-close]'));
  const turnstileBox = form.querySelector<HTMLElement>('[data-try-turnstile]')!;
  // The barem is made from the test unless she has her own: its choices hide
  // behind "Am baremul meu", and a link goes back.
  const ownSeg = form.querySelector<HTMLElement>('[data-try-own-seg]')!;
  const ownOpen = form.querySelector<HTMLButtonElement>('[data-try-own-open]')!;
  const ownClose = form.querySelector<HTMLButtonElement>('[data-try-own-close]')!;
  const fileInput = (part: PhonePart) => form.elements.namedItem(part) as HTMLInputElement;
  const stepOf = (part: PhonePart) => form.querySelector<HTMLElement>(`[data-try-part="${part}"]`)!;
  const refreshMs = deps.refreshMs ?? 10_000;

  let availability: QuickTryAvailability | null = null;
  // The availability call ended without an answer: no try can be made.
  let noAnswer = false;
  let stored = readStoredTry(deps.storage, deps.now());
  // When her deleted try was made: it still counts as today's try.
  let deletedAt = readDeletedAt(deps.storage);
  let phase: TryPhase | null = null;
  let widget: Promise<TurnstileWidget> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sending = false;
  // The QR window, while it shows.
  let phoneStep: PhoneStep | null = null;
  // On a phone: "Fă poze" and its own camera, in place of the QR code.
  let here = false;

  // What the buttons may do. Before the API answers, the page guesses from
  // this device alone (its try of today), so the buttons show at once and
  // do not jump in late.
  function answerNow(): StartAnswer {
    if (availability) return canStart(availability, stored, phase, deps.now(), deletedAt);
    if (noAnswer) return 'off';
    return canStart({ dailyLimitReached: false, admin: false, signedIn: false, siteKey: 'guess' }, stored, phase, deps.now(), deletedAt);
  }

  // The buttons never go: open, or turned off (with the line that says why,
  // when there is one).
  function refreshButton(): void {
    const answer = answerNow();
    const why = answer === 'used' ? USED_TEXT : answer === 'full' ? FULL_TEXT : answer === 'off' ? OFF_TEXT : null;
    for (const button of openButtons) {
      button.disabled = answer !== 'yes';
      if (why) button.title = why;
      else button.removeAttribute('title');
    }
    if (hint) hint.hidden = answer !== 'yes';
    note.hidden = why === null;
    if (why) note.textContent = why;
    box!.hidden = status.hidden;
  }

  // Reads the stored try and shows where it stands; again and again while the
  // robot works. A link that no longer works (deleted or expired) is forgotten.
  async function follow(current: StoredTry): Promise<void> {
    if (timer) clearTimeout(timer);
    statusLink.href = tryPath(current.token);
    const expires = new Date(Date.parse(current.madeAt) + QUICK_TRY_DAYS * DAY_MS).toISOString();
    statusMeta.textContent = t('Trimisă {formatDateTime} · Linkul merge până pe {formatDate}', { formatDateTime: formatDateTime(current.madeAt), formatDate: formatDate(expires) });
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
      status.classList.remove('is-bare');
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
        statusText.textContent = t('Nu am putut citi încercarea acum.');
        status.classList.add('is-bare');
      }
    }
    refreshButton();
  }

  function formValues(): TryForm {
    const files = (name: string) => Array.from((form!.elements.namedItem(name) as HTMLInputElement).files ?? []);
    // The form has no name field: the try is named after the test file.
    const title = form!.elements.namedItem('title') as HTMLInputElement | null;
    const phone = phoneParts();
    return {
      title: title?.value ?? '',
      test: phone.includes('test') ? null : (files('test')[0] ?? null),
      barem: phone.includes('barem') ? null : (files('barem')[0] ?? null),
      robotBarem: fromOf('barem') === 'robot',
      pages: phone.includes('pages') ? [] : files('pages'),
      phone,
    };
  }

  function sayError(text: string): void {
    show(error, text);
  }

  // The Turnstile check, once the form is open and the API has answered.
  function loadCheck(): void {
    if (!dialog!.open || !availability || availability.admin || !availability.siteKey || widget) return;
    widget = deps.loadTurnstile(turnstileBox, availability.siteKey);
    widget.catch(() => {
      widget = null;
      sayError(NO_CHECK_TEXT);
    });
  }

  function openForm(): void {
    error.hidden = true;
    recover.hidden = true;
    sendButton.disabled = false;
    openDialog(dialog!);
    loadCheck();
  }
  for (const button of openButtons) button.addEventListener('click', openForm);

  for (const button of closeButtons) button.addEventListener('click', () => closeDialog(dialog));

  // Where each part comes from: its file, the phone (after the send, through
  // one QR code, or this phone's camera), or for the barem the test. A radio
  // group in each step's head; only the chosen way shows under it.
  const fromOf = (part: PhonePart): string => (form!.elements.namedItem(`${part}From`) as RadioNodeList).value;
  const phoneParts = (): PhonePart[] => PHONE_PARTS.filter((part) => fromOf(part) === 'phone');
  const setFrom = (part: PhonePart, value: string) => {
    (form!.elements.namedItem(`${part}From`) as RadioNodeList).value = value;
  };

  // The ways under each step, "Am totul pe hârtie", and the line that says
  // what the phone sends.
  function sync(): void {
    for (const part of PHONE_PARTS) {
      const from = fromOf(part);
      for (const way of stepOf(part).querySelectorAll<HTMLElement>('[data-try-from]')) way.hidden = way.dataset.tryFrom !== from;
    }
    const own = fromOf('barem') !== 'robot';
    ownSeg.hidden = !own;
    ownClose.hidden = !own;
  }

  // A part that leaves its file forgets the file picked for it.
  function forgetFile(part: PhonePart): void {
    const input = fileInput(part);
    if ((input.files?.length ?? 0) === 0 && input.value === '') return;
    input.value = '';
    showPick(input, []);
  }

  for (const part of PHONE_PARTS) {
    for (const radio of stepOf(part).querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
      radio.addEventListener('change', () => {
        if (fromOf(part) !== 'file') forgetFile(part);
        sync();
      });
    }
  }

  ownOpen.addEventListener('click', () => {
    setFrom('barem', 'file');
    sync();
    stepOf('barem').querySelector<HTMLInputElement>('input[value="file"]')!.focus();
  });
  ownClose.addEventListener('click', () => {
    setFrom('barem', 'robot');
    forgetFile('barem');
    sync();
    ownOpen.focus();
  });

  // The phone's words, for this device. The markup keeps the choices hidden
  // so a phone never shows "Telefon" first.
  function applyDevice(): void {
    here = (deps.isPhone ?? onAPhone)();
    for (const word of form!.querySelectorAll<HTMLElement>('[data-try-phone-word]')) word.textContent = here ? t('Fă poze') : t('Telefon');
    for (const title of form!.querySelectorAll<HTMLElement>('[data-try-phone-title]')) {
      title.textContent = here ? t('Faci pozele cu acest telefon, după ce apeși Trimite') : t('Faci pozele cu telefonul, după ce apeși Trimite');
    }
    for (const hint of form!.querySelectorAll<HTMLElement>('[data-try-phone-hint]')) {
      hint.textContent = here ? t('Camera se deschide pas cu pas') : t('Același cod QR pentru toate pozele');
    }
    for (const seg of form!.querySelectorAll<HTMLElement>('[data-try-seg]')) seg.hidden = false;
    sync();
  }
  applyDevice();
  (deps.watchPhone ?? ((onChange) => window.matchMedia?.(PHONE_MEDIA).addEventListener?.('change', onChange, { signal: deps.signal })))(applyDevice);

  const pickInputs = Array.from(form.querySelectorAll<HTMLInputElement>('[data-try-pick] input[type="file"]'));
  for (const input of pickInputs) {
    input.addEventListener('change', () => {
      // A file picked (or dropped) for a part takes that part to "Fișier".
      const part = input.name as PhonePart;
      if ((input.files?.length ?? 0) > 0 && fromOf(part) !== 'file') {
        setFrom(part, 'file');
        sync();
      }
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

  // The test and the barem as they are sent: one PDF or Word file each, or
  // photos made into one PDF. A wrong pick is said at once, as before; only
  // photos are waited for.
  type Picked = { test: PickCheck | null; barem: PickCheck | null };
  function checkTeacherFiles(): Picked | { problem: string } {
    // A part from the phone sends no file now.
    const list = (name: PhonePart) => (fromOf(name) === 'file' ? Array.from(fileInput(name).files ?? []) : []);
    const test = checkPick(list('test'));
    if (test?.kind === 'problem') return { problem: t('Testul: {test}', { test: test.problem }) };
    const barem = checkPick(list('barem'));
    if (barem?.kind === 'problem') return { problem: t('Baremul: {barem}', { barem: barem.problem }) };
    return { test, barem };
  }
  async function makeTeacherFiles(picked: Picked): Promise<{ test: File | null; barem: File | null } | { problem: string }> {
    const makePdf = deps.makePdf ?? picturesToPdf;
    const fileOf = async (check: PickCheck | null, label: (problem: string) => string): Promise<File | null | { problem: string }> => {
      if (!check || check.kind === 'problem') return null;
      if (check.kind === 'document') return check.file;
      const made = await makePdf(check.pictures, check.name);
      return 'file' in made ? made.file : { problem: label(made.problem) };
    };
    const test = await fileOf(picked.test, (problem) => t('Testul: {test}', { test: problem }));
    if (test && !(test instanceof File)) return test;
    const barem = await fileOf(picked.barem, (problem) => t('Baremul: {barem}', { barem: problem }));
    if (barem && !(barem instanceof File)) return barem;
    return { test, barem };
  }

  let preparing = false;
  async function submit(): Promise<void> {
    if (preparing || sending) return;
    error.hidden = true;
    recover.hidden = true;
    const picked = checkTeacherFiles();
    if ('problem' in picked) return sayError(picked.problem);
    let files: { test: File | null; barem: File | null };
    if (picked.test?.kind === 'pictures' || picked.barem?.kind === 'pictures') {
      preparing = true;
      sendButton.disabled = true;
      show(progress, t('Se pregătesc pozele…'));
      const made = await makeTeacherFiles(picked);
      preparing = false;
      sendButton.disabled = false;
      progress.hidden = true;
      if ('problem' in made) return sayError(made.problem);
      files = made;
    } else {
      files = { test: picked.test?.kind === 'document' ? picked.test.file : null, barem: picked.barem?.kind === 'document' ? picked.barem.file : null };
    }
    const values = { ...formValues(), ...files };
    const problem = formProblem(values);
    if (problem) return sayError(problem);
    const admin = availability?.admin ?? false;
    let check: TurnstileWidget | null = null;
    let answer: string | undefined;
    if (!admin) {
      check = widget ? await widget.catch(() => null) : null;
      if (!check) return sayError(NO_CHECK_TEXT);
      answer = check.token();
      if (!answer) return sayError(t('Așteaptă să se termine verificarea de mai jos, apoi trimite din nou.'));
    }
    sending = true;
    sendButton.disabled = true;
    for (const button of closeButtons) button.disabled = true;
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
      const parts = values.phone;
      const withPhone = parts.length > 0;
      form!.reset();
      for (const input of pickInputs) showPick(input, []);
      sync();
      if (withPhone && here) {
        // Back may show this page again from the browser's cache: closed, and
        // with no button for a second try. The try is read then ("pageshow"),
        // not now, when the answer would land on a page that is leaving.
        closeDialog(dialog!);
        refreshButton();
        (deps.go ?? ((path: string) => window.location.assign(path)))(quickTryPhonePath(done.token, true, undefined, parts));
        return;
      }
      if (withPhone) {
        phoneStep = openPhoneStep(
          dialog!,
          { api: deps.api, origin: deps.origin ?? window.location.origin, drawQr: deps.drawQr ?? drawQr, makePdf: deps.makePdf },
          done,
          { parts, robotBarem: values.robotBarem && values.barem === null, onStarted: endPhoneStep, onClosed: endPhoneStep },
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
      for (const button of closeButtons) button.disabled = false;
      check?.reset();
    }
  }

  // Shown again from the browser's cache (Back from the phone page): the try
  // read again, since its pages or its state may have changed meanwhile.
  const readAgain = (): void => {
    stored = readStoredTry(deps.storage, deps.now());
    deletedAt = readDeletedAt(deps.storage);
    if (stored) void follow(stored);
    else {
      // Deleted in another tab or on the try's page: no card, no timer.
      if (timer) clearTimeout(timer);
      status.hidden = true;
      phase = null;
      refreshButton();
    }
  };
  window.addEventListener(
    'pageshow',
    (event) => {
      if ((event as PageTransitionEvent).persisted) readAgain();
    },
    { signal: deps.signal },
  );
  // Another tab changed her try (a delete on the try's page, a new try).
  window.addEventListener(
    'storage',
    (event) => {
      if (event.key === null || event.key === STORED_TRY_KEY || event.key === DELETED_TRY_KEY) readAgain();
    },
    { signal: deps.signal },
  );

  // The card of her try shows at once, before its state is read, so the
  // hero does not grow under the reader's eyes.
  if (stored) {
    show(status);
    status.classList.add('is-bare');
    statusText.textContent = t('Se citește încercarea…');
  }
  refreshButton();

  // The buttons follow the API's answer as soon as it comes, without waiting
  // for her try's state.
  const answered = deps.api.availability().then(
    (value) => {
      availability = value;
      showAccount(root, value.signedIn);
      refreshButton();
      loadCheck();
    },
    () => {
      noAnswer = true;
      void (deps.checkAccount ?? initAccountLinks)(root);
      refreshButton();
    },
  );
  await Promise.all([answered, stored ? follow(stored) : Promise.resolve()]);
}

