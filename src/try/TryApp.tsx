import { useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router';
import { parsePositiveId } from '../../shared/ids.ts';
import { normalizeTestCode } from '../../shared/tests.ts';
import type { AdminApi } from '../admin/api.ts';
import { ApiProvider } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { englishAddress } from '../admin/legacyAddress.ts';
import { TryPaperPage } from '../admin/pages/PaperPage.tsx';
import { paperPath } from '../admin/paperPage/paths.ts';
import { ApiError } from '../ui/ApiError.ts';
import { BrandMark } from '../ui/BrandMark.tsx';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import { ThemeButton } from '../ui/ThemeButton.tsx';
import type { TryApi } from './api.ts';
import { PhonePage } from './PhonePage.tsx';
import { TryHome } from './TryHome.tsx';
import { BadLink, Expired, isExpired } from './TryNotice.tsx';
import { t } from '../i18n/t.ts';

// A Quick Try's page at /try/<token>: the try's states, and the teacher app's
// own paper page at /tests/<code>/review (its links to /tests/<code> come
// back here; the try's own address for the page, which stays there). `token` is null
// for an address that is not a try's link.
export function TryRoutes({ token, api, tryApi }: { token: string | null; api: AdminApi; tryApi: TryApi }) {
  return (
    <ApiProvider api={api}>
      <header className="topbar try-topbar">
        <a className="brand" href="/" aria-label={t('MQGrader by Laura Miron')}>
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
  const location = useLocation();
  const info = useQuery({ queryKey: ['try'], queryFn: () => tryApi.info() });
  // An old Romanian address of a paper (/teste/<code>/verificare?lucrare=…)
  // becomes its English one before a page reads it.
  const english = englishAddress(location);
  if (english) return <Navigate replace to={english} state={location.state} />;
  if (info.isPending) return <p>{t('Se încarcă…')}</p>;
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
      <Route path="/phone" element={<PhonePage info={info.data} tryApi={tryApi} />} />
      {/* The phone page's first address: its QR codes must not fall to "*", the try's page. */}
      <Route path="/telefon" element={<ToPhonePage />} />
      <Route path="/tests/:code" element={home} />
      <Route path="/tests/:code/review" element={<TryPaperPage />} />
      <Route path="/tests/:code/papers/:id" element={<AllExercises />} />
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
  return <Navigate replace to={paperPath(code, 'try', { submissionId, key: null }, 'all')} />;
}

// The old address of the phone page, with its flag and anchor kept.
function ToPhonePage() {
  const { search, hash } = useLocation();
  return <Navigate replace to={{ pathname: '/phone', search, hash }} />;
}
