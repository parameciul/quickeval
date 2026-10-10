import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { createFakeApi, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';

const submission: SubmissionDetail = {
  id: 5,
  testCode: '6E2-26T1',
  testTitle: 'Fracții',
  testStatus: 'open',
  studentId: 10,
  studentName: 'Pop Ion',
  status: 'submitted',
  autoSubmitted: false,
  startedAt: '2026-10-06T07:20:00.000Z',
  submittedAt: '2026-10-06T07:40:00.000Z',
  lastError: null,
  files: [
    { id: 21, name: 'IMG_0001.jpg', contentType: 'image/jpeg', size: 820 * 1024, position: 1 },
    { id: 22, name: 'scan.pdf', contentType: 'application/pdf', size: 1.5 * 1024 * 1024, position: 2 },
  ],
  evaluation: null,
};

const apiWith = (detail: SubmissionDetail = submission) =>
  createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 1 }],
    students: {},
    tests: [
      fakeTest({ status: 'open' }, [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 2 })]),
    ],
    submissions: [detail],
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SubmissionPage', () => {
  it('shows the student, the upload state, and the times', async () => {
    renderAdmin('/teste/6E2-26T1/elevi/5', apiWith());
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(screen.getByText(/6E2-26T1 · Fracții · Trimis/)).toBeInTheDocument();
    expect(screen.getByText('Început 6 oct. 2026, 10:20 · trimis 6 oct. 2026, 10:40')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← 6E2-26T1' })).toHaveAttribute('href', '/teste/6E2-26T1');
  });

  it('shows photos inline and links PDFs, in upload order', async () => {
    renderAdmin('/teste/6E2-26T1/elevi/5', apiWith());
    const photo = await screen.findByRole('img', { name: 'Pagina 1' });
    expect(photo).toHaveAttribute('src', '/api/admin/submissions/5/files/21');
    expect(screen.getByText('Pagina 1: IMG_0001.jpg · 820 KB')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Deschide PDF-ul' })).toHaveAttribute('href', '/api/admin/submissions/5/files/22');
    expect(screen.getByText('Pagina 2: scan.pdf · 1,5 MB')).toBeInTheDocument();
  });

  it('numbers the pages in order, without a gap where a page was deleted', async () => {
    const files = [
      { id: 21, name: 'IMG_0001.jpg', contentType: 'image/jpeg', size: 820 * 1024, position: 1 },
      { id: 23, name: 'IMG_0003.jpg', contentType: 'image/jpeg', size: 820 * 1024, position: 3 },
    ];
    renderAdmin('/teste/6E2-26T1/elevi/5', apiWith({ ...submission, files }));
    expect(await screen.findByRole('img', { name: 'Pagina 2' })).toHaveAttribute('src', '/api/admin/submissions/5/files/23');
    expect(screen.getByText('Pagina 2: IMG_0003.jpg · 820 KB')).toBeInTheDocument();
  });

  it('says so when the student has no files yet', async () => {
    renderAdmin('/teste/6E2-26T1/elevi/5', apiWith({ ...submission, status: 'uploading', submittedAt: null, files: [] }));
    expect(await screen.findByText('Elevul nu a încărcat încă niciun fișier.')).toBeInTheDocument();
  });

  it('resets the upload after the teacher confirms and goes back to the test', async () => {
    const api = apiWith();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/teste/6E2-26T1/elevi/5', api, <LocationProbe />);
    await userEvent.click(await screen.findByRole('button', { name: 'Resetează' }));
    expect(api.resetSubmission).toHaveBeenCalledWith(5);
    await expectLocation('/teste/6E2-26T1');
  });

  it('shows the not-found page for an upload id that is not a number', async () => {
    renderAdmin('/teste/6E2-26T1/elevi/abc', apiWith());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('shows the not-found page when the upload belongs to another test', async () => {
    renderAdmin('/teste/6E2-26T9/elevi/5', apiWith());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('shows the server message for an upload that does not exist', async () => {
    renderAdmin('/teste/6E2-26T1/elevi/99', apiWith());
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am găsit ce cauți.');
  });
});
