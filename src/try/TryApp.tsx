import { useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes, useParams } from 'react-router';
import { parsePositiveId } from '../../shared/ids.ts';
import { normalizeTestCode } from '../../shared/tests.ts';
import type { AdminApi } from '../admin/api.ts';
import { ApiProvider } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { TryPaperPage } from '../admin/pages/PaperPage.tsx';
import { paperPath } from '../admin/paperPage/paths.ts';
import { ApiError } from '../ui/ApiError.ts';
import { BrandMark } from '../ui/BrandMark.tsx';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import { ThemeButton } from '../ui/ThemeButton.tsx';
import type { TryApi } from './api.ts';
import { TryHome } from './TryHome.tsx';
import { BadLink, Expired, isExpired } from './TryNotice.tsx';

// A Quick Try's page at /try/<token>: the try's states, and the teacher app's
// own paper page at /teste/<code>/verificare (its links to /teste/<code> come
// back here; the try's own address for the page, which stays there). `token` is null
// for an address that is not a try's link.
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
        <ErrorBoundary>{token === null ? <BadLink /> : <TryLoader token={token} tryApi={tryApi} />}</ErrorBoundary>
      </main>
    </ApiProvider>
  );
}

function TryLoader({ token, tryApi }: { token: string; tryApi: TryApi }) {
  const info = useQuery({ queryKey: ['try'], queryFn: () => tryApi.info() });
  if (info.isPending) return <p>Se încarcă…</p>;
  if (isExpired(info.error)) return <Expired />;
  if (info.data === undefined) {
    if (info.error instanceof ApiError && info.error.code === 'unknown_try') return <BadLink />;
    return <ErrorMessage error={info.error} />;
  }
  if (info.data.expired) return <Expired />;
  const home = <TryHome info={info.data} token={token} tryApi={tryApi} />;
  return (
    <Routes>
      <Route path="/" element={home} />
      <Route path="/teste/:code" element={home} />
      <Route path="/teste/:code/verificare" element={<TryPaperPage />} />
      <Route path="/teste/:code/elevi/:id" element={<AllExercises />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}

// The teacher app's address of a paper: inside a try, the paper page with
// every exercise.
function AllExercises() {
  const params = useParams();
  const code = normalizeTestCode(params.code ?? '');
  const submissionId = parsePositiveId(params.id);
  if (code === null || submissionId === null) return <Navigate replace to="/" />;
  return <Navigate replace to={paperPath(code, 'try', { submissionId, key: null }, 'toate')} />;
}
