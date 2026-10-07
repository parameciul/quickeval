import { Route, Routes } from 'react-router';
import { Layout } from './Layout.tsx';
import { ClassesPage } from './pages/ClassesPage.tsx';
import { ClassPage } from './pages/ClassPage.tsx';
import { NewTestPage } from './pages/NewTestPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
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
        <Route path="clase" element={<ClassesPage />} />
        <Route path="clase/:id" element={<ClassPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
