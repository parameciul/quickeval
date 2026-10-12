import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isResultToken, isUploadToken } from '../../shared/tests.ts';
import '../ui/brand.css';
import { createUploadClient } from './api.ts';
import { ResultApp } from './ResultApp.tsx';
import { UploadApp } from './UploadApp.tsx';

// /u/<token>: the token is the second part of the path.
// /u/rezultat/<resultToken>: one student's result page.
function routeOf(pathname: string): { kind: 'upload'; token: string | null } | { kind: 'result'; resultToken: string | null } {
  const parts = pathname.split('/');
  if (parts[2] === 'rezultat') return { kind: 'result', resultToken: parts[3] && isResultToken(parts[3]) ? parts[3] : null };
  const token = parts[2] ?? '';
  return { kind: 'upload', token: isUploadToken(token) ? token : null };
}

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
