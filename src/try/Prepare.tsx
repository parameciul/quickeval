import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import type { SubmissionFile, TestDetail } from '../../shared/api.ts';
import { PHONE_IDLE_TEXT, PHONE_MEDIA } from '../../shared/quickTry.ts';
import { fileProblem, MAX_STUDENT_FILES, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE, type TestFileKind } from '../../shared/files.ts';
import { testFileUrl } from '../admin/api.ts';
import { useApi } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { FileDrop } from '../admin/newTest/FileDrop.tsx';
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { formatFileSize } from '../ui/format.ts';
import { PhotoViewer } from '../upload/PhotoViewer.tsx';
import { previewPhoto } from '../upload/shrink.ts';
import { pageFileUrl, type TryApi } from './api.ts';
import { fileChangesLeft } from './phase.ts';
import { PhoneCode } from './PhoneCode.tsx';
import { usePagesWatch } from './usePagesWatch.ts';
import { t } from '../i18n/t.ts';

const PAGE_ACCEPT = [...STUDENT_FILE_TYPES, '.jpg', '.jpeg', '.png', '.webp', '.pdf'].join(',');

// Before the grading (spec §3.3, states 1 and 2): the test, the barem (her
// own, or the robot's, which she downloads and reads), and the student's
// pages, then "Pornește corectarea". The landing page's form sends these
// first; here she sends what is missing and may replace a file.
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

  return (
    <>
      <ol className="steps">
        <li className="step">
          <div>
            <h2>{t('Testul')}</h2>
            <p>{t('Testul așa cum l-ai tipărit, fără răspunsuri. PDF sau Word.')}</p>
            <TestFile code={test.code} kind="test" name={test.files.test?.name ?? null} disabled={left === 0} />
          </div>
        </li>
        <li className="step">
          <div>
            <h2>{t('Baremul')}</h2>
            <Barem detail={detail} robotBarem={robotBarem} disabled={left === 0} />
          </div>
        </li>
        <li className="step">
          <div>
            <h2>{t('Lucrarea elevului')}</h2>
            <p>{t('Pozele sau PDF-ul lucrării unui elev, în ordinea paginilor. Cel mult {MAX_STUDENT_FILES} de fișiere.', { MAX_STUDENT_FILES })}</p>
            <Pages token={token} tryApi={tryApi} />
          </div>
        </li>
      </ol>
      <p className="hint">
        {left === 0
          ? t('Nu mai poți schimba testul sau baremul în această încercare.')
          : t('Mai poți încărca testul și baremul de {left} ori în total. Baremul făcut de robot se numără și el o dată.', { left })}
      </p>
      <div className="card-actions">
        <button type="button" className="button" disabled={missing.length > 0 || start.isPending} onClick={() => start.mutate()}>
          <ActionIcon name="play" />
          {t('Pornește corectarea')}
        </button>
      </div>
      {missing.length > 0 && <p className="hint">{t('Lipsește: {join}.', { join: missing.join(', ') })}</p>}
      {start.error && <ErrorMessage error={start.error} />}
    </>
  );
}

function useUpload(code: string, kind: TestFileKind) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.uploadTestFile(code, kind, file),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['test', code] }),
  });
}

// A file of the test: its name opens it, and a new file replaces it.
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

// The barem: the robot's while it is made, then to download and read; her
// own file; or the choice of one of the two.
function Barem({ detail, robotBarem, disabled }: { detail: TestDetail; robotBarem: boolean; disabled: boolean }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { test } = detail;
  const generate = useMutation({
    mutationFn: () => api.generateBarem(test.code),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['test', test.code] }),
  });
  if (test.barem.request === 'requested') {
    return (
      <p role="status">{t('Robotul face baremul din test. Durează câteva minute; pagina se actualizează singură.')}</p>
    );
  }
  if (robotBarem) {
    return (
      <>
        <p role="status">
          <strong>{t('Baremul făcut de robot este gata.')}</strong>{' '}{t('Descarcă-l și citește-l. Corectarea pornește doar când apeși „Pornește corectarea”.')}
        </p>
        <p>
          <a className="button-quiet" href={testFileUrl(test.code, 'barem', undefined, api.base)} target="_blank" rel="noopener">
            <ActionIcon name="download" />
            {t('Descarcă baremul')}
          </a>
        </p>
        <p>{t('Dacă vrei, îl înlocuiești cu baremul tău:')}</p>
        <TestFile code={test.code} kind={'barem'} name={null} disabled={disabled} />
      </>
    );
  }
  if (test.files.barem !== null) {
    return (
      <>
        <p>{t('Baremul tău. PDF sau Word.')}</p>
        <TestFile code={test.code} kind={'barem'} name={test.files.barem.name} disabled={disabled} />
      </>
    );
  }
  return (
    <>
      <p>{t('Baremul după care se dă punctajul. PDF sau Word.')}</p>
      <TestFile code={test.code} kind={'barem'} name={null} disabled={disabled} />
      <p>{t('Nu ai un barem pregătit? Îl generezi automat din test, iar apoi îl citești înainte să pornești corectarea.')}</p>
      <button
        type="button"
        className="button-quiet"
        disabled={test.files.test === null || disabled || generate.isPending}
        onClick={() => generate.mutate()}
      >
        <ActionIcon name="generate" />
        {t('Fă baremul din test')}
      </button>
      {generate.error && <ErrorMessage error={generate.error} />}
    </>
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

  return (
    <>
      {list.length > 0 && (
        <ol className="page-list try-pages" aria-label={t('Paginile lucrării')}>
          {list.map((page, index) => (
            <li key={page.id} className="page-item">
              <PagePreview page={page} label={`Pagina ${index + 1}`} token={token} tryApi={tryApi} onView={(src) => setViewing({ id: page.id, src })} />
              <span className="page-info">
                <span className="page-name">{t('Pagina {v1}', { v1: index + 1 })}</span>
                <span className="hint">{formatFileSize(page.size)}</span>
              </span>
              <button
                type="button"
                className="button-quiet button-small"
                aria-label={t('Șterge pagina {v1}', { v1: index + 1 })}
                disabled={remove.isPending}
                onClick={() => remove.mutate(page.id)}
              >
                <ActionIcon name="trash" />
                <span className="try-page-remove">{t('Șterge')}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="try-page-actions">
        <label className={list.length >= MAX_STUDENT_FILES || add.isPending ? 'button-quiet is-disabled' : 'button-quiet'}>
          <ActionIcon name="upload" />
          {t('Adaugă pagini')}
          <input
            type="file"
            className="sr-only"
            accept={PAGE_ACCEPT}
            multiple
            disabled={list.length >= MAX_STUDENT_FILES || add.isPending}
            onChange={onPick}
          />
        </label>
        {onPhone ? (
          <Link className="button-quiet" to="/phone?here=1">
            <ActionIcon name="phone" />
            {t('Fă poze')}
          </Link>
        ) : (
          <button type="button" className="button-quiet" aria-expanded={phoneOpen} aria-controls="try-phone-code" onClick={() => setPhoneOpen((open) => !open)}>
            <ActionIcon name="phone" />
            {t('Fă poze cu telefonul')}
          </button>
        )}
      </div>
      {viewing && viewedIndex >= 0 && <PhotoViewer src={viewing.src} label={`Pagina ${viewedIndex + 1}`} onClose={() => setViewing(null)} />}
      {phoneOpen && <PhoneCode id="try-phone-code" token={token} />}
      <div aria-live="polite">
        {watch.idle && (
          <p className="hint">
            {PHONE_IDLE_TEXT}{' '}
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
      <a className="thumb thumb-file" href={pageFileUrl(token, page.id)} target="_blank" rel="noreferrer" aria-label={`Deschide ${label.toLowerCase()}`}>
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
    <button type="button" className="thumb" onClick={() => onView(urls.full)} aria-label={`Vezi ${label.toLowerCase()}`}>
      <img src={urls.small} alt={label} />
    </button>
  );
}
