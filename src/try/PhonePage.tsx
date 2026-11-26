import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { QuickTryInfo, TestDetail } from '../../shared/api.ts';
import { EMPTY_FILE, TEACHER_FILE_TYPES, uploadTypeOf, type TestFileKind } from '../../shared/files.ts';
import { translateMessage } from '../../shared/i18n/messages.ts';
import { asksBaremAfterTest, parsePhoneParts, phonePartsOf, tryName, type PhonePart } from '../../shared/quickTry.ts';
import { useApi } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { ApiError } from '../ui/ApiError.ts';
import { countLabel, formatFileSize } from '../ui/format.ts';
import { MAX_PICTURES, PICTURE_TYPES, picturesToPdf, TEACHER_PICK_ACCEPT } from '../ui/picturesPdf.ts';
import { PagesUploader, type PagesApi } from '../upload/PagesUploader.tsx';
import { previewPhoto } from '../upload/shrink.ts';
import type { TryApi } from './api.ts';
import { fileChangesLeft, phaseOf } from './phase.ts';
import { Expired, isExpired } from './TryNotice.tsx';
import { t, tc } from '../i18n/t.ts';

// The phone page of a try (/try/<token>/phone): what the phone sends, with no
// result and no link to the try's page. The student's pages are sent like a
// student sends them; the test and the barem, when the address names them
// (`parts`, or what the try misses when it names none), come first, one step
// each, their photos kept on the phone and sent once as one PDF (each send is
// one of the try's file changes).
// The laptop is in charge: "Am terminat" writes nothing on the server.
// Opened by the form on the same phone (?here=1), that phone is the teacher's
// and is in charge itself: once the photos are done (or the paper went to
// grading) the page links to the try. Not while she takes them: a link there
// is a way out that stops the photos still waiting. Without the flag
// there is no link, but no lock either: the QR code holds the try's link.
export function PhonePage({ info, tryApi }: { info: QuickTryInfo; tryApi: TryApi }) {
  const [params] = useSearchParams();
  const here = params.get('here') === '1';
  const api = useApi();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['test', info.code], queryFn: () => api.getTest(info.code) });
  // Read when the page opens and after "Mai adaugă pagini" only: the uploader
  // reads `files` once and holds the list itself in between.
  const pages = useQuery({ queryKey: ['try', 'pages'], queryFn: () => tryApi.listPages(), refetchOnWindowFocus: false });
  const [done, setDone] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  // The server's word on a page refused because the grading started: the
  // read-only view keeps it.
  const [refused, setRefused] = useState<string | null>(null);
  // The steps, fixed when the page first reads the try: a part sent meanwhile
  // stays a step, now done.
  const [parts, setParts] = useState<PhonePart[] | null>(() => parsePhoneParts(params.get('parts')));
  if (parts === null && detail.data) setParts(phonePartsOf(detail.data.test));
  const [step, setStep] = useState(0);
  // A send of this step is on its way: "Înapoi" waits, so no photo is dropped
  // and no late answer moves the steps.
  const [busy, setBusy] = useState(false);

  const pagesApi = useMemo<PagesApi>(() => {
    // The grading started on the laptop meanwhile: the page turns read only,
    // with the pages read again and the server's word kept.
    const watchRefusal = async <T,>(call: () => Promise<T>): Promise<T> => {
      try {
        return await call();
      } catch (err) {
        if (err instanceof ApiError && err.code === 'paper_sent') {
          setRefused(err.message);
          void queryClient.invalidateQueries({ queryKey: ['try', 'pages'] });
          void queryClient.invalidateQueries({ queryKey: ['test', info.code] });
        }
        throw err;
      }
    };
    return {
      uploadFile: (file, name, onProgress) => watchRefusal(() => tryApi.uploadPage(file, name, onProgress)),
      deleteFile: (fileId) => watchRefusal(() => tryApi.deletePage(fileId)),
      fileBlob: (fileId) => tryApi.pageBlob(fileId),
    };
  }, [tryApi, queryClient, info.code]);

  if (detail.isPending || pages.isPending || parts === null) {
    if (isExpired(detail.error)) return <Expired />;
    if (detail.error) return <ErrorMessage error={detail.error} />;
    if (pages.error) return <ErrorMessage error={pages.error} />;
    return <p>{t('Se încarcă…')}</p>;
  }
  if (isExpired(detail.error)) return <Expired />;
  if (detail.data === undefined) return <ErrorMessage error={detail.error} />;
  if (pages.data === undefined) return <ErrorMessage error={pages.error} />;
  const title = tryName(detail.data.test.title);

  const phase = phaseOf(detail.data);
  if (phase !== 'prepare') {
    return (
      <section className="phone-page">
        <h1>{t('Lucrarea elevului')}</h1>
        <p className="phone-title">{title}</p>
        {refused && <p className="hint">{refused}</p>}
        <p className="alert">
          {phase === 'failed'
            ? t('Încercarea nu a mers. Continuă {v1}.', { v1: here ? t('pe pagina încercării') : t('pe calculator') })
            : t('Lucrarea a fost trimisă. Nu mai poți schimba paginile.')}
        </p>
        {here && (
          <Link className="button button-big" to="/">
            {t('Deschide încercarea')}
          </Link>
        )}
        <h3>{t('Paginile ({length})', { length: pages.data.length })}</h3>
        <ol className="page-list">
          {pages.data.map((page) => (
            <li key={page.id} className="page-item is-sent">
              <span className="page-info">
                <span className="page-name">{page.name}</span>
                <span className="hint">{formatFileSize(page.size)}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  const wizard = parts.length > 1 || parts[0] !== 'pages';
  const current = parts[Math.min(step, parts.length - 1)]!;
  const last = step >= parts.length - 1;

  if (done !== null) {
    const pagesSent = current === 'pages';
    return (
      <section className="phone-page phone-done">
        <span className="phone-tick" aria-hidden="true">
          ✓
        </span>
        <h1>{pagesSent ? t('Paginile au ajuns') : t('Pozele au ajuns')}</h1>
        {pagesSent ? (
          <p>
            {countLabel(done, 'pagină', 'pagini')} {done === 1 ? t('este') : t('sunt')} {here ? t('la încercare') : t('pe calculator')}.
          </p>
        ) : (
          <p>{here ? t('Sunt la încercare.') : t('Sunt pe calculator.')}</p>
        )}
        {here ? (
          <Link className="button button-big" to="/">
            {t('Deschide încercarea')}
          </Link>
        ) : (
          <p>{t('Continuă acolo.')}</p>
        )}
        <button
          type="button"
          className="button-quiet button-big"
          onClick={async () => {
            await pages.refetch();
            setRound((value) => value + 1);
            setDone(null);
          }}
        >
          {pagesSent ? t('Mai adaugă pagini') : t('Înapoi')}
        </button>
      </section>
    );
  }

  // To another step. The pages step reads the pages again: its uploader
  // holds the list it was given, and pages went meanwhile.
  const goTo = async (next: number) => {
    if (parts[next] === 'pages') {
      await pages.refetch();
      setRound((value) => value + 1);
    }
    setStep(next);
  };

  const back =
    wizard && step > 0 ? (
      <button type="button" className="button-quiet button-big phone-back" disabled={busy} onClick={() => void goTo(step - 1)}>
        <ActionIcon name="back" />
        {t('Înapoi')}
      </button>
    ) : null;

  return (
    <div className={wizard ? 'phone-page phone-steps' : 'phone-page'}>
      {wizard && <Steps parts={parts} step={step} detail={detail.data} />}
      {current === 'pages' ? (
        <>
          <PagesUploader
            key={round}
            pages={pagesApi}
            files={pages.data}
            heading={
              <>
                <h1>{t('Lucrarea elevului')}</h1>
                <p className="phone-title">{title}</p>
              </>
            }
            listTitle={t('Paginile')}
            finishLabel={t('Am terminat')}
            onFinish={(count) => setDone(count)}
            onBusy={setBusy}
          />
          {back}
        </>
      ) : (
        <TeacherStep
          key={`${current}-${round}`}
          kind={current}
          parts={parts}
          detail={detail.data}
          title={title}
          next={last ? null : parts[step + 1]!}
          onDone={() => (last ? setDone(0) : void goTo(step + 1))}
          onBusy={setBusy}
          back={back}
        />
      )}
    </div>
  );
}

const PART_NAMES: Record<PhonePart, () => string> = {
  test: () => t('Testul'),
  barem: () => t('Baremul'),
  pages: () => t('Lucrarea'),
};

// Where she is among the steps: done ones ticked (sent to the try), the
// current one marked.
function Steps({ parts, step, detail }: { parts: PhonePart[]; step: number; detail: TestDetail }) {
  const sent = (part: PhonePart) => part !== 'pages' && detail.test.files[part] !== null;
  return (
    <ol className="phone-strip" aria-label={t('Pașii')}>
      {parts.map((part, index) => (
        <li key={part} className={index === step ? 'is-now' : sent(part) ? 'is-done' : undefined} aria-current={index === step ? 'step' : undefined}>
          <span>
            {sent(part) && <ActionIcon name="check" />}
            {PART_NAMES[part]()}
            {sent(part) && <span className="sr-only"> {t('(trimis)')}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

const isPicture = (file: File) => PICTURE_TYPES.includes(uploadTypeOf(file));
const isDocument = (file: File) => TEACHER_FILE_TYPES.includes(uploadTypeOf(file));

// The test or the barem from the phone: photos taken one by one (kept here, in
// the order taken, which a phone's camera names do not give), or one PDF or
// Word file, sent once as one file. Once the try has it, the step says so and
// lets her take it again.
function TeacherStep({
  kind,
  parts,
  detail,
  title,
  next,
  onDone,
  onBusy,
  back,
}: {
  kind: TestFileKind;
  parts: PhonePart[];
  detail: TestDetail;
  title: string;
  next: PhonePart | null;
  onDone: () => void;
  onBusy: (busy: boolean) => void;
  back: ReactNode;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const arrived = detail.test.files[kind] !== null;
  const [again, setAgain] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [doc, setDoc] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const left = fileChangesLeft(detail);
  useEffect(() => {
    onBusy(sending);
  }, [sending, onBusy]);
  useEffect(() => () => onBusy(false), [onBusy]);
  // The test arrived but the barem made from it was not asked for (the
  // request failed): she asks again here.
  const baremLeft = kind === 'test' && arrived && asksBaremAfterTest(parts, detail.test);
  const askBarem = async () => {
    setError(null);
    setSending(true);
    try {
      await api.generateBarem(detail.test.code);
    } catch (err) {
      setError(err);
    } finally {
      setSending(false);
      void queryClient.invalidateQueries({ queryKey: ['test', detail.test.code] });
    }
  };
  const heading = kind === 'test' ? t('Testul') : t('Baremul');
  const nextName = next === null ? null : next === 'pages' ? t('lucrarea elevului') : t('baremul');

  const add = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (picked.length === 0) return;
    setProblem(null);
    if (picked.every(isPicture)) {
      if (photos.length + picked.length > MAX_PICTURES) return setProblem(t('Alege cel mult {pictures}.', { pictures: tc(MAX_PICTURES, 'poză', 'poze') }));
      if (picked.some((file) => file.size === 0)) return setProblem(translateMessage(EMPTY_FILE));
      setDoc(null);
      setPhotos([...photos, ...picked]);
    } else if (picked.length === 1 && isDocument(picked[0]!)) {
      setPhotos([]);
      setDoc(picked[0]!);
    } else {
      setProblem(t('Încarcă un fișier PDF sau Word (.docx), ori poze JPG, PNG sau WebP.'));
    }
  };

  const send = async () => {
    setError(null);
    setProblem(null);
    setSending(true);
    try {
      let file = doc;
      if (!file) {
        const made = await picturesToPdf(photos, `${heading}.pdf`);
        if ('problem' in made) {
          setProblem(made.problem);
          return;
        }
        file = made.file;
      }
      await api.uploadTestFile(detail.test.code, kind, file);
      // With no barem of her own, the barem is made from this test (the try asks once).
      if (kind === 'test' && asksBaremAfterTest(parts, detail.test)) await api.generateBarem(detail.test.code);
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setSending(false);
      void queryClient.invalidateQueries({ queryKey: ['test', detail.test.code] });
    }
  };

  if (arrived && !again) {
    return (
      <section className="phone-teacher">
        <h1>{heading}</h1>
        <p className="phone-title">{title}</p>
        <p className="phone-arrived" role="status">
          <ActionIcon name="check" />
          {kind === 'test' ? t('Testul a ajuns.') : t('Baremul a ajuns.')}
        </p>
        {error !== null && <ErrorMessage error={error} />}
        <div className="phone-foot">
          {baremLeft && (
            <button type="button" className="button button-big" disabled={sending} onClick={() => void askBarem()}>
              <ActionIcon name="generate" />
              {t('Fă baremul din test')}
            </button>
          )}
          <button type="button" className={baremLeft ? 'button-quiet button-big' : 'button button-big'} disabled={sending} onClick={onDone}>
            {nextName ? t('Continuă cu {next}', { next: nextName }) : t('Am terminat')}
            {nextName && <ActionIcon name="arrow" />}
          </button>
          {left > 0 && (
            <button type="button" className="button-quiet button-big" onClick={() => setAgain(true)}>
              <ActionIcon name="camera" />
              {t('Fă din nou pozele')}
            </button>
          )}
          {back}
        </div>
      </section>
    );
  }

  const count = doc ? 1 : photos.length;
  const sendLabel = kind === 'test' ? (nextName ? t('Trimite testul și continuă') : t('Trimite testul')) : nextName ? t('Trimite baremul și continuă') : t('Trimite baremul');
  return (
    <section className="phone-teacher">
      <h1>{heading}</h1>
      <p className="phone-title">{kind === 'test' ? t('Fotografiază toate paginile testului, în ordine.') : t('Fotografiază toate paginile baremului, în ordine.')}</p>
      <div className="big-actions">
        <label className="button button-big pick-button">
          <ActionIcon name="camera" />
          {t('Fă o poză')}
          <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={sending} onChange={add} />
        </label>
        <label className="button-quiet button-big pick-button">
          <ActionIcon name="upload" />
          {t('Alege fișiere')}
          <input type="file" accept={TEACHER_PICK_ACCEPT} multiple className="sr-only" disabled={sending} onChange={add} />
        </label>
      </div>
      <p className="hint">{t('Poze sau un fișier PDF ori Word.')}</p>
      {problem && (
        <p className="alert" role="alert">
          {problem}
        </p>
      )}
      {doc && (
        <ol className="page-list">
          <li className="page-item">
            <span className="thumb thumb-file" aria-hidden="true">
              {uploadTypeOf(doc) === 'application/pdf' ? 'PDF' : 'DOC'}
            </span>
            <span className="page-info">
              <span className="page-name">{doc.name}</span>
              <span className="hint">{formatFileSize(doc.size)}</span>
            </span>
            <span className="page-actions">
              <button type="button" className="button-quiet button-small" disabled={sending} onClick={() => setDoc(null)}>
                {t('Șterge')}
              </button>
            </span>
          </li>
        </ol>
      )}
      {photos.length > 0 && (
        <ol className="phone-shots" aria-label={t('Pozele ({length})', { length: photos.length })}>
          {photos.map((photo, index) => (
            <li key={`${index}-${photo.name}-${photo.size}`}>
              <Shot photo={photo} label={t('Poza {n}', { n: index + 1 })} />
              <button
                type="button"
                className="phone-shot-remove"
                aria-label={t('Șterge poza {n}', { n: index + 1 })}
                title={t('Șterge poza {n}', { n: index + 1 })}
                disabled={sending}
                onClick={() => setPhotos(photos.filter((_, other) => other !== index))}
              >
                <ActionIcon name="trash" />
              </button>
            </li>
          ))}
        </ol>
      )}
      {error !== null && <ErrorMessage error={error} />}
      <div className="phone-foot">
        <button type="button" className="button button-big" disabled={count === 0 || sending || left === 0} onClick={() => void send()}>
          {sending ? t('Se trimite…') : sendLabel}
          {!sending && nextName && <ActionIcon name="arrow" />}
        </button>
        {left === 0 && <p className="hint">{t('Nu mai poți schimba testul sau baremul în această încercare.')}</p>}
        {/* She may send this part later, from the laptop or the try's page. */}
        {!arrived && nextName && (
          <button type="button" className="button-quiet button-big" disabled={sending} onClick={onDone}>
            {t('Mai târziu')}
          </button>
        )}
        {arrived && (
          <button type="button" className="button-quiet button-big" disabled={sending} onClick={() => setAgain(false)}>
            {t('Renunță')}
          </button>
        )}
        {back}
      </div>
    </section>
  );
}

// A photo taken, made small for its preview: a phone's memory holds a few
// small pictures, not twenty camera photos decoded at once.
function Shot({ photo, label }: { photo: File; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let url: string | null = null;
    void previewPhoto(photo).then((small) => {
      if (!live) return;
      url = URL.createObjectURL(small);
      setSrc(url);
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo]);
  return src ? <img src={src} alt={label} /> : <span className="thumb-file">{label}</span>;
}
