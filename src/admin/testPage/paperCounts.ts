import { demoPapersLeft } from '../../../shared/accounts.ts';
import type { Teacher, UploadRow, UploadStatus } from '../../../shared/api.ts';
import type { TestStatus } from '../../../shared/tests.ts';
import { t } from '../../i18n/t.ts';
import { countLabel } from '../../ui/format.ts';

// The parts of the papers, in the order they are named.
export type PaperPart = 'graded' | 'grading' | 'waiting' | 'failed' | 'uploading' | 'notYet' | 'absent';

export const PAPER_PARTS: readonly PaperPart[] = ['graded', 'grading', 'waiting', 'failed', 'uploading', 'notYet', 'absent'];

export const PAPER_PART_LABEL: Record<PaperPart, string> = {
  graded: t('Corectate'),
  grading: t('Se corectează'),
  waiting: t('Așteaptă corectarea'),
  failed: t('Eșuate'),
  uploading: t('Încarcă acum'),
  notYet: t('Încă nu au trimis'),
  absent: t('Nu au participat'),
};

export interface PaperCounts {
  // The uploads are open: a student who sent nothing can still send.
  open: boolean;
  // Every part with at least one student, in drawing order.
  parts: { part: PaperPart; count: number }[];
  // The students who sent (open) or took part (closed): every part but the
  // grey ones and, while open, "Încarcă acum".
  took: number;
  // The students of the bar: the class, or the uploads when more.
  total: number;
  // Every paper that took part is graded, and no student is sending one now.
  complete: boolean;
}

// The CES variant as the bar needs it: whether the test has a CES test file
// (a CES student's paper is then graded with it) and whether its barem is
// active (`cesBaremActive`).
export interface CesBar {
  hasTest: boolean;
  baremActive: boolean;
}

export const NO_CES: CesBar = { hasTest: false, baremActive: false };

// A paper held back from grading (not chosen, or past the demo limit) goes
// back to `uploading` with its files; when the uploads close, every other
// `uploading` row with files is sent. So, once closed, an `uploading` paper
// with files waits for the teacher.
export function heldBack(status: UploadStatus, fileCount: number, testStatus: TestStatus): boolean {
  return status === 'uploading' && fileCount > 0 && (testStatus === 'evaluating' || testStatus === 'done');
}

export const HELD_BACK_HINT = t('Lucrarea nu a fost trimisă la corectare. Redeschide încărcarea și pornește evaluarea pentru ea.');

const HELD_BACK_DEMO_HINT =
  t('Lucrarea nu a fost trimisă la corectare: contul demo nu mai are lucrări de corectat. Cere unui administrator un cont complet.');

// Why a held-back paper waits, for the account at hand: a demo account with no
// paper left cannot send it, so reopening the uploads would not help.
export function heldBackHint(teacher: Teacher | undefined): string {
  return teacher?.demo === true && demoPapersLeft(teacher.papersGraded + teacher.papersWaiting) === 0 ? HELD_BACK_DEMO_HINT : HELD_BACK_HINT;
}

// One student's part. Once closed, an `uploading` row with files is held back
// (it waits) and one without files is a student who sent nothing. A sent CES
// paper waits, `submitted`, in an evaluating test while the CES barem is not
// active; its variant is the one written on it, else the one the server
// would pick (`paperVariantSql`).
function partOf(row: UploadRow, status: TestStatus, open: boolean, ces: CesBar): PaperPart {
  switch (row.status) {
    case 'graded':
      return 'graded';
    case 'grading':
      return 'grading';
    case 'submitted':
      return status === 'evaluating' && !cesWaitsBarem(row, status, ces) ? 'grading' : 'waiting';
    case 'failed':
      return 'failed';
    case 'uploading':
      return open ? 'uploading' : row.fileCount > 0 ? 'waiting' : 'absent';
    case 'none':
      return open ? 'notYet' : 'absent';
  }
}

// A sent CES paper of an evaluating test that waits for the CES barem: the
// robot grades it only once that barem is active.
export function cesWaitsBarem(row: UploadRow, status: TestStatus, ces: CesBar): boolean {
  const cesPaper = row.variant === 'ces' || (row.variant === null && row.ces && ces.hasTest);
  return row.status === 'submitted' && status === 'evaluating' && cesPaper && !ces.baremActive;
}

// The short label beside "Elevii" over the papers table, drawn like the
// "0 publicate · 2 nepublicate" of Rezultate: where the papers are, in the
// order of the parts ("12 corectate · 11 se corectează"). The students who did
// not take part are left out: Fișa testului and the table's rows name them.
// Green "toate corectate" once every paper that took part is graded and no
// student of an open test is still to send one.
export function papersTag(counts: PaperCounts): { text: string; all: boolean } | null {
  if (counts.complete && !counts.parts.some(({ part }) => part === 'notYet')) return { text: t('toate corectate'), all: true };
  const words = counts.parts.flatMap(({ part, count }) => (part === 'absent' ? [] : [PAPER_TAG[part](count)]));
  return words.length === 0 ? null : { text: words.join(' · '), all: false };
}

// The words of each part in that label. The verbs take no "de" after 20.
const PAPER_TAG: Record<Exclude<PaperPart, 'absent'>, (count: number) => string> = {
  graded: (count) => countLabel(count, 'corectată', 'corectate'),
  grading: (count) => t('{count} se corectează', { count }),
  waiting: (count) => t('{count} așteaptă corectarea', { count }),
  failed: (count) => countLabel(count, 'eșuată', 'eșuate'),
  uploading: (count) => t('{count} încarcă acum', { count }),
  notYet: (count) => (count === 1 ? t('1 încă nu a trimis') : t('{count} încă nu au trimis', { count })),
};

// The papers of the test page (spec 2026-11-12 §5.2), from the uploads
// list and the CES variant. A student of the class with no row counts as one
// who sent nothing.
export function paperCounts(status: TestStatus, studentCount: number, uploads: UploadRow[], ces: CesBar): PaperCounts {
  const open = status !== 'evaluating' && status !== 'done';
  const counts = new Map<PaperPart, number>();
  const add = (part: PaperPart, count: number) => counts.set(part, (counts.get(part) ?? 0) + count);
  for (const row of uploads) add(partOf(row, status, open, ces), 1);
  const total = Math.max(studentCount, uploads.length);
  add(open ? 'notYet' : 'absent', total - uploads.length);
  const parts = PAPER_PARTS.filter((part) => (counts.get(part) ?? 0) > 0).map((part) => ({ part, count: counts.get(part)! }));
  const count = (part: PaperPart) => counts.get(part) ?? 0;
  const took = count('graded') + count('grading') + count('waiting') + count('failed');
  return { open, parts, took, total, complete: took > 0 && count('graded') === took && count('uploading') === 0 };
}
