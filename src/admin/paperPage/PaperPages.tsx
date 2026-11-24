import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { translateMessage } from '../../../shared/i18n/messages.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { countLabel, formatFileSize } from '../../ui/format.ts';
import { submissionFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { HELD_BACK_HINT, heldBack } from '../testPage/paperCounts.ts';
import { t } from '../../i18n/t.ts';

// The paper page of an upload with no result now (sending, sent, held back,
// waiting for the robot, graded now, failed): the teacher looks over the
// pages before the grading, so they take the middle of the page, all at once,
// under a box that says where the paper is and what comes next.

type NowTone = 'plain' | 'robot' | 'wait' | 'error';
type NowIconName = 'clock' | 'upload' | 'generate' | 'info';

// One compact row above the pages: an icon, a short title, one line, and at
// most one button on the right. Not the stages' "Acum" box: this page is not
// a stage of the test.
function NowRow({ icon, tone = 'plain', title, line, action }: { icon: NowIconName; tone?: NowTone; title: string; line: ReactNode; action?: ReactNode }) {
  return (
    <div className={`paper-now is-${tone}`}>
      <span className="paper-now-icon" aria-hidden="true">
        <ActionIcon name={icon} />
      </span>
      <div className="paper-now-text">
        <p className="paper-now-title">{title}</p>
        {line && <p className="paper-now-line">{line}</p>}
      </div>
      {action && <div className="paper-now-action">{action}</div>}
    </div>
  );
}

// Where an upload without a result is, and the one thing to do about it.
// `heldBackText` says why a held-back paper waits (`heldBackHint` of the
// account); `corectare` is the address of the test's Corectare, none on a
// Quick Try's page, whose grading starts on the try's own page; `sent` says
// how many students sent, for a paper that waits for the grading to start;
// `ces` says why a CES paper waits for its barem and where to see to it;
// `retry` is "Reîncearcă" of a failed paper.
export function PaperNow({
  submission,
  heldBackText,
  corectare,
  sent,
  ces,
  retry,
}: {
  submission: SubmissionDetail;
  heldBackText: string;
  corectare: string | null;
  sent: string | null;
  ces: { why: string; to: string } | null;
  retry: ReactNode;
}) {
  const toCorectare = (main: boolean) =>
    corectare !== null && (
      <Link className={main ? 'button' : 'button-quiet'} to={corectare}>
        {t('Mergi la Corectare')}
        <ActionIcon name="arrow" />
      </Link>
    );
  if (heldBack(submission.status, submission.files.length, submission.testStatus)) {
    return (
      <NowRow
        icon="info"
        tone="wait"
        title={t('Lucrarea nu a intrat la corectare')}
        line={heldBackText}
        // A demo account with no paper left cannot send it by reopening.
        action={heldBackText === HELD_BACK_HINT && toCorectare(false)}
      />
    );
  }
  if (submission.status === 'uploading') {
    const pages = submission.files.length;
    return (
      <NowRow
        icon="upload"
        title={t('Elevul încă trimite lucrarea')}
        line={pages === 0 ? t('Nicio pagină până acum.') : t('{pages} până acum.', { pages: countLabel(pages, 'pagină', 'pagini') })}
      />
    );
  }
  if (submission.status === 'failed') {
    return <NowRow icon="info" tone="error" title={t('Corectarea a eșuat')} line={submission.lastError && translateMessage(submission.lastError)} action={retry} />;
  }
  if (submission.status === 'grading') {
    return <NowRow icon="generate" tone="robot" title={t('Robotul corectează acum lucrarea')} line={t('Exercițiile apar aici când termină.')} />;
  }
  if (ces !== null) {
    return (
      <NowRow
        icon="info"
        tone="wait"
        title={t('Lucrarea așteaptă baremul CES')}
        line={ces.why}
        action={
          <Link className="button-quiet" to={ces.to}>
            {t('Mergi la varianta CES')}
            <ActionIcon name="arrow" />
          </Link>
        }
      />
    );
  }
  if (submission.testStatus === 'evaluating') {
    return <NowRow icon="clock" tone="robot" title={t('Lucrarea așteaptă robotul')} line={t('Pagina se actualizează singură.')} />;
  }
  if (corectare === null) {
    return <NowRow icon="clock" title={t('Lucrarea nu e corectată încă')} line={t('Corectarea pornește din pagina încercării.')} />;
  }
  return (
    <NowRow
      icon="clock"
      title={t('Lucrarea nu e corectată încă')}
      line={
        <>
          {t('Corectarea pornește pentru toată clasa, din etapa Corectare.')}
          {sent && ` ${sent}`}
        </>
      }
      action={toCorectare(true)}
    />
  );
}

// Every page of the paper at once, in the order the student sent them: a
// photo opens over the whole screen (`onOpen`, the paper's own viewer), a PDF
// in a tab of its own. Under them, the next student.
export function PaperPages({
  submission,
  onOpen,
  next,
}: {
  submission: SubmissionDetail;
  onOpen: (page: number) => void;
  next: ReactNode;
}) {
  const { base } = useApi();
  const files = submission.files;
  return (
    <section className="paper-pages" aria-labelledby="paper-pages-title">
      <div className="paper-pages-head">
        <h2 id="paper-pages-title">{t('Paginile lucrării')}</h2>
        <span className="tag" aria-hidden="true">
          {files.length}
        </span>
        <span className="hint paper-pages-order">{t('în ordinea trimisă de elev')}</span>
      </div>
      {files.length === 0 ? (
        <p className="hint">{t('Elevul nu a încărcat niciun fișier.')}</p>
      ) : (
        <ol className="paper-pages-grid">
          {files.map((file, index) => {
            const url = submissionFileUrl(submission.id, file.id, base);
            const photo = file.contentType.startsWith('image/');
            const kind = photo ? t('poză') : 'PDF'; // i18n-ignore
            return (
              <li key={file.id}>
                {photo ? (
                  <button type="button" className="paper-page-tile" data-page={index} aria-label={t('Pagina {n}, pe tot ecranul', { n: index + 1 })} onClick={() => onOpen(index)}>
                    <img src={url} alt="" loading="lazy" />
                    <span className="paper-page-number" aria-hidden="true">
                      {index + 1}
                    </span>
                  </button>
                ) : (
                  <a className="paper-page-tile is-pdf" data-page={index} href={url} target="_blank" rel="noopener" aria-label={t('Pagina {n}, PDF', { n: index + 1 })}>
                    <span aria-hidden="true">PDF</span>
                    <span className="paper-page-number" aria-hidden="true">
                      {index + 1}
                    </span>
                  </a>
                )}
                <p className="paper-page-caption">
                  <span>{t('Pagina {n}', { n: index + 1 })}</span>
                  <span className="hint">
                    {kind} · {formatFileSize(file.size)}
                  </span>
                </p>
              </li>
            );
          })}
        </ol>
      )}
      {next && <div className="paper-pages-foot">{next}</div>}
    </section>
  );
}
