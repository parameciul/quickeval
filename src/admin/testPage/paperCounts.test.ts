import { describe, expect, it } from 'vitest';
import type { UploadRow } from '../../../shared/api.ts';
import { fakeUpload } from '../../test/fakeApi.ts';
import { NO_CES, paperCounts } from './paperCounts.ts';

let next = 1;
const row = (overrides: Partial<UploadRow>): UploadRow => {
  const id = next++;
  return fakeUpload({ studentId: id, studentName: `Elev ${id}`, submissionId: overrides.status && overrides.status !== 'none' ? id : null, ...overrides });
};

describe('paperCounts', () => {
  it('counts the sent papers and those still to come while the uploads are open', () => {
    const counts = paperCounts('open', 6, [
      row({ status: 'submitted', fileCount: 2 }),
      row({ status: 'submitted', fileCount: 1 }),
      row({ status: 'uploading', fileCount: 1 }),
      row({ status: 'none' }),
    ], NO_CES);
    expect(counts.open).toBe(true);
    expect(counts.parts).toEqual([
      { part: 'waiting', count: 2 },
      { part: 'uploading', count: 1 },
      { part: 'notYet', count: 3 },
    ]);
    expect(counts.took).toBe(2);
    expect(counts.total).toBe(6);
    expect(counts.complete).toBe(false);
  });

  it('says who did not take part once the uploads are closed, and counts a held-back paper as waiting', () => {
    const counts = paperCounts('evaluating', 8, [
      row({ status: 'graded', fileCount: 3 }),
      row({ status: 'grading', fileCount: 2 }),
      row({ status: 'submitted', fileCount: 2 }),
      row({ status: 'uploading', fileCount: 4 }),
      row({ status: 'uploading', fileCount: 0 }),
      row({ status: 'failed', fileCount: 1 }),
      row({ status: 'none' }),
    ], NO_CES);
    expect(counts.open).toBe(false);
    expect(counts.parts).toEqual([
      { part: 'graded', count: 1 },
      { part: 'grading', count: 2 },
      { part: 'waiting', count: 1 },
      { part: 'failed', count: 1 },
      { part: 'absent', count: 3 },
    ]);
    expect(counts.took).toBe(5);
  });

  it('counts a sent CES paper as waiting while the CES barem is not active, the class papers as being graded', () => {
    const uploads = [
      row({ status: 'graded', fileCount: 1 }),
      row({ status: 'submitted', fileCount: 1 }),
      row({ status: 'submitted', fileCount: 1, ces: true }),
      row({ status: 'submitted', fileCount: 1, ces: true, variant: 'ces' }),
    ];
    const waits = paperCounts('evaluating', 4, uploads, { hasTest: true, baremActive: false });
    expect(waits.parts).toEqual([
      { part: 'graded', count: 1 },
      { part: 'grading', count: 1 },
      { part: 'waiting', count: 2 },
    ]);
    expect(waits.complete).toBe(false);
    expect(paperCounts('evaluating', 4, uploads, { hasTest: true, baremActive: true }).parts).toEqual([
      { part: 'graded', count: 1 },
      { part: 'grading', count: 3 },
    ]);
  });

  it("grades a CES student's paper with the class test when the test has no CES variant", () => {
    const counts = paperCounts('evaluating', 1, [row({ status: 'submitted', fileCount: 1, ces: true })], { hasTest: false, baremActive: false });
    expect(counts.parts).toEqual([{ part: 'grading', count: 1 }]);
  });

  it('shows a reopened test with failed papers and papers the students can change again', () => {
    const counts = paperCounts('open', 3, [row({ status: 'failed', fileCount: 1 }), row({ status: 'uploading', fileCount: 2 }), row({ status: 'graded', fileCount: 1 })], NO_CES);
    expect(counts.parts).toEqual([
      { part: 'graded', count: 1 },
      { part: 'failed', count: 1 },
      { part: 'uploading', count: 1 },
    ]);
    expect(counts.took).toBe(2);
  });

  it('is complete when every paper that took part is graded, whoever did not take part', () => {
    const counts = paperCounts('done', 23, [row({ status: 'graded', fileCount: 2 }), row({ status: 'graded', fileCount: 1 }), row({ status: 'none' })], NO_CES);
    expect(counts.complete).toBe(true);
    expect(counts.took).toBe(2);
    expect(counts.parts.at(-1)).toEqual({ part: 'absent', count: 21 });
  });

  it('is not complete while students of a reopened test upload again', () => {
    const counts = paperCounts('open', 3, [row({ status: 'graded', fileCount: 1 }), row({ status: 'uploading', fileCount: 1 })], NO_CES);
    expect(counts.complete).toBe(false);
  });

  it('is not complete when nothing took part', () => {
    expect(paperCounts('done', 2, [row({ status: 'none' }), row({ status: 'none' })], NO_CES).complete).toBe(false);
  });

  it('counts every upload when there are more uploads than students (a student who left)', () => {
    const counts = paperCounts('done', 1, [row({ status: 'graded', fileCount: 1 }), row({ status: 'graded', fileCount: 1, active: false })], NO_CES);
    expect(counts.total).toBe(2);
    expect(counts.parts).toEqual([{ part: 'graded', count: 2 }]);
  });
});
