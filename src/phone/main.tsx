import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isPhoneToken } from '../../shared/testPhone.ts';
import '../ui/brand.css';
import '../try/try.css';
import { tryQueryClient } from '../try/queryClient.ts';
import { createPhoneClient } from './api.ts';
import { PhoneApp } from './PhoneApp.tsx';

// /phone/<token>: the token is the second part of the path. The page shares
// the Quick Try phone page's look (try.css) and its query rules.
const raw = window.location.pathname.split('/')[2] ?? '';
const token = isPhoneToken(raw) ? raw : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={tryQueryClient()}>
      <PhoneApp token={token} api={createPhoneClient(raw)} />
    </QueryClientProvider>
  </StrictMode>,
);
