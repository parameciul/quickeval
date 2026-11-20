import { useIsMutating, useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { TestInfo } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { MoveOnLink } from './MoveOnLink.tsx';
import { NowBox, ReadyList, RESULTS_OPEN, StageSection, SwitchBand, type ReadyRow } from './StageNow.tsx';
import { CopiedNote, copyLink, QrWindow, type Copied } from './WaysIn.tsx';
import { QrDownload, QrOverlay, uploadLink } from './UploadLink.tsx';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { t } from '../../i18n/t.ts';

// Whether a test has results to publish or to stop: something is graded, or
// results are already open (for all, or for single uploads). Before that the
// teacher has nothing to decide, so the panel shows no button.
export function hasResultsToManage(test: Pick<TestInfo, 'status' | 'gradedCount' | 'resultsOpen' | 'publishedCount'>): boolean {
  return test.status !== 'draft' && (test.gradedCount > 0 || test.resultsOpen || test.publishedCount > 0);
}

// Rezultate before there is anything to publish: the same "Acum" box as the
// other stages, with what the results wait for. The students' table and the
// class report stay under it, in their place.
function NoResultsYet({ test }: { test: TestInfo }) {
  const rows: ReadyRow[] = [];
  if (test.status === 'draft') rows.push({ state: 'later', what: t('Testul început'), value: t('nu încă: îl începi în ziua testului'), stage: 'În clasă' });
  rows.push({
    state: 'later',
    what: t('Lucrări corectate'),
    value: t('{gradedCount} din {countLabel}', { gradedCount: test.gradedCount, countLabel: countLabel(test.studentCount, 'elev', 'elevi') }),
    stage: test.status === 'draft' ? undefined : 'Corectare',
  });
  return (
    <NowBox label={t('Acum · nimic de publicat')} title={t('Rezultatele se publică după corectare')}>
      <ReadyList rows={rows} />
    </NowBox>
  );
}

// The "Acum" box of Rezultate: a band with the switch that publishes the
// results of every student at once, or stops them, then how the students find
// their results, as În clasă lists how they send their work. Closing also takes
// back the results published alone (the API does it), so it closes every link.
export function ResultsAccess({ test, onChanged }: { test: TestInfo; onChanged: () => Promise<void> }) {
  const api = useApi();
  // While it saves, the switch already shows the state asked for: the answer
  // and the test read again after it take a moment. The test page shows that
  // state everywhere meanwhile (`useShownDetail`).
  const toggle = useMutation({
    mutationKey: [RESULTS_OPEN, test.code],
    mutationFn: (open: boolean) => api.setResultsOpen(test.code, open),
    onSuccess: onChanged,
  });
  // A save started before the band was drawn again still counts.
  const saving = useIsMutating({ mutationKey: [RESULTS_OPEN, test.code] }) > 0;
  // Stopping the results of a test with nothing graded leaves nothing to
  // manage: the switch goes, so its focus goes to the panel's heading. Only
  // after this switch's own stop, never after a refresh from elsewhere.
  const managing = hasResultsToManage(test);
  const stopped = useRef(false);
  useEffect(() => {
    if (!stopped.current || managing) return;
    stopped.current = false;
    if (document.activeElement === document.body) document.querySelector<HTMLElement>('.stage-head h2')?.focus({ preventScroll: true });
  }, [managing]);
  if (!managing) return <NoResultsYet test={test} />;

  const open = toggle.isPending ? toggle.variables : test.resultsOpen;
  // Results published alone, while the class's are not.
  const some = !open && test.publishedCount > 0 && !toggle.isPending;
  const band = (
    <SwitchBand
      on={open}
      name={t('Rezultatele elevilor')}
      onWord={t('Publicate')}
      offWord={t('Nepublicate')}
      pending={saving}
      onToggle={() => {
        stopped.current = open;
        toggle.mutate(!open);
      }}
      text={
        open ? (
          <>
            <strong>{t('Rezultatele sunt publicate.')}</strong>{' '}{t('Elevii le văd.')}
          </>
        ) : some ? (
          <>
            <strong>{countLabel(test.publishedCount, 'rezultat publicat', 'rezultate publicate')}.</strong>{' '}{t('Ceilalți elevi nu le văd încă.')}
          </>
        ) : (
          <>
            <strong>{t('Rezultatele nu sunt publicate.')}</strong>{' '}{t('Elevii nu le văd.')}
          </>
        )
      }
    />
  );
  const readers = open ? test.gradedCount : test.publishedCount;
  // Open for all while no paper is graded now: while the robot grades, every
  // paper is graded again; else (all reset, or all failed) none has a result.
  const noneGraded = open && readers === 0;
  return (
    <>
      <NowBox
        band={band}
        title={
          noneGraded
            ? t('Nicio lucrare nu e corectată acum')
            : open || some
              ? t('{countLabel} vedea rezultatul', { countLabel: countLabel(readers, 'elev își poate', 'elevi își pot') })
              : t('{countLabel} de publicat', { countLabel: countLabel(test.gradedCount, 'rezultat gata', 'rezultate gata') })
        }
      >
        {noneGraded ? (
          <p className="now-sub">
            {test.status === 'evaluating'
              ? t('Lucrările se corectează din nou. Fiecare elev își vede rezultatul după ce lucrarea lui e corectată.')
              : t('Când o lucrare e corectată, elevul își vede rezultatul pe linkul lui.')}
          </p>
        ) : !open && test.flagCount > 0 ? (
          <p className="publish-wait">
            {t('Mai ai')}{' '}{countLabel(test.flagCount, 'punct de verificat', 'puncte de verificat')}{' '}{t('la etapa')}{' '}
            <MoveOnLink stage="Verificare">{t('Verificare')}</MoveOnLink>{t('. Dacă publici acum, elevii văd punctajul de acum.')}
          </p>
        ) : (
          <p className="now-sub">
            {open
              ? t('Dacă oprești rezultatele, linkurile cu rezultate și pozele lor nu se mai deschid până le publici din nou.')
              : t('Când le publici, fiecare elev își vede rezultatul pe linkul lui.')}
          </p>
        )}
      </NowBox>
      {toggle.error && <ErrorMessage error={toggle.error} />}
      <ResultWays test={test} published={open || some} />
    </>
  );
}

// How the students find their results, in the rows of În clasă's ways: the
// result link and the ticket they got after sending, and the test's own link
// or QR code (the phone that sent goes straight to the result, any other one
// asks for the ticket's code). The teacher has each student's link and code in
// the table "Elevii". No address and no QR code show on the page: the QR code
// opens in a window, with its file and the whole screen.
function ResultWays({ test, published }: { test: TestInfo; published: boolean }) {
  const [shown, setShown] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [copied, setCopied] = useState<Copied>(null);
  const qrButton = useRef<HTMLButtonElement>(null);
  const url = test.uploadToken === null ? null : uploadLink(test.uploadToken);
  return (
    <StageSection title={published ? t('Cum își văd elevii rezultatul') : t('Cum își vor vedea elevii rezultatul')}>
      <ul className="ways is-results">
        <li>
          <span className="ways-icon" aria-hidden="true">
            <ActionIcon name="phone" />
          </span>
          <div className="ways-text">
            <strong>{t('Cu linkul sau biletul primit după trimitere')}</strong>
            <span>
              {t('După ce își trimit lucrarea, elevii primesc pe telefon linkul rezultatului și biletul pentru rezultat (cu un cod QR și un cod scurt). Le deschid oricând.')}
            </span>
            <ul className="ways-cases">
              <li>
                <ActionIcon name="person" />
                <span>{t('Linkul fiecărui elev îl ai și tu, în tabelul „Elevii” de mai jos: îl copiezi și i-l trimiți.')}</span>
              </li>
            </ul>
          </div>
        </li>
        <li>
          <span className="ways-icon" aria-hidden="true">
            <ActionIcon name="qr" />
          </span>
          <div className="ways-text">
            <strong>{t('Cu linkul sau codul QR al testului')}</strong>
            <span>{t('Același link și același cod QR de pe foaia testului, cu care au trimis lucrarea.')}</span>
            <ul className="ways-cases">
              <li>
                <ActionIcon name="phone" />
                <span>
                  <b>{t('De pe telefonul cu care au trimis:')}</b>{' '}{t('ajung direct la rezultat. Linkul rezultatului s-a salvat singur pe telefon.')}
                </span>
              </li>
              <li>
                <ActionIcon name="key" />
                <span>
                  <b>{t('De pe alt telefon sau calculator:')}</b>{' '}{t('scriu codul de pe bilet. Codul fiecărui elev îl găsești în tabelul „Elevii” de mai jos.')}
                </span>
              </li>
            </ul>
          </div>
          {url !== null && (
            <div className="ways-buttons">
              <button
                type="button"
                className="button-quiet button-small"
                onClick={() => copyLink(() => url).then(() => setCopied('yes'), () => setCopied('failed'))}
              >
                <ActionIcon name="copy" />
                {t('Copiază linkul')}
              </button>
              <button ref={qrButton} type="button" className="button-quiet button-small" onClick={() => setShown(true)}>
                <ActionIcon name="qr" />
                {t('Arată codul QR')}
              </button>
              <CopiedNote copied={copied} />
            </div>
          )}
        </li>
      </ul>
      {shown && url !== null && (
        <QrWindow
          title={t('Linkul testului pentru elevi')}
          hint={t('Elevul scanează codul cu telefonul cu care a trimis lucrarea și își vede rezultatul.')}
          url={url}
          extra={<QrDownload url={url} fileName={t('cod-qr-elevi-{code}.png', { code: test.code })} />}
          returnFocus={qrButton}
          fullScreen={() => {
            setShown(false);
            setFullScreen(true);
          }}
          onClose={() => setShown(false)}
        />
      )}
      {fullScreen && url !== null && (
        <QrOverlay
          url={url}
          onClose={() => {
            setFullScreen(false);
            qrButton.current?.focus();
          }}
        />
      )}
    </StageSection>
  );
}
