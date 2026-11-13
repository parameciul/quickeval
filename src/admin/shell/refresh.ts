import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useApi } from '../ApiContext.tsx';

// How the teacher pages learn what the robot, the students and a scheduled
// start changed. D1 bills every row read and a page can stay open for hours,
// so the pages do not read their data on a timer: the app asks only the
// version (two rows, GET /api/admin/version) every minute, and when it
// changed it reads again the data of the page on the screen. The question
// also starts the scheduled tests on the server (promoteDue).
export const VERSION_CHECK_MS = 60_000;

export function useDataVersion(enabled: boolean): void {
  const api = useApi();
  const queryClient = useQueryClient();
  const version = useQuery({
    queryKey: ['version'],
    queryFn: () => api.dataVersion(),
    enabled,
    refetchInterval: VERSION_CHECK_MS,
    // Back on the tab, the page may be hours old.
    refetchOnWindowFocus: true,
  });
  const seen = useRef<string | undefined>(undefined);
  // The teacher's own save changes the version too, and the page that saved
  // already reads its data again. So after a save the app asks the version at
  // once and takes it as seen, instead of reading the page a second time at
  // the next check. A check already on its way is cancelled: its number may be
  // from before the save.
  const adopt = useRef(false);
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'success' || !enabled) return;
        adopt.current = true;
        void queryClient.refetchQueries({ queryKey: ['version'] });
      }),
    [queryClient, enabled],
  );
  // A failed question takes nothing as seen: the next answer is compared.
  useEffect(() => {
    if (version.errorUpdatedAt > 0) adopt.current = false;
  }, [version.errorUpdatedAt]);
  useEffect(() => {
    const current = version.data;
    if (current === undefined) return;
    if (adopt.current) {
      adopt.current = false;
    } else if (seen.current !== undefined && seen.current !== current) {
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'version' });
    }
    seen.current = current;
  }, [version.data, version.dataUpdatedAt, queryClient]);
}
