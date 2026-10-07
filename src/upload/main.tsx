import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isUploadToken } from '../../shared/tests.ts';
import '../ui/brand.css';
import { createUploadClient } from './api.ts';
import { UploadApp } from './UploadApp.tsx';

// /u/<token>: the token is the second part of the path.
const token = window.location.pathname.split('/')[2] ?? '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UploadApp api={createUploadClient()} token={isUploadToken(token) ? token : null} />
  </StrictMode>,
);
