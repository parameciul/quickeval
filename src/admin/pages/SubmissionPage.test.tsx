import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { ApiError } from '../api.ts';
import { createFakeApi, fakeEvaluation, fakeItem, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
import { resultRefreshInterval } from './SubmissionPage.tsx';

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

// A graded upload: I.1 full points; II.1 flagged by the robot; the second
// page could not be read. Total 6,5 of 10 (4,5 + 1 + 1 din oficiu).
const graded: SubmissionDetail = {
  ...submission,
  testStatus: 'done',
  status: 'graded',
  evaluation: fakeEvaluation(
    [
      fakeItem({ id: 31, exerciseId: 'I.1', label: 'Subiectul I, ex. 1', points: 4.5 }),
      fakeItem({
        id: 32,
        exerciseId: 'II.1',
        label: 'Subiectul II, ex. 1',
        points: 1,
        studentAnswer: 'x = 3',
        comment: 'Verifică semnul.',
        confidence: 'low',
        needsReview: true,
        reviewReason: 'Scrisul nu se citește.',
      }),
    ],
    {
      summary: 'Ai lucrat bine la fracții.',
      strengths: ['Fracții echivalente'],
      recommendations: ['Exersează ecuațiile.'],
      unreadable: ['student/page-02.pdf'],
    },
  ),
};

const apiWith = (detail: SubmissionDetail = submission) =>
  createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 1 }],
    students: {},
    tests: [
      fakeTest({ status: detail.testStatus }, [
        fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: detail.status, fileCount: 2 }),
      ]),
    ],
    submissions: [structuredClone(detail)],
  });

const page = '/teste/6E2-26T1/elevi/5';
const row = (label: string) => screen.getByRole('row', { name: new RegExp(label) });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SubmissionPage', () => {
  it('shows the student, the upload state, and the times', async () => {
    renderAdmin(page, apiWith());
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(screen.getByText(/6E2-26T1 · Fracții · Trimis/)).toBeInTheDocument();
    expect(screen.getByText('Început 6 oct. 2026, 10:20 · trimis 6 oct. 2026, 10:40')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← 6E2-26T1' })).toHaveAttribute('href', '/teste/6E2-26T1');
  });

  it('shows photos inline and PDFs in a frame with a link, in upload order', async () => {
    renderAdmin(page, apiWith());
    const photo = await screen.findByRole('img', { name: 'Pagina 1' });
    expect(photo).toHaveAttribute('src', '/api/admin/submissions/5/files/21');
    expect(screen.getByText('Pagina 1: IMG_0001.jpg · 820 KB')).toBeInTheDocument();
    expect(screen.getByTitle('Pagina 2')).toHaveAttribute('src', '/api/admin/submissions/5/files/22');
    expect(screen.getByRole('link', { name: 'Deschide PDF-ul' })).toHaveAttribute('href', '/api/admin/submissions/5/files/22');
    expect(screen.getByText('Pagina 2: scan.pdf · 1,5 MB')).toBeInTheDocument();
  });

  it('numbers the pages in order, without a gap where a page was deleted', async () => {
    const files = [
      { id: 21, name: 'IMG_0001.jpg', contentType: 'image/jpeg', size: 820 * 1024, position: 1 },
      { id: 23, name: 'IMG_0003.jpg', contentType: 'image/jpeg', size: 820 * 1024, position: 3 },
    ];
    renderAdmin(page, apiWith({ ...submission, files }));
    expect(await screen.findByRole('img', { name: 'Pagina 2' })).toHaveAttribute('src', '/api/admin/submissions/5/files/23');
    expect(screen.getByText('Pagina 2: IMG_0003.jpg · 820 KB')).toBeInTheDocument();
  });

  it('says where an upload without a result is', async () => {
    const { unmount } = renderAdmin(page, apiWith({ ...submission, status: 'uploading', submittedAt: null, files: [] }));
    expect(await screen.findByText('Elevul nu a încărcat încă niciun fișier.')).toBeInTheDocument();
    expect(screen.getByText('Elevul nu a trimis încă lucrarea.')).toBeInTheDocument();
    unmount();
    renderAdmin(page, apiWith());
    expect(await screen.findByText('Lucrarea se corectează după ce pornești evaluarea.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recorectează' })).not.toBeInTheDocument();
  });

  it('asks for news every 10 seconds only while the robot grades the upload', () => {
    expect(resultRefreshInterval({ ...submission, testStatus: 'evaluating' })).toBe(10_000);
    expect(resultRefreshInterval({ ...submission, status: 'grading', testStatus: 'evaluating' })).toBe(10_000);
    expect(resultRefreshInterval(submission)).toBe(false);
    expect(resultRefreshInterval(graded)).toBe(false);
    expect(resultRefreshInterval(undefined)).toBe(false);
  });

  it('shows the grade, the points of each exercise, and the words to the student', async () => {
    renderAdmin(page, apiWith(graded));
    expect(await screen.findByText(/Nota/)).toHaveTextContent('Nota 6,5 · 6,5 puncte din 10, cu 1 din oficiu');
    // II.1 waits for a check, and the unreadable page counts once.
    expect(screen.getByText('De verificat: 2')).toBeInTheDocument();
    expect(within(row('Subiectul I, ex. 1')).getByText('4,5 din 4,5')).toBeInTheDocument();
    const flagged = row('Subiectul II, ex. 1');
    expect(flagged).toHaveClass('is-flagged');
    expect(within(flagged).getByText('x = 3')).toBeInTheDocument();
    expect(within(flagged).getByText('De verificat: Scrisul nu se citește.')).toBeInTheDocument();
    expect(within(flagged).getByText('Mică')).toBeInTheDocument();
    expect(row('Subiectul I, ex. 1')).not.toHaveClass('is-flagged');
    expect(screen.getByText('Ai lucrat bine la fracții.')).toBeInTheDocument();
    expect(screen.getByText('Fracții echivalente')).toBeInTheDocument();
    expect(screen.getByText('Exersează ecuațiile.')).toBeInTheDocument();
  });

  it('marks an item as checked', async () => {
    const api = apiWith(graded);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Verificat Subiectul II, ex. 1' }));
    expect(api.correctItem).toHaveBeenCalledWith(32, { reviewed: true });
    expect(await within(row('Subiectul II, ex. 1')).findByText('Verificat')).toBeInTheDocument();
    expect(row('Subiectul II, ex. 1')).not.toHaveClass('is-flagged');
    expect(screen.getByText('De verificat: 1')).toBeInTheDocument();
  });

  it('changes the points and the comment of an item, and checks it', async () => {
    const api = apiWith(graded);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Modifică Subiectul II, ex. 1' }));
    const points = screen.getByLabelText('Puncte pentru Subiectul II, ex. 1 (din 4,5)');
    expect(points).toHaveValue('1');
    await userEvent.clear(points);
    await userEvent.type(points, '3,5');
    const comment = screen.getByLabelText('Comentariul pentru elev');
    await userEvent.clear(comment);
    await userEvent.type(comment, 'Bine, dar verifică semnul.');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.correctItem).toHaveBeenCalledWith(32, { points: 3.5, comment: 'Bine, dar verifică semnul.', reviewed: true });
    expect(await screen.findByText(/Nota/)).toHaveTextContent('Nota 9 · 9 puncte din 10');
    const changed = row('Subiectul II, ex. 1');
    expect(within(changed).getByText('3,5 din 4,5')).toBeInTheDocument();
    expect(within(changed).getByText('Robotul: 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Comentariul pentru elev')).not.toBeInTheDocument();
  });

  it('sends only what changed for an item that waits for no check', async () => {
    const api = apiWith(graded);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Modifică Subiectul I, ex. 1' }));
    const points = screen.getByLabelText('Puncte pentru Subiectul I, ex. 1 (din 4,5)');
    await userEvent.clear(points);
    await userEvent.type(points, '4');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.correctItem).toHaveBeenCalledWith(31, { points: 4 });
  });

  it('refuses points off the 0.05 steps or above the maximum without asking the server', async () => {
    const api = apiWith(graded);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Modifică Subiectul I, ex. 1' }));
    const points = screen.getByLabelText('Puncte pentru Subiectul I, ex. 1 (din 4,5)');
    for (const typed of ['4,6', '2,33', 'patru']) {
      await userEvent.clear(points);
      await userEvent.type(points, typed);
      await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Punctajul este între 0 și 4,5, din 0,05 în 0,05.');
    }
    expect(api.correctItem).not.toHaveBeenCalled();
  });

  it('closes the form without a request on Renunță, or when nothing changed', async () => {
    const api = apiWith(graded);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Modifică Subiectul I, ex. 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Renunță' }));
    expect(screen.queryByLabelText(/Puncte pentru/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Modifică Subiectul I, ex. 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(screen.queryByLabelText(/Puncte pentru/)).not.toBeInTheDocument();
    expect(api.correctItem).not.toHaveBeenCalled();
  });

  it('shows the server message when a correction fails', async () => {
    const api = apiWith(graded);
    api.correctItem.mockRejectedValueOnce(new ApiError(409, 'not_graded', 'Lucrarea se corectează din nou. Reîncarcă pagina.'));
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Verificat Subiectul II, ex. 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Lucrarea se corectează din nou. Reîncarcă pagina.');
  });

  it('names the pages that the robot could not read, until the teacher checks them', async () => {
    const api = apiWith(graded);
    renderAdmin(page, api);
    expect(await screen.findByText(/Robotul nu a putut citi: Pagina 2\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Am verificat paginile' }));
    expect(api.reviewPages).toHaveBeenCalledWith(5, true);
    expect(await screen.findByText('Robotul nu a putut citi: Pagina 2. Ai verificat aceste pagini.')).toBeInTheDocument();
    expect(screen.getByText('De verificat: 1')).toBeInTheDocument();
  });

  it('regrades the upload after the teacher confirms', async () => {
    const api = apiWith(graded);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Recorectează' }));
    expect(confirm).toHaveBeenCalledWith('Recorectezi lucrarea elevului Pop Ion? Corecturile tale se pierd.');
    expect(api.regradeSubmission).toHaveBeenCalledWith(5);
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul.');
    expect(await screen.findByText('Lucrarea așteaptă robotul.')).toBeInTheDocument();
    expect(screen.queryByText(/Nota/)).not.toBeInTheDocument();
  });

  it('keeps the result when the teacher does not confirm the regrade', async () => {
    const api = apiWith(graded);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Recorectează' }));
    expect(api.regradeSubmission).not.toHaveBeenCalled();
  });

  it('says that an open test grades the upload after Start evaluation', async () => {
    const api = apiWith({ ...graded, testStatus: 'open' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Recorectează' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Lucrarea se corectează din nou după ce pornești evaluarea.');
  });

  it('shows why grading failed and retries it', async () => {
    const api = apiWith({ ...submission, testStatus: 'done', status: 'failed', lastError: 'Robotul nu a terminat la timp.' });
    renderAdmin(page, api);
    expect(await screen.findByText('Corectarea a eșuat. Robotul nu a terminat la timp.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reîncearcă' }));
    expect(api.retrySubmission).toHaveBeenCalledWith(5);
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul.');
  });

  it('resets the upload after the teacher confirms and goes back to the test', async () => {
    const api = apiWith();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(page, api, <LocationProbe />);
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
