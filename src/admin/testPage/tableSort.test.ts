import { describe, expect, it } from 'vitest';
import { fakeUpload } from '../../test/fakeApi.ts';
import { DEFAULT_SORT, nextSort, parseSort, saveSort, savedSort, sortRows, type TableSort } from './tableSort.ts';

const rows = [
  fakeUpload({ studentId: 1, studentName: 'Ștefan Ana', submissionId: 1, status: 'graded', grade: 7, fileCount: 2, total: 60, maxTotal: 90, flagCount: 1 }),
  fakeUpload({ studentId: 2, studentName: 'Sandu Ion', submissionId: 2, status: 'graded', grade: 9.5, fileCount: 3, total: 85, maxTotal: 90, resultsOpen: true }),
  fakeUpload({ studentId: 3, studentName: 'Pop Dan', submissionId: 3, status: 'failed', fileCount: 1 }),
  fakeUpload({ studentId: 4, studentName: 'Marin Eva' }),
  fakeUpload({ studentId: 5, studentName: 'Ionescu Radu', submissionId: 5, status: 'graded', grade: 7, fileCount: 2, total: 60, maxTotal: 90, flagCount: 3 }),
  fakeUpload({ studentId: 6, studentName: 'Avram Lia', submissionId: 6, status: 'uploading', fileCount: 2 }),
];
const names = (sort: TableSort) => sortRows(rows, sort).map((row) => row.studentName);

describe('sortRows', () => {
  it('starts with the names in Romanian order', () => {
    expect(names(DEFAULT_SORT)).toEqual(['Avram Lia', 'Ionescu Radu', 'Marin Eva', 'Pop Dan', 'Sandu Ion', 'Ștefan Ana']);
    expect(names({ key: 'name', dir: 'desc' })).toEqual(['Ștefan Ana', 'Sandu Ion', 'Pop Dan', 'Marin Eva', 'Ionescu Radu', 'Avram Lia']);
  });

  it('sorts by grade, equal grades by name, no grade last both ways', () => {
    expect(names({ key: 'grade', dir: 'desc' })).toEqual(['Sandu Ion', 'Ionescu Radu', 'Ștefan Ana', 'Avram Lia', 'Marin Eva', 'Pop Dan']);
    expect(names({ key: 'grade', dir: 'asc' })).toEqual(['Ionescu Radu', 'Ștefan Ana', 'Sandu Ion', 'Avram Lia', 'Marin Eva', 'Pop Dan']);
  });

  it('sorts only the grades of graded papers, as the tables show them', () => {
    const mixed = [
      fakeUpload({ studentId: 1, studentName: 'A', submissionId: 1, status: 'grading', grade: 10 }),
      fakeUpload({ studentId: 2, studentName: 'B', submissionId: 2, status: 'graded', grade: 5 }),
    ];
    expect(sortRows(mixed, { key: 'grade', dir: 'desc' }).map((row) => row.studentName)).toEqual(['B', 'A']);
  });

  it('sorts the states in the order a paper goes through them', () => {
    expect(names({ key: 'state', dir: 'asc' })).toEqual(['Marin Eva', 'Avram Lia', 'Ionescu Radu', 'Sandu Ion', 'Ștefan Ana', 'Pop Dan']);
    expect(names({ key: 'state', dir: 'desc' })[0]).toBe('Pop Dan');
  });

  it('puts the papers to check first, the rows with none last', () => {
    expect(names({ key: 'check', dir: 'desc' })).toEqual(['Ionescu Radu', 'Ștefan Ana', 'Avram Lia', 'Marin Eva', 'Pop Dan', 'Sandu Ion']);
  });

  it('sorts the points of the graded papers only, and the published results first', () => {
    expect(names({ key: 'points', dir: 'desc' }).slice(0, 3)).toEqual(['Sandu Ion', 'Ionescu Radu', 'Ștefan Ana']);
    // Published, then not published, then the students with no result link.
    expect(names({ key: 'published', dir: 'desc' })).toEqual(['Sandu Ion', 'Ionescu Radu', 'Pop Dan', 'Ștefan Ana', 'Avram Lia', 'Marin Eva']);
  });

  it('sorts by the time sent, the students who sent nothing last', () => {
    const timed = [
      fakeUpload({ studentId: 1, studentName: 'B', submissionId: 1, status: 'submitted', submittedAt: '2026-10-06T08:00:00.000Z' }),
      fakeUpload({ studentId: 2, studentName: 'A' }),
      fakeUpload({ studentId: 3, studentName: 'C', submissionId: 3, status: 'submitted', submittedAt: '2026-10-06T07:00:00.000Z' }),
    ];
    expect(sortRows(timed, { key: 'time', dir: 'asc' }).map((row) => row.studentName)).toEqual(['C', 'B', 'A']);
    expect(sortRows(timed, { key: 'time', dir: 'desc' }).map((row) => row.studentName)).toEqual(['B', 'C', 'A']);
  });

  it('leaves the rows it was given as they were', () => {
    const before = rows.map((row) => row.studentId);
    sortRows(rows, { key: 'grade', dir: 'desc' });
    expect(rows.map((row) => row.studentId)).toEqual(before);
  });
});

describe('nextSort', () => {
  it("turns the same column the other way, and starts another at its first order", () => {
    expect(nextSort(DEFAULT_SORT, 'name')).toEqual({ key: 'name', dir: 'desc' });
    expect(nextSort(DEFAULT_SORT, 'grade')).toEqual({ key: 'grade', dir: 'desc' });
    expect(nextSort({ key: 'grade', dir: 'desc' }, 'grade')).toEqual({ key: 'grade', dir: 'asc' });
    expect(nextSort({ key: 'grade', dir: 'desc' }, 'time')).toEqual({ key: 'time', dir: 'asc' });
  });
});

describe('the order kept in this browser', () => {
  it('keeps one order for each table', () => {
    saveSort('papers', { key: 'grade', dir: 'asc' });
    expect(savedSort('papers')).toEqual({ key: 'grade', dir: 'asc' });
    expect(savedSort('results')).toEqual(DEFAULT_SORT);
  });

  it('forgets an order the table does not have, or a broken value', () => {
    expect(parseSort('results', 'state-asc')).toBeNull();
    expect(parseSort('papers', 'state-asc')).toEqual({ key: 'state', dir: 'asc' });
    expect(parseSort('papers', 'grade-up')).toBeNull();
    localStorage.setItem('quickeval:resultsSort', 'files-desc');
    expect(savedSort('results')).toEqual(DEFAULT_SORT);
  });
});
