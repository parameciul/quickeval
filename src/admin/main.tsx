import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/brand.css';
import { createApiClient } from './api.ts';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App api={createApiClient()} />
  </StrictMode>,
);
