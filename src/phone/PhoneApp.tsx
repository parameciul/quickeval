import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import {
  asksBaremAfter,
  isCesPart,
  missingPhoneParts,
  parsePhoneAsk,
  type PhoneAsk,
  type PhoneLinkInfo,
  type TestPhonePart,
} from '../../shared/testPhone.ts';
import { CesTag } from '../admin/CesTag.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { BrandMark } from '../ui/BrandMark.tsx';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import { LangButton } from '../ui/LangButton.tsx';
import { ThemeButton } from '../ui/ThemeButton.tsx';
import { PhotoSend } from '../upload/PhotoSend.tsx';
import type { PhoneApi } from './api.ts';
import { t } from '../i18n/t.ts';

// A teacher's phone page (/phone/<token>): the test and the barem, the class
// ones and the CES ones, photographed with a phone that is not logged in. The
// address names the parts (`parts`; without it, what the test misses) and the
// barems to ask for once their test arrived (`from-test`). One step per part,
// its photos kept on the phone and sent once as one PDF. Opened on the phone
// that made the test (`here=1`), its last screen links to the test.
export function PhoneApp({ token, api }: { token: string | null; api: PhoneApi }) {
  return (
    <>
      <header className="topbar try-topbar">
        <a className="brand" href="/" aria-label={t('MQGrader by Laura Miron')}>
          <BrandMark />
          <span className="brand-text">
            <span className="brand-name">MQGrader</span>
            <span className="brand-by">by Laura Miron</span>
          </span>
        </a>
        <div className="topbar-tools">
          <LangButton />
          <ThemeButton />
        </div>
      </header>
      <main className="try-page">
        <ErrorBoundary>
          {token === null ? (
            <p className="alert" role="alert">
              {t('Linkul nu este bun. Scanează din nou codul de pe calculator.')}
            </p>
          ) : (
            <PhoneSteps api={api} />
          )}
        </ErrorBoundary>
      </main>
    </>
  );
}

const PART_TITLES: Record<TestPhonePart, () => string> = {
  test: () => t('Testul'),
  barem: () => t('Baremul'),
  cesTest: () => t('Testul CES'),
  cesBarem: () => t('Baremul CES'),
};
const PART_NAMES: Record<TestPhonePart, () => string> = {
  test: () => t('testul'),
  barem: () => t('baremul'),
  cesTest: () => t('testul CES'),
  cesBarem: () => t('baremul CES'),
};

function PhoneSteps({ api }: { api: PhoneApi }) {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const here = params.get('here') === '1';
  const info = useQuery({ queryKey: ['phone', 'info'], queryFn: () => api.info() });
  // The steps, fixed when the page first reads the test: a part sent
  // meanwhile stays a step, now done.
  const [ask, setAsk] = useState<PhoneAsk | null>(() => parsePhoneAsk(params));
  if (ask === null && info.data) setAsk({ parts: missingPhoneParts(info.data), fromTest: [] });
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  // A send of this step is on its way: "Înapoi" waits.
  const [busy, setBusy] = useState(false);

  if (info.data === undefined || ask === null) {
    return info.error ? <ErrorMessage error={info.error} /> : <p>{t('Se încarcă…')}</p>;
  }
  const test = info.data;
  const testName = `${test.title} · ${test.className}`;

  if (ask.parts.length === 0) {
    return (
      <section className="phone-page phone-done">
        <h1>{t('Nu lipsește nimic')}</h1>
        <p className="phone-title">{testName}</p>
        <p>{t('Testul și baremul sunt deja la test.')}</p>
        {here && <TestLink code={test.code} />}
      </section>
    );
  }

  if (done) {
    return (
      <section className="phone-page phone-done">
        <span className="phone-tick" aria-hidden="true">
          ✓
        </span>
        <h1>{t('Pozele au ajuns')}</h1>
        <p>{here ? t('Sunt la test.') : t('Sunt pe calculator.')}</p>
        {here ? <TestLink code={test.code} /> : <p>{t('Continuă acolo.')}</p>}
        <button type="button" className="button-quiet button-big" onClick={() => setDone(false)}>
          {t('Înapoi')}
        </button>
      </section>
    );
  }

  const parts = ask.parts;
  const current = parts[Math.min(step, parts.length - 1)]!;
  const last = step >= parts.length - 1;
  const wizard = parts.length > 1;
  const back =
    wizard && step > 0 ? (
      <button type="button" className="button-quiet button-big phone-back" disabled={busy} onClick={() => setStep(step - 1)}>
        <ActionIcon name="back" />
        {t('Înapoi')}
      </button>
    ) : null;

  return (
    <div className={wizard ? 'phone-page phone-steps' : 'phone-page'}>
      {wizard && (
        <ol className="phone-strip" aria-label={t('Pașii')}>
          {parts.map((part, index) => (
            <li key={part} className={index === step ? 'is-now' : test.files[part] ? 'is-done' : undefined} aria-current={index === step ? 'step' : undefined}>
              <span>
                {test.files[part] && <ActionIcon name="check" />}
                {PART_TITLES[part]()}
                {test.files[part] && <span className="sr-only"> {t('(trimis)')}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      <PartStep
        key={current}
        api={api}
        part={current}
        ask={ask}
        info={test}
        testName={testName}
        next={last ? null : parts[step + 1]!}
        onDone={() => (last ? setDone(true) : setStep(step + 1))}
        onBusy={setBusy}
        back={back}
      />
    </div>
  );
}

function TestLink({ code }: { code: string }) {
  return (
    <a className="button button-big" href={`/teacher/tests/${encodeURIComponent(code)}#prepare`}>
      {t('Deschide testul')}
    </a>
  );
}

// One part: its photos and their send, or, once the test has it, that it
// arrived, with the photos to take again.
function PartStep({
  api,
  part,
  ask,
  info,
  testName,
  next,
  onDone,
  onBusy,
  back,
}: {
  api: PhoneApi;
  part: TestPhonePart;
  ask: PhoneAsk;
  info: PhoneLinkInfo;
  testName: string;
  next: TestPhonePart | null;
  onDone: () => void;
  onBusy: (busy: boolean) => void;
  back: ReactNode;
}) {
  const queryClient = useQueryClient();
  const arrived = info.files[part];
  const [again, setAgain] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    onBusy(asking);
  }, [asking, onBusy]);
  const reread = () => queryClient.invalidateQueries({ queryKey: ['phone', 'info'] });
  const baremPart = part === 'test' ? 'barem' : part === 'cesTest' ? 'cesBarem' : null;
  // The test arrived but the barem made from it was not asked for (the request
  // was refused): she asks again here.
  const baremLeft = arrived && asksBaremAfter(part, ask, info);
  const askBarem = async () => {
    if (!baremPart) return;
    setError(null);
    setAsking(true);
    try {
      await api.generateBarem(info.code, baremPart);
    } catch (err) {
      setError(err);
    } finally {
      setAsking(false);
      void reread();
    }
  };

  const send = async (file: File) => {
    try {
      await api.send(info.code, part, file);
      // "Din test": the barem is asked for once its test is there. A refusal
      // shows on the step of the test that arrived.
      if (baremPart && asksBaremAfter(part, ask, info)) {
        try {
          await api.generateBarem(info.code, baremPart);
        } catch (err) {
          setError(err);
          return;
        }
      }
      onDone();
    } finally {
      void reread();
    }
  };

  const heading = (
    <>
      <h1>
        {PART_TITLES[part]()}
        {isCesPart(part) && <CesTag />}
      </h1>
      <p className="phone-title">{testName}</p>
    </>
  );
  const nextLabel = next ? t('Continuă cu {next}', { next: PART_NAMES[next]() }) : t('Am terminat');

  if (arrived && !again) {
    return (
      <section className="phone-teacher">
        {heading}
        <p className="phone-arrived" role="status">
          <ActionIcon name="check" />
          {t('{part} a ajuns.', { part: PART_TITLES[part]() })}
        </p>
        {error !== null && <ErrorMessage error={error} />}
        <div className="phone-foot">
          {baremLeft && (
            <button type="button" className="button button-big" disabled={asking} onClick={() => void askBarem()}>
              <ActionIcon name="generate" />
              {t('Fă baremul din test')}
            </button>
          )}
          <button type="button" className={baremLeft ? 'button-quiet button-big' : 'button button-big'} disabled={asking} onClick={onDone}>
            {nextLabel}
            {next && <ActionIcon name="arrow" />}
          </button>
          <button type="button" className="button-quiet button-big" onClick={() => setAgain(true)}>
            <ActionIcon name="camera" />
            {t('Fă din nou pozele')}
          </button>
          {back}
        </div>
      </section>
    );
  }

  const isTest = part === 'test' || part === 'cesTest';
  return (
    <section className="phone-teacher">
      {heading}
      <p>{isTest ? t('Fotografiază toate paginile testului, în ordine.') : t('Fotografiază toate paginile baremului, în ordine.')}</p>
      <PhotoSend
        pdfName={`${PART_TITLES[part]()}.pdf`}
        sendLabel={next ? t('Trimite și continuă') : t('Trimite')}
        arrow={next !== null}
        locked={null}
        onSend={send}
        onBusy={onBusy}
      >
        {(sending) => (
          <>
            {!arrived && next && (
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
          </>
        )}
      </PhotoSend>
    </section>
  );
}
