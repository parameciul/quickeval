import { describe, expect, it } from 'vitest';
import { fakeUpload } from '../../test/fakeApi.ts';
import { canSelect, excludedFor, selectableIds, selectedIds } from './selection.ts';

const sent = fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 2 });
const uploading = fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1 });
const noFiles = fakeUpload({ studentId: 12, studentName: 'Marin Dan', submissionId: 7, status: 'uploading', fileCount: 0 });
const nothing = fakeUpload({ studentId: 13, studentName: 'Ene Ana' });
const graded = fakeUpload({ studentId: 14, studentName: 'Dinu Rad', submissionId: 8, status: 'graded', fileCount: 1, grade: 9 });
const failed = fakeUpload({ studentId: 15, studentName: 'Iancu Ia', submissionId: 9, status: 'failed', fileCount: 1 });

describe('selection of the uploads to grade', () => {
  it('can select only an upload with files that waits for grading', () => {
    expect([sent, uploading, noFiles, nothing, graded, failed].map(canSelect)).toEqual([true, true, false, false, false, false]);
    expect(selectableIds([sent, uploading, noFiles, nothing, graded, failed])).toEqual([5, 6]);
  });

  it('selects every selectable upload by default', () => {
    expect(selectedIds([sent, uploading, noFiles, graded], [])).toEqual([5, 6]);
  });

  it('leaves out the uploads the teacher unchecked', () => {
    expect(selectedIds([sent, uploading], [6])).toEqual([5]);
    expect(selectedIds([sent, uploading], [5, 6])).toEqual([]);
  });

  it('selects a paper sent later, and keeps the unchecked ones out', () => {
    const later = fakeUpload({ studentId: 12, studentName: 'Marin Dan', submissionId: 7, status: 'uploading', fileCount: 2 });
    expect(selectedIds([sent, uploading, later], [6])).toEqual([5, 7]);
  });

  it('ignores an unchecked id that can no longer be selected', () => {
    const nowGraded = { ...uploading, status: 'graded' as const, grade: 8 };
    expect(selectedIds([sent, nowGraded], [6])).toEqual([5]);
  });

  it('turns a choice into the unchecked ids', () => {
    expect(excludedFor([sent, uploading, graded], [5])).toEqual([6]);
    expect(excludedFor([sent, uploading], [])).toEqual([5, 6]);
    expect(excludedFor([sent, uploading], [5, 6])).toEqual([]);
  });
});
