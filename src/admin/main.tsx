import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/brand.css';
import { createApiClient } from './api.ts';
import { App } from './App.tsx';
import { reloadOnRestore } from './shell/viewing.ts';

reloadOnRestore();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App api={createApiClient()} />
  </StrictMode>,
);
