import type { UploadRow } from '../../../shared/api.ts';
import type { TestStatus } from '../../../shared/tests.ts';

// The parts of the papers bar, in the order they are drawn.
export type PaperPart = 'graded' | 'grading' | 'waiting' | 'failed' | 'uploading' | 'notYet' | 'absent';

export const PAPER_PARTS: readonly PaperPart[] = ['graded', 'grading', 'waiting', 'failed', 'uploading', 'notYet', 'absent'];

export const PAPER_PART_LABEL: Record<PaperPart, string> = {
  graded: 'Corectate',
  grading: 'Se corectează',
  waiting: 'Așteaptă corectarea',
  failed: 'Eșuate',
  uploading: 'Încarcă acum',
  notYet: 'Încă nu au trimis',
  absent: 'Nu au participat',
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
  // Every paper that took part is graded.
  complete: boolean;
}

// One student's part. A paper held back from grading (not chosen, or past the
// demo limit) goes back to `uploading` with its files; when the uploads close,
// every other `uploading` row with files is sent. So, once closed, an
// `uploading` row with files waits for the teacher and one without files is a
// student who sent nothing. A CES paper waiting for its barem stays `submitted`.
function partOf(row: UploadRow, status: TestStatus, open: boolean): PaperPart {
  switch (row.status) {
    case 'graded':
      return 'graded';
    case 'grading':
      return 'grading';
    case 'submitted':
      return status === 'evaluating' ? 'grading' : 'waiting';
    case 'failed':
      return 'failed';
    case 'uploading':
      return open ? 'uploading' : row.fileCount > 0 ? 'waiting' : 'absent';
    case 'none':
      return open ? 'notYet' : 'absent';
  }
}

// The papers bar of the test page (spec 2026-11-12 §5.2), from the uploads
// list alone. A student of the class with no row counts as one who sent nothing.
export function paperCounts(status: TestStatus, studentCount: number, uploads: UploadRow[]): PaperCounts {
  const open = status !== 'evaluating' && status !== 'done';
  const counts = new Map<PaperPart, number>();
  const add = (part: PaperPart, count: number) => counts.set(part, (counts.get(part) ?? 0) + count);
  for (const row of uploads) add(partOf(row, status, open), 1);
  const total = Math.max(studentCount, uploads.length);
  add(open ? 'notYet' : 'absent', total - uploads.length);
  const parts = PAPER_PARTS.filter((part) => (counts.get(part) ?? 0) > 0).map((part) => ({ part, count: counts.get(part)! }));
  const count = (part: PaperPart) => counts.get(part) ?? 0;
  const took = count('graded') + count('grading') + count('waiting') + count('failed');
  return { open, parts, took, total, complete: took > 0 && count('graded') === took };
}
