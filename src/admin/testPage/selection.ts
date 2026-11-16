import type { UploadRow } from '../../../shared/api.ts';

// Only an upload with files that still waits for grading can be selected:
// graded uploads are done, failed ones need Reîncearcă.
export function canSelect(row: UploadRow): boolean {
  return row.submissionId !== null && row.fileCount > 0 && (row.status === 'uploading' || row.status === 'submitted');
}

// The submission ids that can be selected, in the order of the table.
export function selectableIds(uploads: UploadRow[]): number[] {
  return uploads.filter(canSelect).map((row) => row.submissionId!);
}

// The uploads to grade at the next Start evaluation. Every upload that can be
// selected is, unless the teacher unchecked it (`excluded`): a paper sent
// after the page opened is selected at once, and an excluded id that is no
// longer selectable (graded, failed) is ignored.
export function selectedIds(uploads: UploadRow[], excluded: readonly number[]): number[] {
  return selectableIds(uploads).filter((id) => !excluded.includes(id));
}

// The ids to keep out when the teacher's choice is `selected`: every
// selectable id not in it.
export function excludedFor(uploads: UploadRow[], selected: readonly number[]): number[] {
  return selectableIds(uploads).filter((id) => !selected.includes(id));
}
