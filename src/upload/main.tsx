import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/brand.css';
import { createUploadClient } from './api.ts';
import { ResultApp } from './ResultApp.tsx';
import { routeOf } from './route.ts';
import { UploadApp } from './UploadApp.tsx';

const route = routeOf(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {route.kind === 'result' ? (
      <ResultApp api={createUploadClient()} resultToken={route.resultToken} />
    ) : (
      <UploadApp api={createUploadClient()} token={route.token} />
    )}
  </StrictMode>,
);
