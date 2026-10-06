import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ApiProvider } from '../admin/ApiContext.tsx';
import type { AdminApi } from '../admin/api.ts';
import { AppRoutes } from '../admin/AppRoutes.tsx';
import { SchoolYearProvider } from '../admin/SchoolYearContext.tsx';

// Renders the teacher app at a path (without the /admin basename), with a fake
// API and school year 2026-2027.
export function renderAdmin(path: string, api: AdminApi) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <ApiProvider api={api}>
      <QueryClientProvider client={queryClient}>
        <SchoolYearProvider initialYear={2026}>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
          </MemoryRouter>
        </SchoolYearProvider>
      </QueryClientProvider>
    </ApiProvider>,
  );
}
