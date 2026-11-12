import { Route, Routes } from 'react-router';
import { Layout } from './Layout.tsx';
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

// Paths are relative to the /teacher basename set in App.tsx.
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TestsPage />} />
        <Route path="teste/nou" element={<NewTestPage />} />
        <Route path="teste/:code" element={<TestPage />} />
        <Route path="teste/:code/elevi/:submissionId" element={<PaperPage />} />
        <Route path="teste/:code/raport" element={<ReportPage />} />
        <Route path="teste/:code/verificare" element={<ReviewRedirect />} />
        <Route path="clase" element={<LastClassPage />} />
        <Route path="clase/:id" element={<ClassPage />} />
        <Route path="elevi/:id" element={<StudentPage />} />
        <Route path="cautare" element={<SearchPage />} />
        <Route path="setari" element={<SettingsPage />} />
        <Route path="cont" element={<AccountPage />} />
        <Route path="confirma-email" element={<ConfirmEmailPage />} />
        <Route path="parola-noua" element={<NewPasswordPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
