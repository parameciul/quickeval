import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { foldForSearch, isSearchable } from '../../../shared/search.ts';
import { useApi } from '../ApiContext.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';

// How long the box waits after a key before it asks the API.
export const SEARCH_WAIT_MS = 200;

// The value, once it stopped changing for `wait` milliseconds.
function useSettled(value: string, wait: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (wait === 0) return setSettled(value);
    const timer = setTimeout(() => setSettled(value), wait);
    return () => clearTimeout(timer);
  }, [value, wait]);
  return wait === 0 ? value : settled;
}

// What the search finds in the selected school year. Two searches that fold
// to the same text share their answer; while a new one is on its way, the
// last answer stays on screen.
export function useSearch(text: string, wait = SEARCH_WAIT_MS) {
  const api = useApi();
  const { year } = useSchoolYear();
  const query = useSettled(text.trim(), wait);
  return useQuery({
    queryKey: ['search', year, foldForSearch(query)],
    queryFn: () => api.search(query, year),
    enabled: isSearchable(query),
    placeholderData: keepPreviousData,
  });
}
