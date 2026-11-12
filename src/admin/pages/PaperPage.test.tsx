import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { ApiError } from '../api.ts';
import { createFakeApi, fakeEvaluation, fakeItem, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
import { resultRefreshInterval } from './PaperPage.tsx';

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
  resultToken: 'abcdefghijkmnop2abcdefcd',
  resultsOpen: false,
};

// When the robot wrote the result of fakeEvaluation(); each change names it.
const GRADED_AT = '2026-10-07T09:00:00.000Z';

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

// Opens "Alte acțiuni" at the top of the page and chooses an item.
async function chooseAction(name: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Alte acțiuni' }));
  await userEvent.click(screen.getByRole('menuitem', { name }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the paper page', () => {
  it('shows the path, the student, the upload state, and the times', async () => {
    renderAdmin(page, apiWith());
    expect(await screen.findByRole('heading', { level: 1, name: 'Pop Ion' })).toBeInTheDocument();
    expect(screen.getByText(/6E2-26T1 · Fracții · Trimis/)).toBeInTheDocument();
    expect(screen.getByText('Început 6 oct. 2026, 10:20 · trimis 6 oct. 2026, 10:40')).toBeInTheDocument();
    const path = screen.getByRole('navigation', { name: 'Unde ești' });
    expect(within(path).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Teste', 'Clasa 6E2', 'Fracții', 'Pop Ion']);
    expect(within(path).getByRole('link', { name: 'Fracții' })).toHaveAttribute('href', '/teste/6E2-26T1');
    expect(within(path).getByRole('link', { name: 'Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
    expect(screen.getByRole('link', { name: 'Toate notele elevului' })).toHaveAttribute('href', '/elevi/10');
  });

  it('shows the paper beside the exercises, one page at a time with its file, and a PDF in a frame with a link', async () => {
    renderAdmin(page, apiWith());
    expect(await screen.findByText('Pop Ion · pagina 1 din 2')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Pagina 1 a lucrării' })).toHaveAttribute('src', '/api/admin/submissions/5/files/21');
    // Each page names its file, as the student sent it.
    expect(screen.getByText('IMG_0001.jpg · 820 KB')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pagina 2' }));
    expect(screen.getByTitle('Pagina 2 a lucrării')).toHaveAttribute('src', '/api/admin/submissions/5/files/22');
    expect(screen.getByText('scan.pdf · 1,5 MB')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Deschide PDF-ul' })).toHaveAttribute('href', '/api/admin/submissions/5/files/22');
    expect(screen.queryByRole('button', { name: 'Arată fișierele' })).not.toBeInTheDocument();
  });

  it('numbers the pages in order, without a gap where a page was deleted', async () => {
    const files = [
      { id: 21, name: 'IMG_0001.jpg', contentType: 'image/jpeg', size: 820 * 1024, position: 1 },
      { id: 23, name: 'IMG_0003.jpg', contentType: 'image/jpeg', size: 820 * 1024, position: 3 },
    ];
    renderAdmin(page, apiWith({ ...submission, files }));
    await userEvent.click(await screen.findByRole('button', { name: 'Pagina 2' }));
    expect(screen.getByRole('img', { name: 'Pagina 2 a lucrării' })).toHaveAttribute('src', '/api/admin/submissions/5/files/23');
  });

  it('says where an upload without a result is', async () => {
    const { unmount } = renderAdmin(page, apiWith({ ...submission, status: 'uploading', submittedAt: null, files: [] }));
    expect(await screen.findByText('Elevul nu a încărcat niciun fișier.')).toBeInTheDocument();
    expect(screen.getByText('Elevul nu a trimis încă lucrarea.')).toBeInTheDocument();
    unmount();
    renderAdmin(page, apiWith());
    expect(await screen.findByText('Lucrarea se corectează după ce pornești evaluarea.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Alte acțiuni' }));
    expect(screen.queryByRole('menuitem', { name: 'Recorectează' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Resetează' })).toBeInTheDocument();
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

  it('has the PDF buttons only for a graded result', async () => {
    const { unmount } = renderAdmin(page, apiWith(graded));
    expect(await screen.findByRole('button', { name: 'Descarcă PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trimite' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descarcă CSV' })).not.toBeInTheDocument();
    unmount();
    renderAdmin(page, apiWith());
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descarcă PDF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trimite' })).not.toBeInTheDocument();
  });

  it('marks an item as checked', async () => {
    const api = apiWith(graded);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Verificat Subiectul II, ex. 1' }));
    expect(api.correctItem).toHaveBeenCalledWith(5, 32, { gradedAt: GRADED_AT, reviewed: true });
    expect(await within(row('Subiectul II, ex. 1')).findByText('Verificat')).toBeInTheDocument();
    expect(row('Subiectul II, ex. 1')).not.toHaveClass('is-flagged');
    expect(screen.getByText('De verificat: 1')).toBeInTheDocument();
  });

  it('reads the tests of the year once after a check, not twice', async () => {
    const api = apiWith(graded);
    renderAdmin(page, api);
    const check = await screen.findByRole('button', { name: 'Verificat Subiectul II, ex. 1' });
    await vi.waitFor(() => expect(api.listTests).toHaveBeenCalled());
    const before = api.listTests.mock.calls.length;
    await userEvent.click(check);
    expect(await within(row('Subiectul II, ex. 1')).findByText('Verificat')).toBeInTheDocument();
    await vi.waitFor(() => expect(api.listTests).toHaveBeenCalledTimes(before + 1));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(api.listTests).toHaveBeenCalledTimes(before + 1);
  });

  it('puts Verificat in the note with its reason, and only the pencil in the actions cell', async () => {
    renderAdmin(page, apiWith(graded));
    const check = await screen.findByRole('button', { name: 'Verificat Subiectul II, ex. 1' });
    const note = check.closest('.review-note') as HTMLElement;
    expect(note).not.toBeNull();
    expect(within(note).getByText('De verificat: Scrisul nu se citește.')).toBeInTheDocument();
    expect(check.closest('td')).toHaveAttribute('data-label', 'Comentariu');
    const edit = screen.getByRole('button', { name: 'Modifică Subiectul II, ex. 1' });
    expect(edit.closest('td')).toHaveClass('item-check');
    expect(within(edit.closest('td')!).queryByRole('button', { name: /^Verificat/ })).not.toBeInTheDocument();
    // While editing, the reason stays, without the button: saving checks it.
    await userEvent.click(edit);
    expect(await screen.findByRole('button', { name: 'Salvează' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvează' }).closest('td')).not.toHaveClass('item-check');
    expect(within(row('Subiectul II, ex. 1')).getByText('De verificat: Scrisul nu se citește.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verificat Subiectul II, ex. 1' })).not.toBeInTheDocument();
  });

  it('says in the grade strip how many points wait, or that none does', async () => {
    const { unmount } = renderAdmin(page, apiWith(graded));
    expect(await screen.findByText('De verificat: 2')).toHaveClass('tag-wait');
    expect(screen.queryByText('Nimic de verificat')).not.toBeInTheDocument();
    unmount();
    const evaluation = graded.evaluation!;
    const done = {
      ...graded,
      evaluation: {
        ...evaluation,
        flagCount: 0,
        pagesReviewed: true,
        items: evaluation.items.map((item) => ({ ...item, reviewed: true })),
      },
    };
    renderAdmin(page, apiWith(done));
    expect(await screen.findByText('Nimic de verificat')).toHaveClass('tag-ok');
    expect(screen.queryByText(/^De verificat: \d/)).not.toBeInTheDocument();
  });

  it('shows the head with the student, the test, and the take-away actions together', async () => {
    renderAdmin(page, apiWith(graded));
    const name = await screen.findByRole('heading', { level: 1, name: 'Pop Ion' });
    const head = name.closest('.submission-head') as HTMLElement;
    expect(head).not.toBeNull();
    expect(within(head).getByRole('link', { name: 'Toate notele elevului' })).toBeInTheDocument();
    expect(within(head).getByRole('button', { name: 'Descarcă PDF' })).toBeInTheDocument();
    expect(within(head).getByRole('button', { name: 'Alte acțiuni' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the rare actions in a menu at the top, each saying what it deletes', async () => {
    renderAdmin(page, apiWith(graded));
    const more = await screen.findByRole('button', { name: 'Alte acțiuni' });
    expect(screen.queryByRole('menuitem', { name: 'Recorectează' })).not.toBeInTheDocument();
    await userEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const regrade = screen.getByRole('menuitem', { name: 'Recorectează' });
    expect(regrade).toHaveAccessibleDescription('Robotul corectează lucrarea din nou. Punctajele și comentariile schimbate de tine se pierd.');
    const reset = screen.getByRole('menuitem', { name: 'Resetează' });
    expect(reset).toHaveAccessibleDescription('Se șterg fișierele, iar elevul poate lua încărcarea de la capăt, și de pe alt telefon.');
    expect(reset).toHaveClass('is-danger');
    // Esc closes it and gives the focus back to its button.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it('closes the menu and asks first when an action is chosen', async () => {
    const api = apiWith(graded);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin(page, api);
    await chooseAction('Resetează');
    expect(confirm).toHaveBeenCalledWith('Ștergi încărcarea elevului Pop Ion? Elevul o poate lua de la capăt.');
    expect(api.resetSubmission).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
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
    expect(api.correctItem).toHaveBeenCalledWith(5, 32, {
      gradedAt: GRADED_AT,
      points: 3.5,
      comment: 'Bine, dar verifică semnul.',
      reviewed: true,
    });
    expect(await screen.findByText(/Nota/)).toHaveTextContent('Nota 9 · 9 puncte din 10');
    const changed = row('Subiectul II, ex. 1');
    expect(within(changed).getByText('3,5 din 4,5')).toBeInTheDocument();
    expect(within(changed).getByText(/Punctajul robotului înainte de corectura ta:/)).toBeInTheDocument();
    expect(changed.querySelector('.ai-value')).toHaveTextContent('1');
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
    expect(api.correctItem).toHaveBeenCalledWith(5, 31, { gradedAt: GRADED_AT, points: 4 });
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

  it('saves a comment, or checks an item, when the robot gave points off the 0.05 steps', async () => {
    const offGrid = structuredClone(graded);
    offGrid.evaluation!.items[0]!.points = 2.33;
    offGrid.evaluation!.items[1]!.points = 0.33;
    const api = apiWith(offGrid);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Modifică Subiectul I, ex. 1' }));
    expect(screen.getByLabelText('Puncte pentru Subiectul I, ex. 1 (din 4,5)')).toHaveValue('2,33');
    const comment = screen.getByLabelText('Comentariul pentru elev');
    await userEvent.clear(comment);
    await userEvent.type(comment, 'Calculul este bun.');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.correctItem).toHaveBeenCalledWith(5, 31, { gradedAt: GRADED_AT, comment: 'Calculul este bun.' });
    // Salvează on a flagged item checks it.
    await userEvent.click(await screen.findByRole('button', { name: 'Modifică Subiectul II, ex. 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.correctItem).toHaveBeenLastCalledWith(5, 32, { gradedAt: GRADED_AT, reviewed: true });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: 'Am verificat paginile' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Arată paginile' }));
    expect(screen.getByRole('button', { name: 'Pagina 2' })).toHaveAttribute('aria-current', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Am verificat paginile' }));
    expect(api.reviewPages).toHaveBeenCalledWith(5, { gradedAt: GRADED_AT, pagesReviewed: true });
    expect(await screen.findByText('Robotul nu a putut citi: Pagina 2. Ai verificat aceste pagini.')).toBeInTheDocument();
    expect(screen.getByText('De verificat: 1')).toBeInTheDocument();
  });

  it('regrades the upload after the teacher confirms', async () => {
    const api = apiWith(graded);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(page, api);
    await chooseAction('Recorectează');
    expect(confirm).toHaveBeenCalledWith('Recorectezi lucrarea elevului Pop Ion? Corecturile tale se pierd.');
    expect(api.regradeSubmission).toHaveBeenCalledWith(5, GRADED_AT);
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul.');
    expect(await screen.findByText('Lucrarea așteaptă robotul.')).toBeInTheDocument();
    expect(screen.queryByText(/Nota/)).not.toBeInTheDocument();
  });

  it('drops the news about the robot once the new result is back', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const api = apiWith(graded);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(page, api);
    await chooseAction('Recorectează');
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul.');
    // The robot graded the upload again; the page asks for news every 10 seconds.
    api.getSubmission.mockResolvedValueOnce(structuredClone(graded));
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(await screen.findByText(/Nota/)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps the result when the teacher does not confirm the regrade', async () => {
    const api = apiWith(graded);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin(page, api);
    await chooseAction('Recorectează');
    expect(api.regradeSubmission).not.toHaveBeenCalled();
  });

  it('says that an open test grades the upload after Start evaluation', async () => {
    const api = apiWith({ ...graded, testStatus: 'open' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(page, api);
    await chooseAction('Recorectează');
    expect(await screen.findByRole('status')).toHaveTextContent('Lucrarea se corectează din nou după ce pornești evaluarea.');
  });

  it('shows why grading failed and retries it', async () => {
    const api = apiWith({ ...submission, testStatus: 'done', status: 'failed', lastError: 'Robotul nu a terminat la timp.' });
    renderAdmin(page, api);
    expect(await screen.findByText('Corectarea a eșuat. Robotul nu a terminat la timp.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reîncearcă' }));
    expect(api.retrySubmission).toHaveBeenCalledWith(5, '2026-10-06T07:20:00.000Z');
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul.');
  });

  it('resets the upload after the teacher confirms and goes back to the test', async () => {
    const api = apiWith();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(page, api, <LocationProbe />);
    await chooseAction('Resetează');
    expect(api.resetSubmission).toHaveBeenCalledWith(5, '2026-10-06T07:20:00.000Z');
    await expectLocation('/teste/6E2-26T1');
  });

  it('shows the student result link with copy and WhatsApp share', async () => {
    const api = apiWith(graded);
    renderAdmin(page, api);
    expect(await screen.findByText(/Rezultatele nu sunt publicate încă/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Link rezultat' }));
    // The upload already has a link, so no new request is needed.
    expect(api.getResultLink).not.toHaveBeenCalled();
    const url = `${window.location.origin}/u/rezultat/abcdefghijkmnop2abcdefcd`;
    expect(await screen.findByDisplayValue(url)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Deschide' })).toHaveAttribute('href', url);
    expect(screen.getByRole('link', { name: 'Deschide' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      `https://wa.me/?text=${encodeURIComponent(`Rezultatul la testul 6E2-26T1: ${url}`)}`,
    );
  });
  it('hides the result link while the upload is still on the phone', async () => {
    renderAdmin(page, apiWith({ ...submission, status: 'uploading', submittedAt: null }));
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link rezultat' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Linkul cu rezultatul/)).not.toBeInTheDocument();
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

  it('shows the robot confidence as 5 bars with colours, and points coloured by ratio', async () => {
    renderAdmin(page, apiWith(graded));
    expect(await screen.findByText(/Nota/)).toBeInTheDocument();
    const flagged = row('Subiectul II, ex. 1');
    const bars = within(flagged).getByRole('img', { name: /Siguranța robotului/ });
    expect(bars).toHaveClass('conf-2');
    expect(bars.querySelectorAll('.conf-bar.is-on')).toHaveLength(2);
    expect(bars.querySelectorAll('.conf-bar')).toHaveLength(5);
    expect(within(row('Subiectul I, ex. 1')).getByText('4,5 din 4,5')).toHaveClass('points-5');
    expect(within(flagged).getByText('1 din 4,5')).toHaveClass('points-1');
  });

  it('edits points and comments in the same row, without a separate edit row', async () => {
    const api = apiWith(graded);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Modifică Subiectul I, ex. 1' }));
    // The inputs sit in the same table row as the exercise.
    const tableRow = row('Subiectul I, ex. 1');
    expect(within(tableRow).getByLabelText('Puncte pentru Subiectul I, ex. 1 (din 4,5)')).toBeInTheDocument();
    expect(within(tableRow).getByLabelText('Comentariul pentru elev')).toBeInTheDocument();
    expect(within(tableRow).getByRole('button', { name: 'Salvează' })).toBeInTheDocument();
    expect(document.querySelector('tr.edit-row')).toBeNull();
  });

  it('changes the summary and the final lists', async () => {
    const api = apiWith(graded);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Modifică rezumatul' }));
    const summary = screen.getByLabelText('Rezumatul pentru elev');
    await userEvent.clear(summary);
    await userEvent.type(summary, 'Rezumat nou.');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.reviewPages).toHaveBeenCalledWith(5, { gradedAt: GRADED_AT, summary: 'Rezumat nou.' });
    expect(await screen.findByText('Rezumat nou.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Modifică ce a lucrat bine' }));
    const strengths = screen.getByLabelText('Ce a lucrat bine, câte unul pe rând');
    await userEvent.clear(strengths);
    await userEvent.type(strengths, 'Fracții\nCalcule');
    // Two Salvează buttons could exist if both editors were open; only one is.
    const saveButtons = screen.getAllByRole('button', { name: 'Salvează' });
    await userEvent.click(saveButtons[0]!);
    expect(api.reviewPages).toHaveBeenCalledWith(5, { gradedAt: GRADED_AT, strengths: ['Fracții', 'Calcule'] });
  });
});
