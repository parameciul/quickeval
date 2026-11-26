import type { SubmissionFile, TestDetail } from '../../../shared/api.ts';
import { fileProblem, MAX_STUDENT_FILES, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE, type TestFileKind } from '../../../shared/files.ts';
import { asksBaremAfterTest, PHONE_IDLE_TEXT, quickTryPhonePath, type PhonePart } from '../../../shared/quickTry.ts';
import { messageOf } from '../../ui/ApiError.ts';
import { checkPick, picturesToPdf, type MakePdf } from '../../ui/picturesPdf.ts';
import { formatFileSize } from '../../ui/format.ts';
import type { LandingApi } from './api.ts';
import type { drawQr } from './qr.ts';
import type { StoredTry } from './storage.ts';
import { watchPages } from './watch.ts';
import { t } from '../../i18n/t.ts';
import { translateMessage } from '../../../shared/i18n/messages.ts';

export interface PhoneStep {
  // Stops the reads and puts the form back for the next time.
  close(): void;
  // Files from the laptop or the start are on their way: Esc waits.
  busy(): boolean;
}

// What the window reads while it shows: the pages, and the test while a row
// of the test or the barem still waits.
interface Seen {
  pages: SubmissionFile[];
  test: TestDetail | null;
}

// The QR window (spec §3.2): after a send with a part from the phone, the same
// dialog shows the code of the try's phone page (one code for every part the
// phone sends), a row for the test and the barem when one of them comes from
// the phone, the pages as they arrive, and starts the grading. With the
// robot's barem it has no start: the barem is read on the try's page first.
export function openPhoneStep(
  root: ParentNode & Element,
  deps: { api: LandingApi; origin: string; drawQr: typeof drawQr; refreshMs?: number; idleMs?: number; isVisible?: () => boolean; makePdf?: MakePdf },
  stored: StoredTry,
  options: { parts?: PhonePart[]; robotBarem: boolean; onStarted(): void; onClosed(): void },
): PhoneStep {
  const parts = options.parts ?? ['pages'];
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
  const address = deps.origin + quickTryPhonePath(stored.token, false, undefined, parts);
  const sub = $('sub');
  const rows = $('parts');
  const row = (kind: TestFileKind) => rows.querySelector<HTMLElement>(`[data-try-phone-part="${kind}"]`)!;
  // The rows show when the test or the barem comes from the phone.
  const withRows = parts.includes('test') || parts.includes('barem');
  let test: TestDetail | null = null;

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
  $('idle-text').textContent = translateMessage(PHONE_IDLE_TEXT);
  rows.hidden = !withRows;
  // Beside the rows, the laptop's pick says it is for the pages.
  const filesWords = files.closest('label')!.firstChild!;
  files.dataset.pagesOnly ??= filesWords.textContent ?? '';
  filesWords.textContent = withRows ? t('Alege paginile de pe calculator') : files.dataset.pagesOnly!;
  sub.dataset.pagesOnly ??= sub.textContent ?? '';
  sub.textContent = withRows ? t('Scanează codul cu camera telefonului și fotografiază {parts}.', { parts: phoneWords(parts) }) : sub.dataset.pagesOnly;

  form.hidden = true;
  block.hidden = false;
  root.setAttribute('aria-labelledby', 'try-phone-title');
  title.focus();

  // "Închide" waits too while files or the start are on their way, like Esc,
  // and so does a second pick of files: one send at a time.
  // The test and the barem are there (the robot's barem never starts here).
  const teacherReady = () => !withRows || (test !== null && test.test.files.test !== null && test.test.files.barem !== null);
  const refreshStart = () => {
    start.disabled = pageCount === 0 || !teacherReady() || starting || sendingFiles;
    close.disabled = starting || sendingFiles;
    files.disabled = starting || sendingFiles;
    for (const input of rows.querySelectorAll<HTMLInputElement>('[data-try-phone-part-files]')) input.disabled = starting || sendingFiles;
  };
  refreshStart();

  // Each row: from the laptop at the send, arrived, made from the test, or
  // waited for (with a way to send it from the laptop).
  function showRows(): void {
    if (!withRows) return;
    const files = test?.test.files;
    const set = (kind: TestFileKind, tone: 'ok' | 'work' | 'wait', text: string, pick: boolean) => {
      const one = row(kind);
      one.className = `ck is-${tone}`; // i18n-ignore: class names
      one.querySelector<HTMLElement>('[data-try-phone-part-text]')!.textContent = text;
      one.querySelector<HTMLElement>('[data-try-phone-part-pick]')!.hidden = !pick;
    };
    if (!parts.includes('test')) set('test', 'ok', t('De pe calculator'), false);
    else if (files?.test) set('test', 'ok', t('A ajuns'), false);
    else set('test', 'wait', t('Se așteaptă pozele de pe telefon'), true);
    if (parts.includes('barem')) {
      if (files?.barem) set('barem', 'ok', t('A ajuns'), false);
      else set('barem', 'wait', t('Se așteaptă pozele de pe telefon'), true);
    } else if (options.robotBarem) {
      if (files?.barem) set('barem', 'ok', t('E gata. Îl găsești pe pagina încercării.'), false);
      else if (test?.test.barem.request === 'requested') set('barem', 'work', t('Se face acum din test'), false);
      else set('barem', 'wait', t('Se face din test, după ce ajunge testul'), false);
    } else {
      set('barem', 'ok', t('De pe calculator'), false);
    }
  }
  showRows();

  function showPages(pages: SubmissionFile[]): void {
    pageCount = pages.length;
    count.textContent = String(pages.length);
    wait.hidden = pages.length > 0;
    list.replaceChildren(
      ...pages.map((page, index) => {
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = t('Pagina {n}', { n: index + 1 });
        const size = document.createElement('span');
        size.className = 'try-phone-size';
        size.textContent = formatFileSize(page.size);
        item.append(name, size);
        return item;
      }),
    );
    refreshStart();
  }

  // The test is read only while a row waits for it.
  const rowsWait = () => withRows && !(test?.test.files.test && test.test.files.barem);
  const watch = watchPages<Seen>({
    read: async () => {
      const pages = await deps.api.listPages(stored.token);
      if (rowsWait()) test = await deps.api.getTest(stored.token, stored.code);
      return { pages, test };
    },
    onPages: (seen) => {
      showRows();
      showPages(seen.pages);
    },
    progress: (seen) => `${seen.pages.length}|${seen.test?.test.files.test ? 1 : 0}|${seen.test?.test.files.barem ? 1 : 0}|${seen.test?.test.barem.request ?? ''}`,
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

  // The test or the barem sent from the laptop after all: one PDF or Word
  // file, or photos made into one PDF. A test with no barem of her own asks
  // for the robot's, as the phone would.
  async function sendTeacherFile(kind: TestFileKind, input: HTMLInputElement): Promise<void> {
    const picked = Array.from(input.files ?? []);
    input.value = '';
    if (picked.length === 0 || sendingFiles || starting) return;
    error.hidden = true;
    const label = (problem: string) => (kind === 'test' ? t('Testul: {test}', { test: problem }) : t('Baremul: {barem}', { barem: problem }));
    const check = checkPick(picked);
    if (!check) return;
    if (check.kind === 'problem') return sayError(label(check.problem));
    sendingFiles = true;
    refreshStart();
    try {
      let file: File;
      if (check.kind === 'document') file = check.file;
      else {
        progress.textContent = t('Se pregătesc pozele…');
        progress.hidden = false;
        const made = await (deps.makePdf ?? picturesToPdf)(check.pictures, check.name);
        if (!('file' in made)) {
          if (!closed) sayError(label(made.problem));
          return;
        }
        file = made.file;
      }
      progress.textContent = kind === 'test' ? t('Se trimite testul…') : t('Se trimite baremul…');
      progress.hidden = false;
      await deps.api.uploadTestFile(stored.token, stored.code, kind, file);
      if (kind === 'test') {
        const now = test ?? (await deps.api.getTest(stored.token, stored.code));
        if (asksBaremAfterTest(parts, now.test)) await deps.api.generateBarem(stored.token, stored.code);
      }
    } catch (err) {
      if (!closed) sayError(messageOf(err));
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
  const onPartFiles = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const kind = input.closest<HTMLElement>('[data-try-phone-part]')?.dataset.tryPhonePart as TestFileKind | undefined;
    if (kind) void sendTeacherFile(kind, input);
  };
  files.addEventListener('change', onFiles);
  rows.addEventListener('change', onPartFiles);
  start.addEventListener('click', onStart);
  close.addEventListener('click', onClose);
  again.addEventListener('click', onAgain);

  function finish(): void {
    if (closed) return;
    closed = true;
    watch.stop();
    files.disabled = false;
    files.removeEventListener('change', onFiles);
    rows.removeEventListener('change', onPartFiles);
    start.removeEventListener('click', onStart);
    close.removeEventListener('click', onClose);
    again.removeEventListener('click', onAgain);
    block.hidden = true;
    form.hidden = false;
    root.setAttribute('aria-labelledby', 'try-title');
  }

  return { close: finish, busy: () => sendingFiles || starting };
}

// What the phone photographs, in words: "testul, baremul și lucrarea elevului".
export function phoneWords(parts: readonly PhonePart[]): string {
  const words = parts.map((part) => (part === 'test' ? t('testul') : part === 'barem' ? t('baremul') : t('lucrarea elevului')));
  if (words.length <= 1) return words.join('');
  if (words.length === 2) return t('{a} și {b}', { a: words[0]!, b: words[1]! });
  return t('{a}, {b} și {c}', { a: words[0]!, b: words[1]!, c: words[2]! });
}
