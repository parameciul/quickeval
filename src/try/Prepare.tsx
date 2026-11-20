import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { SubmissionFile, TestDetail } from '../../shared/api.ts';
import { PHONE_IDLE_TEXT, PHONE_MEDIA } from '../../shared/quickTry.ts';
import {
  DOCX_TYPE,
  fileProblem,
  MAX_STUDENT_FILES,
  PDF_TYPE,
  STUDENT_FILE_TYPES,
  STUDENT_WRONG_TYPE,
  TEACHER_FILE_TYPES,
  TEACHER_WRONG_TYPE,
  type TestFileKind,
} from '../../shared/files.ts';
import { testFileUrl } from '../admin/api.ts';
import { useApi } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { FileDrop } from '../admin/newTest/FileDrop.tsx';
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { countLabel, formatFileSize } from '../ui/format.ts';
import { PhotoViewer } from '../upload/PhotoViewer.tsx';
import { previewPhoto } from '../upload/shrink.ts';
import { pageFileUrl, type TryApi } from './api.ts';
import { fileChangesLeft } from './phase.ts';
import { PhoneCode } from './PhoneCode.tsx';
import { usePagesWatch } from './usePagesWatch.ts';
import { t } from '../i18n/t.ts';
import { translateMessage } from '../../shared/i18n/messages.ts';

const PAGE_ACCEPT = [...STUDENT_FILE_TYPES, '.jpg', '.jpeg', '.png', '.webp', '.pdf'].join(',');
const FILE_ACCEPT = ['.pdf', '.docx', PDF_TYPE, DOCX_TYPE].join(',');
// Every upload of the page: a file of the test or a page. The start waits for them.
const UPLOAD_KEY = ['try', 'upload'];

// Before the grading (spec §3.3, states 1 and 2), in the look of the landing
// page's form that made the try: the test and the barem as two tiles (green
// once sent, with "Schimbă" on the right), the student's pages as previews, and
// a bar that says whether all is ready, beside "Pornește corectarea". The cap
// on file changes shows only when it limits her: at the last change, and when
// none is left.
export function Prepare({ detail, token, tryApi }: { detail: TestDetail; token: string; tryApi: TryApi }) {
  const queryClient = useQueryClient();
  const { test } = detail;
  const pages = useQuery({ queryKey: ['try', 'pages'], queryFn: () => tryApi.listPages() });
  const pageCount = pages.data?.length ?? 0;
  const robotBarem = test.barem.unchecked && test.files.barem !== null;
  const baremBusy = test.barem.request === 'requested';
  const missing = [
    test.files.test === null && t('testul'),
    (test.files.barem === null || baremBusy) && t('baremul'),
    pageCount === 0 && t('paginile lucrării'),
  ].filter((part) => part !== false);
  const start = useMutation({
    mutationFn: () => tryApi.start(robotBarem ? test.filesVersion : undefined),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['test', test.code] }),
  });
  const left = fileChangesLeft(detail);
  const uploading = useIsMutating({ mutationKey: UPLOAD_KEY }) > 0;
  useKeepDroppedFiles();

  return (
    <>
      <div className="try-file-row">
        <TestSlot detail={detail} left={left} />
        <BaremSlot detail={detail} robotBarem={robotBarem} left={left} />
      </div>
      <BaremChoice detail={detail} left={left} />
      {left === 1 && <p className="hint try-left">{t('Mai poți schimba testul sau baremul o singură dată.')}</p>}
      {left === 0 && (
        <p className="hint try-left">
          <ActionIcon name="lock" />
          {t('Nu mai poți schimba testul sau baremul în această încercare.')}
        </p>
      )}
      <section className="try-paper" aria-labelledby="try-paper-title">
        <h2 id="try-paper-title">{t('Lucrarea elevului')}</h2>
        {pageCount === 0 && (
          <p className="hint">{t('Pozele sau PDF-ul lucrării unui elev, în ordinea paginilor. Cel mult {MAX_STUDENT_FILES} de fișiere.', { MAX_STUDENT_FILES })}</p>
        )}
        <Pages token={token} tryApi={tryApi} />
      </section>
      <div className="try-go-bar">
        <div className="try-go-line">
          <ReadyLine missing={missing} baremBusy={baremBusy} robotBarem={robotBarem} pageCount={pageCount} />
          <button type="button" className="try-go" disabled={missing.length > 0 || uploading || start.isPending} onClick={() => start.mutate()}>
            <ActionIcon name="play" />
            {t('Pornește corectarea')}
          </button>
        </div>
        {start.error && <ErrorMessage error={start.error} />}
      </div>
    </>
  );
}

// Whether the try can go to grading, said in words beside the button: what is
// missing, the robot's barem to read first, or ready.
function ReadyLine({ missing, baremBusy, robotBarem, pageCount }: { missing: string[]; baremBusy: boolean; robotBarem: boolean; pageCount: number }) {
  let tone = 'is-ready';
  let icon: 'check' | 'clock' | 'doc' = 'check';
  let title = t('Gata de corectare');
  let text = t('Testul, baremul și {pages} au ajuns. Corectarea durează câteva minute.', { pages: countLabel(pageCount, 'pagină', 'pagini') });
  if (missing.length > 0) {
    tone = 'is-wait';
    icon = 'clock';
    title = baremBusy ? t('Se așteaptă baremul') : t('Încă nu e gata');
    text = t('Lipsește: {join}.', { join: missing.join(', ') });
  } else if (robotBarem) {
    tone = 'is-read';
    icon = 'doc';
    title = t('Citește întâi baremul robotului');
    text = t('Corectarea îl folosește așa cum este. Schimbă-l dacă ceva e greșit.');
  }
  return (
    <div className={`try-ready ${tone}`}>
      <span className="try-ready-mark">
        <ActionIcon name={icon} />
      </span>
      <span className="try-ready-text">
        {/* Only the title is read out when it changes, not each new page count. */}
        <b role="status">{title}</b>
        <span>{text}</span>
      </span>
    </div>
  );
}

// While the page shows, a file dropped beside a tile does nothing, so a near
// miss does not open the file in the tab and lose the page.
function useKeepDroppedFiles() {
  useEffect(() => {
    const keepPage = (event: globalThis.DragEvent) => {
      if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
    };
    window.addEventListener('dragover', keepPage);
    window.addEventListener('drop', keepPage);
    return () => {
      window.removeEventListener('dragover', keepPage);
      window.removeEventListener('drop', keepPage);
    };
  }, []);
}

function useUpload(code: string, kind: TestFileKind) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: UPLOAD_KEY,
    mutationFn: (file: File) => api.uploadTestFile(code, kind, file),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['test', code] }),
  });
}

// A drop area for a new file of the test, as the barem's problem page asks
// for one: its name opens the file sent before, and a new file replaces it.
export function TestFile({ code, kind, name, disabled }: { code: string; kind: TestFileKind; name: string | null; disabled: boolean }) {
  const api = useApi();
  const upload = useUpload(code, kind);
  const label = kind === 'test' ? t('Fișierul testului') : t('Fișierul baremului');
  return (
    <>
      {name !== null && (
        <p>
          <a href={testFileUrl(code, kind, undefined, api.base)} target="_blank" rel="noopener">
            {name}
          </a>
        </p>
      )}
      <FileDrop id={`try-${kind}`} name={label} disabled={disabled || upload.isPending} onPick={(file) => file && upload.mutate(file)} />
      {upload.isPending && <p className="hint">{t('Se trimite…')}</p>}
      {upload.error && <ErrorMessage error={upload.error} />}
    </>
  );
}

// A file picker in a label: a click opens the picker, and a file dragged onto
// it is taken too. A file that is not PDF or Word, or too big, shows its
// problem and is not sent.
function FilePick({
  name,
  className,
  disabled,
  onPick,
  onProblem,
  children,
}: {
  name: string;
  className: string;
  disabled: boolean;
  onPick: (file: File) => void;
  onProblem: (problem: string | null) => void;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const take = (file: File | undefined) => {
    if (!file || disabled) return;
    const problem = fileProblem(file, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE);
    onProblem(problem);
    if (problem === null) onPick(file);
  };
  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    if (!disabled) setOver(true);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    take(event.dataTransfer.files[0]);
  };
  const classes = [className, over && 'is-over', disabled && 'is-disabled'].filter(Boolean).join(' ');
  return (
    <label
      className={classes}
      onDragOver={onDragOver}
      onDragLeave={(event) => {
        // Moving over the tile's own words is not leaving it.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={onDrop}
    >
      {children}
      <input
        type="file"
        className="sr-only"
        accept={FILE_ACCEPT}
        aria-label={name}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          take(event.target.files?.[0]);
          // Emptied, so picking the same file again is still a change.
          event.target.value = '';
        }}
      />
    </label>
  );
}

// One of the two files: a tile to pick it while it is missing, then a green
// tile with its name (which opens it) and "Schimbă", as on the landing form.
function FileSlot({
  code,
  kind,
  label,
  pickText,
  name,
  left,
  tone = 'is-done',
  sub,
  extra,
}: {
  code: string;
  kind: TestFileKind;
  label: string;
  pickText: string;
  name: string | null;
  left: number;
  tone?: 'is-done' | 'is-robot';
  sub?: string;
  extra?: ReactNode;
}) {
  const api = useApi();
  const upload = useUpload(code, kind);
  const [problem, setProblem] = useState<string | null>(null);
  const inputName = kind === 'test' ? t('Fișierul testului') : t('Fișierul baremului');
  const disabled = left === 0 || upload.isPending;
  // The input's name starts with the words it shows, for voice control.
  const pick = (action: string, children: ReactNode, className: string) => (
    <FilePick name={`${action}: ${inputName}`} className={className} disabled={disabled} onPick={(file) => upload.mutate(file)} onProblem={setProblem}>
      {children}
    </FilePick>
  );
  return (
    <div className="try-slot">
      {name === null ? (
        pick(
          pickText,
          <>
            <span className="try-tile-mark">
              <ActionIcon name="upload" />
            </span>
            <span className="try-tile-text">
              <b>{pickText}</b>
              <small>{upload.isPending ? t('Se trimite…') : kind === 'test' ? t('Fără răspunsuri. PDF sau Word.') : t('PDF sau Word.')}</small>
            </span>
          </>,
          'try-tile is-empty',
        )
      ) : (
        <div className={`try-tile ${tone}`}>
          <span className="try-tile-mark">
            <ActionIcon name={tone === 'is-robot' ? 'generate' : 'check'} />
          </span>
          <span className="try-tile-text">
            <small className="try-tile-kind">{label}</small>
            <a href={testFileUrl(code, kind, undefined, api.base)} target="_blank" rel="noopener">
              {name}
            </a>
            {(upload.isPending || sub) && <small>{upload.isPending ? t('Se trimite…') : sub}</small>}
          </span>
          <span className="try-tile-acts">
            {extra}
            {left > 0 &&
              pick(
                t('Schimbă'),
                <>{t('Schimbă')}</>,
                'try-change',
              )}
          </span>
        </div>
      )}
      {problem && (
        <p className="alert" role="alert">
          {problem}
        </p>
      )}
      {upload.error && <ErrorMessage error={upload.error} />}
    </div>
  );
}

function TestSlot({ detail, left }: { detail: TestDetail; left: number }) {
  const { test } = detail;
  return <FileSlot code={test.code} kind="test" label={t('Testul')} pickText={t('Alege testul')} name={test.files.test?.name ?? null} left={left} />;
}

// The barem: the robot's while it is made; the robot's to download and read;
// her own file; or a tile to pick one.
function BaremSlot({ detail, robotBarem, left }: { detail: TestDetail; robotBarem: boolean; left: number }) {
  const api = useApi();
  const { test } = detail;
  if (test.barem.request === 'requested') {
    return (
      <div className="try-slot">
        <div className="try-tile is-wait">
          <span className="try-tile-mark">
            <span className="spinner" aria-hidden="true" />
          </span>
          <span className="try-tile-text">
            <small className="try-tile-kind">{t('Baremul')}</small>
            <span>{t('Robotul face baremul din test. Durează câteva minute; pagina se actualizează singură.')}</span>
          </span>
        </div>
      </div>
    );
  }
  if (robotBarem) {
    return (
      <FileSlot
        code={test.code}
        kind="barem"
        label={t('Baremul')}
        pickText={t('Alege baremul')}
        name={t('Baremul făcut de robot')}
        left={left}
        tone="is-robot"
        sub={t('Citește-l înainte să pornești corectarea.')}
        extra={
          <a
            className="button-quiet button-small try-icon-button"
            href={testFileUrl(test.code, 'barem', undefined, api.base)}
            target="_blank"
            rel="noopener"
            aria-label={t('Descarcă baremul')}
            title={t('Descarcă baremul')}
          >
            <ActionIcon name="download" />
          </a>
        }
      />
    );
  }
  return <FileSlot code={test.code} kind="barem" label={t('Baremul')} pickText={t('Alege baremul')} name={test.files.barem?.name ?? null} left={left} />;
}

// With no barem yet, the robot can make one from the test.
function BaremChoice({ detail, left }: { detail: TestDetail; left: number }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { test } = detail;
  const generate = useMutation({
    mutationFn: () => api.generateBarem(test.code),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['test', test.code] }),
  });
  if (test.files.barem !== null || test.barem.request === 'requested') return null;
  return (
    <div className="try-barem-choice">
      <p className="hint">{t('Nu ai un barem pregătit? Îl generezi automat din test, iar apoi îl citești înainte să pornești corectarea.')}</p>
      <button
        type="button"
        className="button-quiet button-small"
        disabled={test.files.test === null || left === 0 || generate.isPending}
        onClick={() => generate.mutate()}
      >
        <ActionIcon name="generate" />
        {t('Fă baremul din test')}
      </button>
      {generate.error && <ErrorMessage error={generate.error} />}
    </div>
  );
}

// The student's pages: each one sent as it is picked, in order, and each one
// can be taken out again before the grading.
function Pages({ token, tryApi }: { token: string; tryApi: TryApi }) {
  const queryClient = useQueryClient();
  // The phone's code: while it shows, the list is read again (usePagesWatch).
  const [phoneOpen, setPhoneOpen] = useState(false);
  // On a phone the pages come from its own camera, on the phone page.
  const [onPhone] = useState(() => window.matchMedia?.(PHONE_MEDIA).matches ?? false);
  const [pageCount, setPageCount] = useState(0);
  const watch = usePagesWatch(phoneOpen, pageCount);
  const pages = useQuery({ queryKey: ['try', 'pages'], queryFn: () => tryApi.listPages(), refetchInterval: watch.interval });
  const shownCount = pages.data?.length ?? 0;
  if (shownCount !== pageCount) setPageCount(shownCount);
  const [problem, setProblem] = useState<string | null>(null);
  // A page's photo, large; it closes when the page goes (deleted on the phone).
  const [viewing, setViewing] = useState<{ id: number; src: string } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['try', 'pages'] });
  const add = useMutation({
    mutationKey: UPLOAD_KEY,
    mutationFn: async (files: File[]) => {
      for (const file of files) await tryApi.addPage(file);
    },
    onSettled: refresh,
  });
  const remove = useMutation({ mutationFn: (fileId: number) => tryApi.deletePage(fileId), onSettled: refresh });
  const list = pages.data ?? [];
  const viewedIndex = viewing ? list.findIndex((page) => page.id === viewing.id) : -1;
  if (viewing && pages.data && viewedIndex < 0) setViewing(null);
  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    const refused = picked.map((file) => fileProblem(file, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE)).find((found) => found !== null) ?? null;
    setProblem(refused);
    if (refused === null && picked.length > 0) add.mutate(picked);
  };
  const full = list.length >= MAX_STUDENT_FILES || add.isPending;

  return (
    <>
      {list.length > 0 && (
        <ol className="try-page-grid" aria-label={t('Paginile lucrării')}>
          {list.map((page, index) => (
            <li key={page.id} className="try-page-card">
              <PagePreview page={page} label={t('Pagina {n}', { n: index + 1 })} token={token} tryApi={tryApi} onView={(src) => setViewing({ id: page.id, src })} />
              <span className="try-page-info">
                <span className="page-name">{t('Pagina {v1}', { v1: index + 1 })}</span>
                <span className="hint">{formatFileSize(page.size)}</span>
              </span>
              <button
                type="button"
                className="try-page-remove"
                aria-label={t('Șterge pagina {v1}', { v1: index + 1 })}
                title={t('Șterge pagina {v1}', { v1: index + 1 })}
                disabled={remove.isPending}
                onClick={() => remove.mutate(page.id)}
              >
                <ActionIcon name="trash" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="try-page-actions">
        <label className={full ? 'try-tile is-empty is-disabled' : 'try-tile is-empty'}>
          <span className="try-tile-mark">
            <ActionIcon name="upload" />
          </span>
          <span className="try-tile-text">
            <b>{t('Adaugă pagini')}</b>
          </span>
          <input type="file" className="sr-only" accept={PAGE_ACCEPT} multiple disabled={full} onChange={onPick} />
        </label>
        {onPhone ? (
          <Link className="try-tile is-empty" to="/phone?here=1">
            <span className="try-tile-mark">
              <ActionIcon name="phone" />
            </span>
            <span className="try-tile-text">
              <b>{t('Fă poze')}</b>
            </span>
          </Link>
        ) : (
          <button
            type="button"
            className={phoneOpen ? 'try-tile is-empty is-open' : 'try-tile is-empty'}
            aria-expanded={phoneOpen}
            aria-controls="try-phone-code"
            onClick={() => setPhoneOpen((open) => !open)}
          >
            <span className="try-tile-mark">
              <ActionIcon name="phone" />
            </span>
            <span className="try-tile-text">
              <b>{t('Fă poze cu telefonul')}</b>
            </span>
          </button>
        )}
      </div>
      {viewing && viewedIndex >= 0 && <PhotoViewer src={viewing.src} label={t('Pagina {n}', { n: viewedIndex + 1 })} onClose={() => setViewing(null)} />}
      {phoneOpen && <PhoneCode id="try-phone-code" token={token} />}
      <div aria-live="polite">
        {watch.idle && (
          <p className="hint">
            {translateMessage(PHONE_IDLE_TEXT)}{' '}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                watch.again();
                void pages.refetch();
              }}
            >
              {t('Verifică din nou')}
            </button>
          </p>
        )}
      </div>
      {add.isPending && <p className="hint">{t('Se trimit paginile…')}</p>}
      {problem && (
        <p className="alert" role="alert">
          {problem}
        </p>
      )}
      {pages.error && <ErrorMessage error={pages.error} />}
      {add.error && <ErrorMessage error={add.error} />}
      {remove.error && <ErrorMessage error={remove.error} />}
    </>
  );
}

// A page's preview: its photo, read once (a page never changes) and made
// small, or "PDF". The large view gets the whole photo. A photo that cannot be
// read links to its file. The pages show by number, not by file name: a
// phone's photo names say nothing and are too long for its screen.
function PagePreview({
  page,
  label,
  token,
  tryApi,
  onView,
}: {
  page: SubmissionFile;
  label: string;
  token: string;
  tryApi: TryApi;
  onView: (src: string) => void;
}) {
  const photo = page.contentType.startsWith('image/');
  const blob = useQuery({
    queryKey: ['try', 'page-photo', page.id],
    queryFn: async () => {
      const full = await tryApi.pageBlob(page.id);
      return { full, small: await previewPhoto(full) };
    },
    enabled: photo,
    staleTime: Infinity,
  });
  const [urls, setUrls] = useState<{ full: string; small: string } | null>(null);
  useEffect(() => {
    if (!blob.data) return;
    const full = URL.createObjectURL(blob.data.full);
    const small = blob.data.small === blob.data.full ? full : URL.createObjectURL(blob.data.small);
    setUrls({ full, small });
    return () => {
      URL.revokeObjectURL(full);
      if (small !== full) URL.revokeObjectURL(small);
    };
  }, [blob.data]);
  if (blob.isError) {
    return (
      <a className="thumb thumb-file" href={pageFileUrl(token, page.id)} target="_blank" rel="noreferrer" aria-label={t('Deschide {label}', { label: label.toLowerCase() })}>
        {t('Poză')}
      </a>
    );
  }
  if (!urls) {
    return (
      <span className="thumb thumb-file" aria-hidden="true">
        {photo ? t('Poză') : 'PDF'}
      </span>
    );
  }
  return (
    <button type="button" className="thumb" onClick={() => onView(urls.full)} aria-label={t('Vezi {label}', { label: label.toLowerCase() })}>
      <img src={urls.small} alt={label} />
    </button>
  );
}
