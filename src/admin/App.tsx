import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BrowserRouter } from 'react-router';
import { ApiProvider } from './ApiContext.tsx';
import { ApiError, type AdminApi } from './api.ts';
import { AppRoutes } from './AppRoutes.tsx';
import { SchoolYearProvider } from './SchoolYearContext.tsx';
import { isLeaving } from './shell/viewing.ts';

// One more try for a failed read, but none for a view that ended or a tab
// that is already leaving: the answer would be the same.
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isLeaving()) return false;
  if (error instanceof ApiError && error.code === 'impersonation_ended') return false;
  return failureCount < 1;
}

export function App({ api }: { api: AdminApi }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: shouldRetry, refetchOnWindowFocus: false } } }),
  );
  return (
    <ApiProvider api={api}>
      <QueryClientProvider client={queryClient}>
        <SchoolYearProvider>
          <BrowserRouter basename="/teacher">
            <AppRoutes />
          </BrowserRouter>
        </SchoolYearProvider>
      </QueryClientProvider>
    </ApiProvider>
  );
}
