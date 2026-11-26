import { Fragment, useId, type ReactNode } from 'react';
import type { TestInfo, UploadRow } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { formatDateTime, pointsLevel, studentCountLabel } from '../../ui/format.ts';
import { StatusChip } from '../StatusChip.tsx';
import { subjectLine } from './SubjectForm.tsx';
import { PAPER_PART_LABEL, paperCounts } from './paperCounts.ts';
import { cesBaremActive } from './variant.ts';
import { t } from '../../i18n/t.ts';

// The barem in a few words. Not its points: the API knows them only after the
// grading starts.
export function baremState(test: Pick<TestInfo, 'files' | 'barem'>): string {
  const { request, unchecked } = test.barem;
  if (request === 'requested') return t('se generează');
  if (test.files.barem === null || unchecked) {
    if (request === 'failed') return t('nu s-a putut genera');
    return test.files.barem === null ? t('lipsește') : t('de verificat');
  }
  return t('activ');
}

// The students sending their papers now: an upload with files, not sent yet.
export function uploadingNow(uploads: UploadRow[]): number {
  return uploads.filter((row) => row.status === 'uploading' && row.fileCount > 0).length;
}

// "Fișa testului" (spec 2026-11-15 §2): the state, two numbers that change with
// the state of the test, once the uploads closed where the papers are
// ("Lucrările"), and the plain facts. It shows beside every stage; the
// files are in Pregătire and Tipărire, the students' link in În clasă, the
// test's actions in "Acțiuni" (`TestMenu.tsx`).
export function TestSheet({ test, uploads }: { test: TestInfo; uploads: UploadRow[] }) {
  const id = useId();
  const sent = (
    <Tile label={t('Au trimis')} of={test.studentCount} bar>
      {test.submittedCount}
    </Tile>
  );
  let tiles: ReactNode;
  if (test.status === 'draft') {
    tiles = (
      <>
        <Tile label={t('Elevi')}>{test.studentCount}</Tile>
        <Tile label={t('Baremul')}>{baremState(test)}</Tile>
      </>
    );
  } else if (test.status === 'open') {
    tiles = (
      <>
        {sent}
        <Tile label={t('Încarcă acum')}>{uploadingNow(uploads)}</Tile>
      </>
    );
  } else {
    tiles = (
      <>
        {sent}
        {test.averageGrade !== null ? (
          <Tile label={t('Media testului')} level={pointsLevel(test.averageGrade, 10)}>
            {formatPoints(test.averageGrade)}
          </Tile>
        ) : (
          <Tile label={t('Corectate')} of={test.submittedCount}>
            {test.gradedCount}
          </Tile>
        )}
      </>
    );
  }

  return (
    <section className="test-sheet" aria-labelledby={id}>
      <div className="sheet-head">
        <h2 id={id}>{t('Fișa testului')}</h2>
        <span className="sheet-tags">
          {test.status === 'open' && test.uploadsClosedAt !== null ? (
            <span className="status status-draft">{t('Încărcare închisă')}</span>
          ) : (
            <StatusChip status={test.status} />
          )}
          {test.archived && <span className="tag">{t('Arhivat')}</span>}
        </span>
      </div>
      <dl className="sheet-tiles">{tiles}</dl>
      {(test.status === 'evaluating' || test.status === 'done') && <SheetPapers test={test} uploads={uploads} />}
      <dl className="sheet-facts">
        <dt>{t('Clasa')}</dt>
        <dd>
          {displayClassName(test.className)} · {studentCountLabel(test.studentCount)}
        </dd>
        <dt>{t('Codul')}</dt>
        <dd>{test.code}</dd>
        <dt>{t('Materia')}</dt>
        <dd>{subjectLine(test)}</dd>
        {test.startedAt && (
          <>
            <dt>{t('Început')}</dt>
            <dd>{formatDateTime(test.startedAt)}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

// "Lucrările": each part of the papers that has a student (corectate, se
// corectează, nu au participat, …) and its count, each after a dot of its
// colour: the blue of the "Acum" box's bar for the graded ones, a paler blue
// for the ones being graded, a hollow ring for the students who did not take
// part. The dot only repeats the words.
function SheetPapers({ test, uploads }: { test: TestInfo; uploads: UploadRow[] }) {
  const id = useId();
  const { parts } = paperCounts(test.status, test.studentCount, uploads, { hasTest: test.ces.files.test !== null, baremActive: cesBaremActive(test) });
  if (parts.length === 0) return null;
  return (
    <div className="sheet-papers">
      <h3 id={id}>{t('Lucrările')}</h3>
      <dl className="sheet-facts" aria-labelledby={id}>
        {parts.map(({ part, count }) => (
          <Fragment key={part}>
            <dt>
              <span className={`sheet-dot is-${part}`} aria-hidden="true" />
              {PAPER_PART_LABEL[part]}
            </dt>
            <dd>{count}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

// One number of the card in its grey box: the label, the value, and with `of`
// the whole it is part of ("18 din 23"), with `bar` a bar of that part. With
// `level`, the value takes the colour of a grade (`.points-N`). A word (the
// barem's state) is set at text size: only numbers are large.
function Tile({ label, of, bar, level, children }: { label: string; of?: number; bar?: boolean; level?: number; children: ReactNode }) {
  const part = typeof children === 'number' ? children : 0;
  const share = of !== undefined && of > 0 ? Math.min(100, Math.round((part / of) * 100)) : 0;
  return (
    <div className="sheet-tile">
      <dt>{label}</dt>
      <dd className={level !== undefined ? `points-${level}` : typeof children === 'string' ? 'is-word' : undefined}>
        {children}
        {of !== undefined && <span className="sheet-of">{' '}{t('din {of}', { of })}</span>}
        {bar && (
          <span className="sheet-bar" aria-hidden="true">
            <span style={{ width: `${share}%` }} />
          </span>
        )}
      </dd>
    </div>
  );
}
