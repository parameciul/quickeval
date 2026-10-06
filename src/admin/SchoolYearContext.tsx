import { createContext, useContext, useState, type ReactNode } from 'react';
import { isValidSchoolYear, schoolYearOf } from '../../shared/schoolYear.ts';

const YEAR_KEY = 'quickeval.schoolYear';
// QuickEval starts in school year 2026-2027; no data exists before it.
const FIRST_YEAR = 2026;

interface SchoolYearState {
  year: number;
  setYear(year: number): void;
}

const SchoolYearContext = createContext<SchoolYearState | null>(null);

// The years the header switch offers: next year (for preparing classes in
// summer) down to the first QuickEval year, newest first.
export function schoolYearOptions(current: number): number[] {
  const years: number[] = [];
  for (let year = current + 1; year >= Math.min(FIRST_YEAR, current); year--) years.push(year);
  return years;
}

function savedYear(): number | null {
  try {
    const year = Number(localStorage.getItem(YEAR_KEY));
    return isValidSchoolYear(year) ? year : null;
  } catch {
    return null;
  }
}

export function SchoolYearProvider({ initialYear, children }: { initialYear?: number; children: ReactNode }) {
  const [year, setYearState] = useState(() => initialYear ?? savedYear() ?? schoolYearOf(new Date()));
  const setYear = (next: number) => {
    setYearState(next);
    try {
      localStorage.setItem(YEAR_KEY, String(next));
    } catch {
      // Storage can be blocked; the choice then lasts until the page reloads.
    }
  };
  return <SchoolYearContext.Provider value={{ year, setYear }}>{children}</SchoolYearContext.Provider>;
}

export function useSchoolYear(): SchoolYearState {
  const state = useContext(SchoolYearContext);
  if (!state) throw new Error('useSchoolYear() needs a <SchoolYearProvider> above it');
  return state;
}
