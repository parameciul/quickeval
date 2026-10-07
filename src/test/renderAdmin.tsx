import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { expect } from 'vitest';
import { ApiProvider } from '../admin/ApiContext.tsx';
import type { AdminApi } from '../admin/api.ts';
import { AppRoutes } from '../admin/AppRoutes.tsx';
import { SchoolYearProvider } from '../admin/SchoolYearContext.tsx';

// Shows where the app is, for tests that check a navigation: the path, and
// the notice that a page passed along in the navigation state.
export function LocationProbe() {
  const location = useLocation();
  const state = location.state as { notice?: string } | null;
  return (
    <p data-testid="location">
      {location.pathname}
      {location.search}
      {state?.notice ? ` | ${state.notice}` : ''}
    </p>
  );
}

// Waits until the LocationProbe shows the expected place. A navigation runs
// after the API answer, so a single immediate check could look too early.
export async function expectLocation(expected: string | RegExp): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(expected));
}

// Renders the teacher app at a path (without the /admin basename), with a fake
// API and school year 2026-2027. `extra` is drawn inside the router, above the
// pages; tests use it for a button that navigates.
export function renderAdmin(path: string, api: AdminApi, extra?: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <ApiProvider api={api}>
      <QueryClientProvider client={queryClient}>
        <SchoolYearProvider initialYear={2026}>
          <MemoryRouter initialEntries={[path]}>
            {extra}
            <AppRoutes />
          </MemoryRouter>
        </SchoolYearProvider>
      </QueryClientProvider>
    </ApiProvider>,
  );
}
