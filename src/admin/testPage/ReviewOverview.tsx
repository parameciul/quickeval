import { Link } from 'react-router';
import type { TestInfo, UploadRow } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import { CesTag } from '../CesTag.tsx';
import { paperPath } from '../paperPage/paths.ts';
import { pointKey, reviewPath } from '../reviewPage/points.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { MoveOnLink } from './MoveOnLink.tsx';
import { baremRow, NowBox, ReadyList, StageSection, type ReadyRow } from './StageNow.tsx';

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
      Publici rezultatele la etapa <MoveOnLink stage="Rezultate">Rezultate</MoveOnLink>.
    </>
  );
  return (
    <>
      {total === 0 ? (
        <NowBox title="Nimic de verificat" done next={next}>
          <p className="now-sub">Lucrările corectate nu au puncte nesigure.</p>
        </NowBox>
      ) : left > 0 ? (
        <NowBox label="Acum · te așteaptă" title={`${countLabel(left, 'punct', 'puncte')} de verificat, la ${countLabel(waiting.length, 'elev', 'elevi')}`} next={next}>
          <span
            className="now-bar"
            role="progressbar"
            aria-label="Puncte verificate"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={checked}
          >
            <span style={{ width: `${Math.round((checked / total) * 100)}%` }} />
          </span>
          <p className="now-sub">
            {checked} din {countLabel(total, 'punct verificat', 'puncte verificate')}.
          </p>
          <div className="now-actions">
            <Link className="button" to={reviewPath(test.code)}>
              <ActionIcon name="search" />
              {checked === 0 ? 'Începe verificarea' : 'Continuă verificarea'}
            </Link>
          </div>
        </NowBox>
      ) : (
        <NowBox title={total === 1 ? 'Singurul punct de verificat e verificat' : `Toate cele ${countLabel(total, 'punct', 'puncte')} sunt verificate`} done next={next}>
          <p className="now-sub">Poți deschide oricând o lucrare, ca să schimbi un punctaj.</p>
        </NowBox>
      )}
      {waiting.length > 0 && (
        <StageSection title="De verificat" meta={`${countLabel(waiting.length, 'elev', 'elevi')} · clic pe un nume`}>
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
                    aria-label={`${row.studentName}${ces ? ', CES' : ''}: ${row.checkedCount} din ${all} verificate`}
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
        <StageSection title="Gata" meta={countLabel(done.length, 'elev', 'elevi')}>
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
    rows.push({ state: 'later', what: 'Testul început', value: 'nu încă: îl începi în ziua testului', stage: 'În clasă' });
  } else if (test.status === 'open') {
    rows.push({ state: 'wait', what: 'Corectarea', value: 'o pornești tu', stage: 'Corectare' });
  } else if (test.status === 'evaluating') {
    rows.push({ state: 'now', what: 'Corectarea', value: 'se corectează lucrările', stage: 'Corectare' });
  } else {
    // Done with no paper graded now: every paper failed or was set aside.
    rows.push({ state: 'wait', what: 'Corectarea', value: 's-a terminat fără nicio lucrare corectată', stage: 'Corectare' });
  }
  const of = test.status === 'draft' ? countLabel(test.studentCount, 'elev', 'elevi') : countLabel(test.submittedCount, 'lucrare trimisă', 'lucrări trimise');
  rows.push({ state: 'later', what: 'Lucrări corectate', value: `${test.gradedCount} din ${of}` });
  return (
    <>
      <NowBox
        label="Acum · verificarea nu a început"
        title="Verificarea începe după corectare"
        next={
          <>
            Publici rezultatele la etapa <MoveOnLink stage="Rezultate">Rezultate</MoveOnLink>.
          </>
        }
      >
        <ReadyList rows={rows} />
      </NowBox>
      <StageSection title="De verificat">
        <p className="stage-slot">Aici apar elevii cu puncte nesigure, după ce lucrările lor sunt corectate. Un clic pe nume deschide lucrarea la primul punct.</p>
      </StageSection>
    </>
  );
}

// CES as the other tables of the test show it: the student marked CES, or the
// paper graded on the CES variant.
function isCes(row: UploadRow): boolean {
  return row.ces || row.variant === 'ces';
}
