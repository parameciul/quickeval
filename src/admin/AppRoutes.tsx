import { Route, Routes } from 'react-router';
import { Layout } from './Layout.tsx';
import { AccountPage } from './pages/AccountPage.tsx';
import { ClassesPage } from './pages/ClassesPage.tsx';
import { ClassPage } from './pages/ClassPage.tsx';
import { ClassStudentsPage } from './pages/ClassStudentsPage.tsx';
import { NewTestPage } from './pages/NewTestPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { ReportPage } from './pages/ReportPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { StudentPage } from './pages/StudentPage.tsx';
import { SubmissionPage } from './pages/SubmissionPage.tsx';
import { TestPage } from './pages/TestPage.tsx';
import { TestsPage } from './pages/TestsPage.tsx';

// Paths are relative to the /admin basename set in App.tsx.
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TestsPage />} />
        <Route path="teste/nou" element={<NewTestPage />} />
        <Route path="teste/:code" element={<TestPage />} />
        <Route path="teste/:code/elevi/:submissionId" element={<SubmissionPage />} />
        <Route path="teste/:code/raport" element={<ReportPage />} />
        <Route path="clase" element={<ClassesPage />} />
        <Route path="clase/:id" element={<ClassPage />} />
        <Route path="clase/:id/elevi" element={<ClassStudentsPage />} />
        <Route path="elevi/:id" element={<StudentPage />} />
        <Route path="setari" element={<SettingsPage />} />
        <Route path="cont" element={<AccountPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
