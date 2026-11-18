import { useId, type ReactNode } from 'react';
import type { TestInfo, UploadRow } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { formatDateTime, pointsLevel, studentCountLabel } from '../../ui/format.ts';
import { StatusChip } from '../StatusChip.tsx';
import { subjectLine } from './SubjectForm.tsx';

// The barem in a few words. Not its points: the API knows them only after the
// grading starts.
export function baremState(test: Pick<TestInfo, 'files' | 'barem'>): string {
  const { request, unchecked } = test.barem;
  if (request === 'requested') return 'se generează';
  if (test.files.barem === null || unchecked) {
    if (request === 'failed') return 'nu s-a putut genera';
    return test.files.barem === null ? 'lipsește' : 'de verificat';
  }
  return 'activ';
}

// The students sending their papers now: an upload with files, not sent yet.
export function uploadingNow(uploads: UploadRow[]): number {
  return uploads.filter((row) => row.status === 'uploading' && row.fileCount > 0).length;
}

// "Fișa testului" (spec 2026-11-15 §2): the state, two numbers that change with
// the state of the test, and the plain facts. It shows beside every stage; the
// files are in Pregătire and Tipărire, the students' link in În clasă, the
// test's actions in "Acțiuni" (`TestMenu.tsx`).
export function TestSheet({ test, uploads }: { test: TestInfo; uploads: UploadRow[] }) {
  const id = useId();
  const sent = (
    <Tile label="Au trimis" of={test.studentCount} bar>
      {test.submittedCount}
    </Tile>
  );
  let tiles: ReactNode;
  if (test.status === 'draft') {
    tiles = (
      <>
        <Tile label="Elevi">{test.studentCount}</Tile>
        <Tile label="Baremul">{baremState(test)}</Tile>
      </>
    );
  } else if (test.status === 'open') {
    tiles = (
      <>
        {sent}
        <Tile label="Încarcă acum">{uploadingNow(uploads)}</Tile>
      </>
    );
  } else {
    tiles = (
      <>
        {sent}
        {test.averageGrade !== null ? (
          <Tile label="Media testului" level={pointsLevel(test.averageGrade, 10)}>
            {formatPoints(test.averageGrade)}
          </Tile>
        ) : (
          <Tile label="Corectate" of={test.submittedCount}>
            {test.gradedCount}
          </Tile>
        )}
      </>
    );
  }

  return (
    <section className="test-sheet" aria-labelledby={id}>
      <div className="sheet-head">
        <h2 id={id}>Fișa testului</h2>
        <span className="sheet-tags">
          {test.status === 'open' && test.uploadsClosedAt !== null ? (
            <span className="status status-draft">Încărcare închisă</span>
          ) : (
            <StatusChip status={test.status} />
          )}
          {test.archived && <span className="tag">Arhivat</span>}
        </span>
      </div>
      <dl className="sheet-tiles">{tiles}</dl>
      <dl className="sheet-facts">
        <dt>Clasa</dt>
        <dd>
          {displayClassName(test.className)} · {studentCountLabel(test.studentCount)}
        </dd>
        <dt>Codul</dt>
        <dd>{test.code}</dd>
        <dt>Materia</dt>
        <dd>{subjectLine(test)}</dd>
        {test.startedAt && (
          <>
            <dt>Început</dt>
            <dd>{formatDateTime(test.startedAt)}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

// One number of the card in its grey box: the label, the value, and with `of`
// the whole it is part of ("18 din 23"), with `bar` a bar of that part. With
// `level`, the value takes the colour of a grade (`.points-N`).
function Tile({ label, of, bar, level, children }: { label: string; of?: number; bar?: boolean; level?: number; children: ReactNode }) {
  const part = typeof children === 'number' ? children : 0;
  const share = of !== undefined && of > 0 ? Math.min(100, Math.round((part / of) * 100)) : 0;
  return (
    <div className="sheet-tile">
      <dt>{label}</dt>
      <dd className={level === undefined ? undefined : `points-${level}`}>
        {children}
        {of !== undefined && <span className="sheet-of"> din {of}</span>}
        {bar && (
          <span className="sheet-bar" aria-hidden="true">
            <span style={{ width: `${share}%` }} />
          </span>
        )}
      </dd>
    </div>
  );
}
