import { Link } from 'react-router';
import type { TestInfo, UploadRow } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import { CesTag } from '../CesTag.tsx';
import { paperPath } from '../paperPage/paths.ts';
import { pointKey, reviewPath } from '../reviewPage/points.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { MoveOnLink } from './MoveOnLink.tsx';
import { baremRow, NowBox, ReadyList, StageSection, type ReadyRow } from './StageNow.tsx';
import { t } from '../../i18n/t.ts';

// The graded papers that had points to check, in the class order (by name):
// all their points, those checked, those left, and the papers with points
// left and those done.
function reviewCounts(uploads: UploadRow[]) {
  const counted = uploads.filter(
    (row): row is UploadRow & { submissionId: number } =>
      row.status === 'graded' && row.submissionId !== null && row.flagCount + row.checkedCount > 0,
  );
  const total = counted.reduce((sum, row) => sum + row.flagCount + row.checkedCount, 0);
  const checked = counted.reduce((sum, row) => sum + row.checkedCount, 0);
  return {
    total,
    checked,
    left: total - checked,
    waiting: counted.filter((row) => row.flagCount > 0),
    done: counted.filter((row) => row.flagCount === 0),
  };
}

// The panel shows the overview once a paper is graded.
export function showsOverview(test: TestInfo): boolean {
  return test.status !== 'draft' && test.gradedCount > 0;
}

// The panel Verificare as an overview of the check: the "Acum" box with how
// far it is and one button into the paper page at the first point left, then a
// label per student with points (those left first, then those done). The
// points themselves are decided on the paper page; the papers table is in
// În clasă and Corectare.
export function ReviewOverview({ test, uploads }: { test: TestInfo; uploads: UploadRow[] }) {
  const { total, checked, left, waiting, done } = reviewCounts(uploads);
  const next = (
    <>
      {t('Publici rezultatele la etapa')}{' '}<MoveOnLink stage="Rezultate">{'Rezultate'}</MoveOnLink>.
    </>
  );
  return (
    <>
      {total === 0 ? (
        <NowBox title={t('Nimic de verificat')} done next={next}>
          <p className="now-sub">{t('Lucrările corectate nu au puncte nesigure.')}</p>
        </NowBox>
      ) : left > 0 ? (
        <NowBox label={t('Acum · te așteaptă')} title={t('{countLabel} de verificat, la {countLabel2}', { countLabel: countLabel(left, 'punct', 'puncte'), countLabel2: countLabel(waiting.length, 'elev', 'elevi') })} next={next}>
          <span
            className="now-bar"
            role="progressbar"
            aria-label={t('Puncte verificate')}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={checked}
          >
            <span style={{ width: `${Math.round((checked / total) * 100)}%` }} />
          </span>
          <p className="now-sub">
            {t('{checked} din {countLabel}.', { checked, countLabel: countLabel(total, 'punct verificat', 'puncte verificate') })}</p>
          <div className="now-actions">
            <Link className="button" to={reviewPath(test.code)}>
              <ActionIcon name="search" />
              {checked === 0 ? t('Începe verificarea') : t('Continuă verificarea')}
            </Link>
          </div>
        </NowBox>
      ) : (
        <NowBox title={total === 1 ? t('Singurul punct de verificat e verificat') : t('Toate cele {countLabel} sunt verificate', { countLabel: countLabel(total, 'punct', 'puncte') })} done next={next}>
          <p className="now-sub">{t('Poți deschide oricând o lucrare, ca să schimbi un punctaj.')}</p>
        </NowBox>
      )}
      {waiting.length > 0 && (
        <StageSection title={t('De verificat')} meta={t('{countLabel} · clic pe un nume', { countLabel: countLabel(waiting.length, 'elev', 'elevi') })}>
          <ul className="review-chips">
            {waiting.map((row) => {
              const all = row.flagCount + row.checkedCount;
              const ces = isCes(row);
              // The first point left; a row read before its points (a cache a
              // moment old) opens the paper at its first point all the same.
              const first = row.reviewPoints[0];
              return (
                <li key={row.submissionId}>
                  <Link
                    className="review-chip is-wait"
                    to={reviewPath(test.code, { submissionId: row.submissionId, key: first ? pointKey(first) : null })}
                    aria-label={t('{studentName}{v2}: {checkedCount} din {all} verificate', { studentName: row.studentName, v2: ces ? ', CES' : '', checkedCount: row.checkedCount, all })}
                  >
                    {row.studentName}
                    {ces && <CesTag />}{' '}
                    <span className="tag tag-wait">
                      {row.checkedCount}/{all}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </StageSection>
      )}
      {done.length > 0 && (
        <StageSection title={t('Gata')} meta={countLabel(done.length, 'elev', 'elevi')}>
          <ul className="review-chips">
            {done.map((row) => (
              <li key={row.submissionId}>
                <Link className="review-chip is-done" to={paperPath(test.code, 'app', { submissionId: row.submissionId, key: null }, 'all')}>
                  <span aria-hidden="true">✓</span> {row.studentName}
                  {isCes(row) && <CesTag />}
                </Link>
              </li>
            ))}
          </ul>
        </StageSection>
      )}
    </>
  );
}

// Verificare before a paper is graded: the same "Acum" box, with what the
// check waits for, and the two lists' places kept with one sentence each.
export function ReviewWaits({ test }: { test: TestInfo }) {
  const rows: ReadyRow[] = [];
  if (test.status === 'draft') {
    const barem = baremRow(test);
    if (barem.state !== 'done') rows.push(barem);
    rows.push({ state: 'later', what: t('Testul început'), value: t('nu încă: îl începi în ziua testului'), stage: 'În clasă' });
  } else if (test.status === 'open') {
    rows.push({ state: 'later', what: t('Corectarea'), value: t('o pornești tu'), stage: 'Corectare' });
  } else if (test.status === 'evaluating') {
    rows.push({ state: 'now', what: t('Corectarea'), value: t('se corectează lucrările'), stage: 'Corectare' });
  } else {
    // Done with no paper graded now: every paper failed or was set aside. The
    // stage list ticks Corectare, so the row does too.
    rows.push({ state: 'done', what: t('Corectarea'), value: t('s-a terminat fără nicio lucrare corectată'), stage: 'Corectare' });
  }
  const of = test.status === 'draft' ? countLabel(test.studentCount, 'elev', 'elevi') : countLabel(test.submittedCount, 'lucrare trimisă', 'lucrări trimise');
  rows.push({ state: 'later', what: t('Lucrări corectate'), value: t('{gradedCount} din {of}', { gradedCount: test.gradedCount, of }) });
  return (
    <>
      <NowBox
        label={t('Acum · verificarea nu a început')}
        title={t('Verificarea începe după corectare')}
        next={
          <>
            {t('Publici rezultatele la etapa')}{' '}<MoveOnLink stage="Rezultate">{'Rezultate'}</MoveOnLink>.
          </>
        }
      >
        <ReadyList rows={rows} />
      </NowBox>
      <StageSection title={t('De verificat')}>
        <p className="stage-slot">{t('Aici apar elevii cu puncte nesigure, după ce lucrările lor sunt corectate. Un clic pe nume deschide lucrarea la primul punct.')}</p>
      </StageSection>
    </>
  );
}

// CES as the other tables of the test show it: the student marked CES, or the
// paper graded on the CES variant.
function isCes(row: UploadRow): boolean {
  return row.ces || row.variant === 'ces';
}
