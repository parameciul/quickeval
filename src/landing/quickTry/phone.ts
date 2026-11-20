import type { SubmissionFile } from '../../../shared/api.ts';
import { fileProblem, MAX_STUDENT_FILES, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE } from '../../../shared/files.ts';
import { PHONE_IDLE_TEXT, quickTryPhonePath } from '../../../shared/quickTry.ts';
import { messageOf } from '../../ui/ApiError.ts';
import { formatFileSize } from '../../ui/format.ts';
import type { LandingApi } from './api.ts';
import type { drawQr } from './qr.ts';
import type { StoredTry } from './storage.ts';
import { watchPages } from './watch.ts';
import { t } from '../../i18n/t.ts';

export interface PhoneStep {
  // Stops the reads and puts the form back for the next time.
  close(): void;
  // Files from the laptop or the start are on their way: Esc waits.
  busy(): boolean;
}

// The QR window (spec §3.2): after a send with the phone, the same dialog
// shows the code of the try's phone page and the pages as they arrive, and
// starts the grading. With the robot's barem it has no start: the barem is
// read on the try's page first.
export function openPhoneStep(
  root: ParentNode & Element,
  deps: { api: LandingApi; origin: string; drawQr: typeof drawQr; refreshMs?: number; idleMs?: number; isVisible?: () => boolean },
  stored: StoredTry,
  options: { robotBarem: boolean; onStarted(): void; onClosed(): void },
): PhoneStep {
  const form = root.querySelector<HTMLElement>('[data-try-form]')!;
  const block = root.querySelector<HTMLElement>('[data-try-phone]')!;
  const $ = <T extends Element = HTMLElement>(name: string) => block.querySelector<T>(`[data-try-phone-${name}]`)!;
  const title = block.querySelector<HTMLElement>('#try-phone-title')!;
  const qr = block.querySelector<SVGSVGElement>('[data-try-qr]')!;
  const qrLink = block.querySelector<HTMLElement>('[data-try-qr-link]')!;
  const list = $<HTMLOListElement>('list');
  const count = $('count');
  const wait = $('wait');
  const idle = $('idle');
  const error = $('error');
  const progress = $('progress');
  const files = $<HTMLInputElement>('files');
  const openLink = $<HTMLAnchorElement>('open');
  const start = $<HTMLButtonElement>('start');
  const close = $<HTMLButtonElement>('close');
  const again = $<HTMLButtonElement>('again');
  const address = deps.origin + quickTryPhonePath(stored.token);

  let pageCount = 0;
  let sendingFiles = false;
  let starting = false;
  let closed = false;

  // Back to how the markup has it, so the form shows the next time.
  list.replaceChildren();
  qr.replaceChildren();
  qr.removeAttribute('hidden');
  qrLink.hidden = true;
  error.hidden = true;
  progress.hidden = true;
  idle.hidden = true;
  wait.hidden = false;
  count.textContent = '0';
  openLink.href = `/try/${stored.token}`;
  openLink.hidden = !options.robotBarem;
  openLink.classList.toggle('btn-primary', options.robotBarem);
  start.hidden = options.robotBarem;
  $('barem').hidden = !options.robotBarem;
  $('hint').hidden = options.robotBarem;
  $('idle-text').textContent = PHONE_IDLE_TEXT;

  form.hidden = true;
  block.hidden = false;
  root.setAttribute('aria-labelledby', 'try-phone-title');
  title.focus();

  // "Închide" waits too while files or the start are on their way, like Esc,
  // and so does a second pick of files: one send at a time.
  const refreshStart = () => {
    start.disabled = pageCount === 0 || starting || sendingFiles;
    close.disabled = starting || sendingFiles;
    files.disabled = starting || sendingFiles;
  };
  refreshStart();

  function showPages(pages: SubmissionFile[]): void {
    pageCount = pages.length;
    count.textContent = String(pages.length);
    wait.hidden = pages.length > 0;
    list.replaceChildren(
      ...pages.map((page, index) => {
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = `Pagina ${index + 1}`;
        const size = document.createElement('span');
        size.className = 'try-phone-size';
        size.textContent = formatFileSize(page.size);
        item.append(name, size);
        return item;
      }),
    );
    refreshStart();
  }

  const watch = watchPages({
    read: () => deps.api.listPages(stored.token),
    onPages: showPages,
    onIdle: () => {
      idle.hidden = false;
    },
    isVisible: deps.isVisible ?? (() => document.visibilityState !== 'hidden'),
    refreshMs: deps.refreshMs,
    idleMs: deps.idleMs,
  });

  // Drawn apart, then moved in: a code ready only after the window closed
  // never lands in a later window.
  const drawn = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  deps.drawQr(drawn, address).then(
    () => {
      if (closed) return;
      const box = drawn.getAttribute('viewBox');
      if (box) qr.setAttribute('viewBox', box);
      qr.replaceChildren(...drawn.childNodes);
    },
    () => {
      // No code: the address as text still takes the phone there.
      if (closed) return;
      qr.setAttribute('hidden', '');
      qrLink.textContent = address;
      qrLink.hidden = false;
    },
  );

  const sayError = (text: string) => {
    error.textContent = text;
    error.hidden = false;
  };

  async function sendFiles(): Promise<void> {
    const picked = Array.from(files.files ?? []);
    files.value = '';
    if (picked.length === 0 || sendingFiles || starting) return;
    error.hidden = true;
    if (pageCount + picked.length > MAX_STUDENT_FILES) return sayError(t('Poți trimite cel mult {MAX_STUDENT_FILES} de fișiere.', { MAX_STUDENT_FILES }));
    for (const file of picked) {
      const problem = fileProblem(file, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE);
      if (problem) return sayError(`${file.name}: ${problem}`);
    }
    sendingFiles = true;
    refreshStart();
    // One at a time; a refused file never stops the files after it.
    const problems: string[] = [];
    try {
      for (const [index, file] of picked.entries()) {
        progress.textContent = t('Se trimit paginile: {v1} din {length}…', { v1: index + 1, length: picked.length });
        progress.hidden = false;
        try {
          await deps.api.addPage(stored.token, file);
          // Counted now: the next read may come after the next pick.
          pageCount += 1;
        } catch (err) {
          problems.push(`${file.name}: ${messageOf(err)}`);
        }
      }
      if (problems.length > 0 && !closed) sayError(problems.join(' '));
    } finally {
      sendingFiles = false;
      progress.hidden = true;
      if (!closed) {
        idle.hidden = true;
        watch.again();
        refreshStart();
      }
    }
  }

  async function startGrading(): Promise<void> {
    error.hidden = true;
    starting = true;
    refreshStart();
    try {
      await deps.api.start(stored.token);
      if (closed) return;
      finish();
      options.onStarted();
    } catch (err) {
      if (closed) return;
      sayError(messageOf(err));
      openLink.hidden = false;
    } finally {
      starting = false;
      if (!closed) refreshStart();
    }
  }

  const onFiles = () => void sendFiles();
  const onStart = () => void startGrading();
  const onClose = () => {
    finish();
    options.onClosed();
  };
  const onAgain = () => {
    idle.hidden = true;
    watch.again();
  };
  files.addEventListener('change', onFiles);
  start.addEventListener('click', onStart);
  close.addEventListener('click', onClose);
  again.addEventListener('click', onAgain);

  function finish(): void {
    if (closed) return;
    closed = true;
    watch.stop();
    files.disabled = false;
    files.removeEventListener('change', onFiles);
    start.removeEventListener('click', onStart);
    close.removeEventListener('click', onClose);
    again.removeEventListener('click', onAgain);
    block.hidden = true;
    form.hidden = false;
    root.setAttribute('aria-labelledby', 'try-title');
  }

  return { close: finish, busy: () => sendingFiles || starting };
}
