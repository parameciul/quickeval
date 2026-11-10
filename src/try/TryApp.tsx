import { useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router';
import type { AdminApi } from '../admin/api.ts';
import { ApiProvider } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { ReviewPage } from '../admin/pages/ReviewPage.tsx';
import { ApiError } from '../ui/ApiError.ts';
import { BrandMark } from '../ui/BrandMark.tsx';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import { ThemeButton } from '../ui/ThemeButton.tsx';
import type { TryApi } from './api.ts';
import { TryHome } from './TryHome.tsx';
import { BadLink, Expired } from './TryNotice.tsx';

// An answer that says the try's 7 days are over (410 `expired`): every call
// of the link answers so once they are.
export function isExpired(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'expired';
}

// A Quick Try's page at /try/<token>: the try's states, and the teacher app's
// own review at /teste/<code>/verificare (its links to /teste/<code> come back
// here). `token` is null for an address that is not a try's link.
export function TryRoutes({ token, api, tryApi }: { token: string | null; api: AdminApi; tryApi: TryApi }) {
  return (
    <ApiProvider api={api}>
      <header className="topbar try-topbar">
        <a className="brand" href="/" aria-label="MQGrader by Laura Miron">
          <BrandMark />
          <span className="brand-text">
            <span className="brand-name">MQGrader</span>
            <span className="brand-by">by Laura Miron</span>
          </span>
        </a>
        <div className="topbar-tools">
          <ThemeButton />
        </div>
      </header>
      <main className="try-page">
        <ErrorBoundary>{token === null ? <BadLink /> : <TryLoader tryApi={tryApi} />}</ErrorBoundary>
      </main>
    </ApiProvider>
  );
}

function TryLoader({ tryApi }: { tryApi: TryApi }) {
  const info = useQuery({ queryKey: ['try'], queryFn: () => tryApi.info() });
  if (info.isPending) return <p>Se încarcă…</p>;
  if (info.data === undefined) {
    if (isExpired(info.error)) return <Expired />;
    if (info.error instanceof ApiError && info.error.code === 'unknown_try') return <BadLink />;
    return <ErrorMessage error={info.error} />;
  }
  if (info.data.expired) return <Expired />;
  const home = <TryHome info={info.data} tryApi={tryApi} />;
  return (
    <Routes>
      <Route path="/" element={home} />
      <Route path="/teste/:code" element={home} />
      <Route path="/teste/:code/verificare" element={<ReviewPage />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}
