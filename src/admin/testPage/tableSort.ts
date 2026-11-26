import type { UploadRow } from '../../../shared/api.ts';
import { compareStudentNames } from '../../../shared/students.ts';

// The order of the students' tables of the test page: the papers table of
// În clasă and Corectare, and the links table of Rezultate. The rows come in
// the class's order (the names, A to Z), which is also the order shown until
// the teacher picks another. The order is kept in this browser, one for each
// table, so the teacher finds it again on every test.

export type SortKey = 'name' | 'grade' | 'state' | 'files' | 'time' | 'check' | 'points' | 'published';
export type SortDir = 'asc' | 'desc';
export interface TableSort {
  key: SortKey;
  dir: SortDir;
}

export type SortTable = 'papers' | 'results';

export const DEFAULT_SORT: TableSort = { key: 'name', dir: 'asc' };

// The columns each table sorts by.
export const SORT_KEYS: Record<SortTable, readonly SortKey[]> = {
  papers: ['name', 'grade', 'state', 'files', 'time', 'check'],
  results: ['name', 'grade', 'points', 'published'],
};

// A column's first order: the names A to Z and the earliest time first, the
// numbers from the most, the states in the order a paper goes through them.
const FIRST_DIR: Record<SortKey, SortDir> = {
  name: 'asc',
  grade: 'desc',
  state: 'asc',
  files: 'desc',
  time: 'asc',
  check: 'desc',
  points: 'desc',
  published: 'desc',
};

// A click on a column's name: the other order of the same column, or the
// first order of another.
export function nextSort(current: TableSort, key: SortKey): TableSort {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: FIRST_DIR[key] };
}

// The state in the order a paper goes through it, not by its words, so the
// Romanian and the English pages sort alike.
function stateRank(row: UploadRow): number {
  switch (row.status) {
    case 'none':
      return 0;
    case 'uploading':
      return row.fileCount > 0 ? 2 : 1;
    case 'submitted':
      return 3;
    case 'grading':
      return 4;
    case 'graded':
      return 5;
    case 'failed':
      return 6;
  }
}

// A row's value in a column, as the table shows it; null where it shows "—",
// which always goes last.
function valueOf(row: UploadRow, key: SortKey): number | null {
  const graded = row.status === 'graded';
  switch (key) {
    case 'name':
      return null;
    case 'grade':
      return row.grade;
    case 'state':
      return stateRank(row);
    case 'files':
      return row.fileCount;
    case 'time': {
      const time = row.submittedAt ?? row.startedAt;
      return time === null ? null : Date.parse(time);
    }
    case 'check':
      return row.flagCount > 0 ? row.flagCount : null;
    case 'points':
      return graded && row.total !== null ? row.total : null;
    case 'published':
      return row.submissionId !== null && row.status !== 'none' && row.status !== 'uploading' ? (row.resultsOpen ? 1 : 0) : null;
  }
}

// The rows in the chosen order; equal values keep the names' order.
export function sortRows(rows: readonly UploadRow[], sort: TableSort): UploadRow[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort.key !== 'name') {
      const x = valueOf(a, sort.key);
      const y = valueOf(b, sort.key);
      if (x === null || y === null) {
        if (x !== y) return x === null ? 1 : -1;
      } else if (x !== y) {
        return (x - y) * sign;
      }
      return compareStudentNames(a.studentName, b.studentName);
    }
    return compareStudentNames(a.studentName, b.studentName) * sign;
  });
}

// The select of a phone, where the table is a column of cards with no
// column names: each order is one value, "<key>-<dir>".
export function sortValue(sort: TableSort): string {
  return `${sort.key}-${sort.dir}`;
}

export function parseSort(table: SortTable, value: string | null): TableSort | null {
  const match = /^([a-z]+)-(asc|desc)$/.exec(value ?? '');
  if (!match) return null;
  const key = match[1] as SortKey;
  if (!SORT_KEYS[table].includes(key)) return null;
  return { key, dir: match[2] as SortDir };
}

const STORAGE_KEY: Record<SortTable, string> = {
  papers: 'quickeval:papersSort',
  results: 'quickeval:resultsSort',
};

export function savedSort(table: SortTable): TableSort {
  try {
    return parseSort(table, localStorage.getItem(STORAGE_KEY[table])) ?? DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}

export function saveSort(table: SortTable, sort: TableSort): void {
  try {
    localStorage.setItem(STORAGE_KEY[table], sortValue(sort));
  } catch {
    // A browser that keeps nothing: the order lasts while the page is open.
  }
}
