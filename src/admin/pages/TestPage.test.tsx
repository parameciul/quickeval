import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api.ts';
import { PDF_TYPE } from '../../../shared/files.ts';
import { createFakeApi, FAKE_TOKEN, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
import { refreshInterval } from './TestPage.tsx';

const uploads = [
  fakeUpload({
    studentId: 10,
    studentName: 'Pop Ion',
    submissionId: 5,
    status: 'submitted',
    fileCount: 3,
    startedAt: '2026-10-06T07:20:00.000Z',
    submittedAt: '2026-10-06T07:40:00.000Z',
    autoSubmitted: true,
  }),
  fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1, startedAt: '2026-10-06T07:25:00.000Z' }),
  fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
];

function apiWith(overrides: Parameters<typeof fakeTest>[0] = {}) {
  return createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
    students: {},
    tests: [fakeTest(overrides, uploads)],
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TestPage', () => {
  it('shows the code, state, title, class, and start time', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'open', uploadToken: FAKE_TOKEN, startedAt: '2026-10-06T07:15:00.000Z' }));
    expect(await screen.findByRole('heading', { name: '6E2-26T1' })).toBeInTheDocument();
    expect(screen.getByText('Deschis')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
    expect(screen.getByText(/început 6 oct\. 2026, 10:15/)).toBeInTheDocument();
  });

  it('reads the code in any letter case and refuses something else', async () => {
    renderAdmin('/teste/6e2-26t1', apiWith());
    expect(await screen.findByRole('heading', { name: '6E2-26T1' })).toBeInTheDocument();
  });

  it('shows the not-found page for a path that is not a test code', async () => {
    renderAdmin('/teste/abc', apiWith());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('starts a draft test and then shows the link and the QR code', async () => {
    const api = apiWith();
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Începe testul' }));
    expect(api.startTest).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByLabelText('Linkul pentru elevi')).toHaveValue(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(screen.getByTitle('Codul QR al linkului')).toBeInTheDocument();
  });

  it('copies the link', async () => {
    const user = userEvent.setup();
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    await user.click(await screen.findByRole('button', { name: 'Copiază linkul' }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(screen.getByRole('status')).toHaveTextContent('Copiat!');
  });

  it('shows the QR code on the whole screen and closes it with Escape', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    await userEvent.click(await screen.findByRole('button', { name: 'Arată codul QR pe tot ecranul' }));
    const dialog = screen.getByRole('dialog', { name: 'Codul QR pentru elevi' });
    expect(within(dialog).getByText(`${window.location.origin}/u/${FAKE_TOKEN}`)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Închide' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('uploads the test file and links to it', async () => {
    const api = apiWith();
    renderAdmin('/teste/6E2-26T1', api);
    const file = new File(['%PDF-1.7'], 'Test.pdf', { type: PDF_TYPE });
    await userEvent.upload(await screen.findByLabelText('Încarcă testul'), file);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'test', file);
    expect(await screen.findByRole('link', { name: 'Test.pdf' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/files/test');
    expect(screen.getByLabelText('Înlocuiește testul')).toBeInTheDocument();
  });

  it('locks the files while the test is being graded', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'evaluating' }));
    expect(await screen.findByLabelText('Încarcă baremul')).toBeDisabled();
  });

  it('lists the uploads of the students', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'open', uploadToken: FAKE_TOKEN, submittedCount: 1, studentCount: 3 }));
    expect(await screen.findByRole('heading', { name: 'Încărcări · trimise 1 din 3' })).toBeInTheDocument();
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    expect(within(pop).getByText('Trimis')).toBeInTheDocument();
    expect(within(pop).getByText('Fără confirmare')).toBeInTheDocument();
    expect(within(pop).getByText('6 oct. 2026, 10:40')).toBeInTheDocument();
    expect(within(pop).getByRole('link', { name: 'Vezi fișierele' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/5');
    const marin = screen.getByRole('rowheader', { name: 'Marin Dan' }).closest('tr')!;
    expect(within(marin).getByText('Nu a trimis')).toBeInTheDocument();
    expect(within(marin).queryByRole('button', { name: 'Resetează' })).not.toBeInTheDocument();
  });

  it('resets an upload only after the teacher confirms', async () => {
    const api = apiWith({ status: 'open', uploadToken: FAKE_TOKEN });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAdmin('/teste/6E2-26T1', api);
    const stan = (await screen.findByRole('rowheader', { name: 'Stan Eva' })).closest('tr')!;
    await userEvent.click(within(stan).getByRole('button', { name: 'Resetează' }));
    expect(api.resetSubmission).not.toHaveBeenCalled();
    await userEvent.click(within(stan).getByRole('button', { name: 'Resetează' }));
    expect(confirm).toHaveBeenLastCalledWith('Ștergi încărcarea elevului Stan Eva? Elevul o poate lua de la capăt.');
    expect(api.resetSubmission).toHaveBeenCalledWith(6);
    expect(await within(stan).findByText('Nu a trimis')).toBeInTheDocument();
  });

  it('keeps the page when a refresh fails, and says why', async () => {
    // Its own rows: the shared rows above were already reset by the test before.
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [
        fakeTest({ status: 'open', uploadToken: FAKE_TOKEN }, [
          fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1, startedAt: '2026-10-06T07:25:00.000Z' }),
        ]),
      ],
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/teste/6E2-26T1', api);
    const stan = (await screen.findByRole('rowheader', { name: 'Stan Eva' })).closest('tr')!;
    vi.mocked(api.getTest).mockRejectedValue(new ApiError(503, 'unavailable', 'Serverul nu răspunde. Încearcă din nou.'));
    await userEvent.click(within(stan).getByRole('button', { name: 'Resetează' }));
    expect(await screen.findByText('Serverul nu răspunde. Încearcă din nou.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '6E2-26T1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arată codul QR pe tot ecranul' })).toBeInTheDocument();
  });

  it('reopens the uploads of a closed test', async () => {
    const api = apiWith({ status: 'done' });
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redeschide încărcarea' }));
    expect(api.reopenTest).toHaveBeenCalledWith('6E2-26T1');
  });

  it('renames the test', async () => {
    const api = apiWith();
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redenumește testul' }));
    const input = screen.getByLabelText('Titlu nou');
    await userEvent.clear(input);
    await userEvent.type(input, 'Teză');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.renameTest).toHaveBeenCalledWith('6E2-26T1', 'Teză');
    expect(await screen.findByText(/^Teză/)).toBeInTheDocument();
  });

  it('deletes the test after the teacher confirms and goes to the test list', async () => {
    const api = apiWith();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/teste/6E2-26T1', api, <LocationProbe />);
    await userEvent.click(await screen.findByRole('button', { name: 'Șterge testul' }));
    expect(api.deleteTest).toHaveBeenCalledWith('6E2-26T1');
    await expectLocation(/^\/$/);
  });

  it('shows the notice that the new-test page passed along', async () => {
    renderAdmin({ pathname: '/teste/6E2-26T1', state: { notice: 'Testul a fost creat, dar fișierul Test.pdf nu s-a încărcat.' } }, apiWith());
    expect(await screen.findByRole('alert')).toHaveTextContent('Testul a fost creat, dar fișierul Test.pdf nu s-a încărcat.');
  });
});

describe('refreshInterval', () => {
  it('asks for news every 10 seconds only while uploads or grading go on', () => {
    expect(refreshInterval('open')).toBe(10_000);
    expect(refreshInterval('evaluating')).toBe(10_000);
    expect(refreshInterval('draft')).toBe(false);
    expect(refreshInterval('done')).toBe(false);
    expect(refreshInterval(undefined)).toBe(false);
  });
});

describe('TestPage evaluation', () => {
  const FILES = { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: { name: 'Barem.pdf', type: PDF_TYPE } };
  const NOW = new Date('2026-10-08T07:00:00.000Z');

  function evaluationApi(overrides: Parameters<typeof fakeTest>[0], rows = uploads) {
    return createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, files: FILES, ...overrides }, structuredClone(rows))],
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts the evaluation now, after the teacher confirms', async () => {
    const api = evaluationApi({});
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAdmin('/teste/6E2-26T1', api);
    const start = await screen.findByRole('button', { name: 'Pornește evaluarea acum' });
    await userEvent.click(start);
    expect(api.evaluateTest).not.toHaveBeenCalled();
    await userEvent.click(start);
    expect(confirm).toHaveBeenLastCalledWith('Pornești evaluarea acum? Elevii nu mai pot încărca după asta.');
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByText('Se corectează', { selector: '.status' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Robotul pornește la următoarea lui verificare.');
    expect(screen.getByText(/^Robotul corectează lucrările trimise\. Evaluarea a pornit la 8 oct\. 2026, 10:00\.$/)).toBeInTheDocument();
    expect(screen.getByText('Robotul nu a verificat încă dacă are lucrări de corectat.')).toBeInTheDocument();
    expect(screen.getByText('Corectarea poate întârzia.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Linkul pentru elevi')).not.toBeInTheDocument();
  });

  it('says what the evaluation still needs', async () => {
    const empty = [fakeUpload({ studentId: 12, studentName: 'Marin Dan' })];
    renderAdmin('/teste/6E2-26T1', evaluationApi({ files: { test: FILES.test, barem: null } }, empty));
    expect(await screen.findByRole('button', { name: 'Pornește evaluarea acum' })).toBeDisabled();
    expect(screen.getByText('Ca să pornești evaluarea: Încarcă baremul. Niciun elev nu a încărcat încă fișiere.')).toBeInTheDocument();
    expect(screen.getByLabelText('Sau pornește evaluarea automat la')).toBeDisabled();
  });

  it("schedules the evaluation in Romania's time, and cancels the schedule", async () => {
    const api = evaluationApi({});
    renderAdmin('/teste/6E2-26T1', api);
    const input = await screen.findByLabelText('Sau pornește evaluarea automat la');
    expect(input).toHaveAttribute('min', '2026-10-08T10:00');
    expect(input).toHaveAttribute('max', '2026-12-07T09:00');
    fireEvent.change(input, { target: { value: '2026-10-20T10:15' } });
    await userEvent.click(screen.getByRole('button', { name: 'Programează' }));
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', '2026-10-20T07:15:00.000Z');
    expect(await screen.findByText(/^Evaluarea pornește automat la 20 oct\. 2026, 10:15\./)).toBeInTheDocument();
    expect(screen.getByText('Robotul nu a verificat încă dacă are lucrări de corectat.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Anulează programarea' }));
    expect(api.cancelSchedule).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByLabelText('Sau pornește evaluarea automat la')).toHaveValue('');
    expect(screen.queryByText(/Robotul nu a verificat/)).not.toBeInTheDocument();
  });

  it('shows a problem of the barem, takes a new barem, and grades anyway', async () => {
    const message = 'Punctajele din barem dau 9, dar totalul este 10.';
    const api = evaluationApi({ status: 'evaluating', exerciseList: { status: 'problem', message } });
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText('Înlocuiește baremul')).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Folosește oricum' }));
    expect(api.acceptExerciseList).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByRole('status')).toHaveTextContent('Robotul pornește la următoarea lui verificare.');
    await screen.findByLabelText('Înlocuiește baremul');
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Înlocuiește baremul')).toBeDisabled();
  });

  it('accepts a problem of the barem on an open test without a robot message', async () => {
    const message = 'Punctajele din barem dau 9, dar totalul este 10.';
    const api = evaluationApi({ exerciseList: { status: 'problem', message } });
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Folosește oricum' }));
    expect(api.acceptExerciseList).toHaveBeenCalledWith('6E2-26T1');
    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('lets the robot try the barem again', async () => {
    const api = evaluationApi({ status: 'evaluating', exerciseList: { status: 'failed', message: 'Robotul nu a terminat la timp.' } });
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByText('Robotul nu a terminat la timp.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(api.retryExerciseList).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByRole('status')).toHaveTextContent('Robotul pornește la următoarea lui verificare.');
  });

  it('shows the grades, the items to check, and a failed grading to try again', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 4, grade: 8.75, flagCount: 2 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'failed', fileCount: 1, lastError: 'Robotul nu a terminat la timp.' }),
    ];
    const api = evaluationApi({ status: 'done', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, rows);
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByRole('heading', { name: 'Încărcări · trimise 2 din 2 · corectate 1' })).toBeInTheDocument();
    expect(screen.getByText('Corectarea s-a terminat. Evaluarea a pornit la 7 oct. 2026, 11:00.')).toBeInTheDocument();
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    expect(within(pop).getByText('8,75')).toBeInTheDocument();
    expect(within(pop).getByText('2')).toBeInTheDocument();
    expect(within(pop).queryByRole('button', { name: 'Reîncearcă' })).not.toBeInTheDocument();
    const stan = screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!;
    expect(within(stan).getByText('Robotul nu a terminat la timp.')).toBeInTheDocument();
    await userEvent.click(within(stan).getByRole('button', { name: 'Reîncearcă' }));
    expect(api.retrySubmission).toHaveBeenCalledWith(6);
    expect(await within(stan).findByText('Trimis')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Robotul pornește la următoarea lui verificare.');
  });
});
