import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BrowserRouter } from 'react-router';
import { ApiProvider } from './ApiContext.tsx';
import type { AdminApi } from './api.ts';
import { AppRoutes } from './AppRoutes.tsx';
import { SchoolYearProvider } from './SchoolYearContext.tsx';

export function App({ api }: { api: AdminApi }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <ApiProvider api={api}>
      <QueryClientProvider client={queryClient}>
        <SchoolYearProvider>
          <BrowserRouter basename="/admin">
            <AppRoutes />
          </BrowserRouter>
        </SchoolYearProvider>
      </QueryClientProvider>
    </ApiProvider>
  );
}
