import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { isQuickTryToken } from '../../shared/quickTry.ts';
import { createApiClient } from '../admin/api.ts';
import '../ui/brand.css';
import { createTryClient, tryBase } from './api.ts';
import { tryQueryClient } from './queryClient.ts';
import './try.css';
import { TryRoutes } from './TryApp.tsx';

// /try/<token>: the token is the second part of the path.
const raw = window.location.pathname.split('/')[2] ?? '';
const token = isQuickTryToken(raw) ? raw : null;
const queryClient = tryQueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={`/try/${raw}`}>
        <TryRoutes
          token={token}
          // A try has no login: an answer that is not the API's own is an error, never a reload.
          api={createApiClient({ base: tryBase(raw), onLoginExpired: () => undefined })}
          tryApi={createTryClient(raw)}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
