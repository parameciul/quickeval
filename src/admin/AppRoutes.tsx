import { Navigate, Route, Routes, useLocation } from 'react-router';
import { Layout } from './Layout.tsx';
import { englishAddress } from './legacyAddress.ts';
import { AccountPage } from './pages/AccountPage.tsx';
import { ClassPage } from './pages/ClassPage.tsx';
import { ConfirmEmailPage } from './pages/ConfirmEmailPage.tsx';
import { LastClassPage } from './pages/LastClassPage.tsx';
import { NewPasswordPage } from './pages/NewPasswordPage.tsx';
import { NewTestPage } from './pages/NewTestPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { PaperPage, ReviewRedirect } from './pages/PaperPage.tsx';
import { ReportPage } from './pages/ReportPage.tsx';
import { SearchPage } from './pages/SearchPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { StudentPage } from './pages/StudentPage.tsx';
import { TestPage } from './pages/TestPage.tsx';
import { TestsPage } from './pages/TestsPage.tsx';

// Paths are relative to the /teacher basename set in App.tsx. An old
// Romanian address (an email link, a bookmark) first becomes its English one,
// before the login check and before any page reads it.
export function AppRoutes() {
  const location = useLocation();
  const english = englishAddress(location);
  if (english) return <Navigate replace to={english} state={location.state} />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TestsPage />} />
        <Route path="tests/new" element={<NewTestPage />} />
        <Route path="tests/:code" element={<TestPage />} />
        <Route path="tests/:code/papers/:submissionId" element={<PaperPage />} />
        <Route path="tests/:code/report" element={<ReportPage />} />
        <Route path="tests/:code/review" element={<ReviewRedirect />} />
        <Route path="classes" element={<LastClassPage />} />
        <Route path="classes/:id" element={<ClassPage />} />
        <Route path="students/:id" element={<StudentPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="confirm-email" element={<ConfirmEmailPage />} />
        <Route path="new-password" element={<NewPasswordPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
