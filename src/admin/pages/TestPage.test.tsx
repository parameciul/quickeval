import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api.ts';
import { PDF_TYPE } from '../../../shared/files.ts';
import type { UploadRow } from '../../../shared/api.ts';
import { robotStartMessage } from '../../ui/format.ts';
import { createFakeApi, FAKE_MULTI_TOKEN, FAKE_STARTED_AT, FAKE_TOKEN, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
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

// The upload links start hidden.
const showLinks = async () => userEvent.click(await screen.findByRole('button', { name: 'Arată linkurile' }));

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('TestPage', () => {
  it('shows the code, state, title, class, and start time', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'open', uploadToken: FAKE_TOKEN, startedAt: '2026-10-06T07:15:00.000Z' }));
    expect(await screen.findByRole('heading', { name: '6E2-26T1' })).toBeInTheDocument();
    expect(screen.getByText('Deschis')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
    expect(screen.getByRole('link', { name: 'Clasa 6E2' })).toHaveClass('class-badge', 'class-tone');
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
    await showLinks();
    expect(await screen.findByLabelText('Linkul pentru elevi')).toHaveValue(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(screen.getByTitle('Codul QR al linkului')).toBeInTheDocument();
  });

  it('shows the print block only while the test is open', async () => {
    const { unmount } = renderAdmin('/teste/6E2-26T1', apiWith());
    await screen.findByRole('heading', { name: '6E2-26T1' });
    expect(screen.queryByText('Testul pentru tipărit:')).not.toBeInTheDocument();
    unmount();
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'evaluating' }));
    await screen.findByRole('heading', { name: '6E2-26T1' });
    expect(screen.queryByText('Testul pentru tipărit:')).not.toBeInTheDocument();
  });

  it('says the robot started after Start test', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null } }));
    await userEvent.click(await screen.findByRole('button', { name: 'Începe testul' }));
    expect(await screen.findByText(robotStartMessage('dispatched'))).toBeInTheDocument();
  });

  it('copies the link', async () => {
    const user = userEvent.setup();
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    await showLinks();
    await user.click(await screen.findByRole('button', { name: 'Copiază linkul' }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(screen.getByRole('status')).toHaveTextContent('Copiat!');
  });

  it('shows the QR code on the whole screen and closes it with Escape', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    await showLinks();
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

  it('drops "Fără confirmare" once the upload is graded', async () => {
    const graded = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', grade: 8, autoSubmitted: true })];
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 1 }],
      students: {},
      tests: [fakeTest({ status: 'done' }, graded)],
    });
    renderAdmin('/teste/6E2-26T1', api);
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    expect(within(pop).queryByText('Fără confirmare')).not.toBeInTheDocument();
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
    expect(within(pop).getByRole('link', { name: 'Vezi lucrarea' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/5');
    const marin = screen.getByRole('rowheader', { name: 'Marin Dan' }).closest('tr')!;
    expect(within(marin).getByText('Nu a trimis')).toBeInTheDocument();
    expect(within(marin).queryByRole('button', { name: 'Resetează' })).not.toBeInTheDocument();
  });

  it('marks the uploads table selectable only while the test is open', async () => {
    const { unmount } = renderAdmin('/teste/6E2-26T1', apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    const openTable = await screen.findByRole('table', { name: 'Încărcările elevilor' });
    expect(openTable).toHaveClass('uploads', 'is-selectable');
    unmount();
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'done' }));
    const doneTable = await screen.findByRole('table', { name: 'Încărcările elevilor' });
    expect(doneTable).toHaveClass('uploads');
    expect(doneTable).not.toHaveClass('is-selectable');
  });

  it('labels the upload cells with the column names for narrow screens', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    const labels = within(pop)
      .getAllByRole('cell')
      .map((cell) => cell.getAttribute('data-label'));
    expect(labels).toEqual([null, 'Stare', 'Fișiere', 'Ora', 'Nota', 'De verificat', null]);
  });

  it('has no Model column unless the setting is on', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    await screen.findByRole('rowheader', { name: 'Pop Ion' });
    expect(screen.queryByRole('columnheader', { name: 'Model' })).not.toBeInTheDocument();
  });

  it('shows the model and effort of each grading after Nota when the setting is on', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9, model: 'claude-opus-5-5', effort: 'medium' }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 2, grade: 7, model: 'sonnet', effort: null }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
    ];
    const detail = fakeTest({ status: 'done' }, rows);
    renderAdmin('/teste/6E2-26T1', createFakeApi({ classes: [], students: {}, tests: [{ ...detail, showModel: true }] }));
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers.indexOf('Model')).toBe(headers.indexOf('Nota') + 1);
    expect(headers.indexOf('De verificat')).toBe(headers.indexOf('Model') + 1);
    const cell = within(pop).getByText('claude-opus-5-5 · medium');
    expect(cell).toHaveAttribute('data-label', 'Model');
    const stan = screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!;
    expect(within(stan).getByText('sonnet')).toHaveAttribute('data-label', 'Model');
    const marin = screen.getByRole('rowheader', { name: 'Marin Dan' }).closest('tr')!;
    expect(marin.querySelector('[data-label="Model"]')).toHaveTextContent('—');
  });

  it('marks only the selectable rows for the narrow-screen layout', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    expect(pop).toHaveClass('has-select');
    const stan = screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!;
    expect(stan).toHaveClass('has-select');
    const marin = screen.getByRole('rowheader', { name: 'Marin Dan' }).closest('tr')!;
    expect(marin).not.toHaveClass('has-select');
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
    expect(api.resetSubmission).toHaveBeenCalledWith(6, '2026-10-06T07:25:00.000Z');
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
    expect(screen.getByRole('button', { name: 'Arată linkurile' })).toBeInTheDocument();
  });

  it('reopens the uploads of a closed test', async () => {
    const api = apiWith({ status: 'done' });
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redeschide încărcarea' }));
    expect(api.reopenTest).toHaveBeenCalledWith('6E2-26T1');
  });

  it('archives a finished test and offers to take it out of the archive', async () => {
    const api = apiWith({ status: 'done' });
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByText('Testul nu mai apare în lista clasei și în Teste. Îl găsești cu „Arată și testele arhivate”.')).toBeInTheDocument();
    expect(screen.queryByText('Arhivat')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Arhivează testul' }));
    expect(api.setTestArchived).toHaveBeenCalledWith('6E2-26T1', true);
    expect(await screen.findByText('Arhivat')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arhivează testul' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Scoate din arhivă' }));
    expect(api.setTestArchived).toHaveBeenLastCalledWith('6E2-26T1', false);
    expect(await screen.findByRole('button', { name: 'Arhivează testul' })).toBeInTheDocument();
    expect(screen.queryByText('Arhivat')).not.toBeInTheDocument();
  });

  it('offers no archive while the test is not finished', async () => {
    for (const status of ['draft', 'open', 'evaluating'] as const) {
      const view = renderAdmin('/teste/6E2-26T1', apiWith({ status }));
      expect(await screen.findByRole('button', { name: 'Șterge testul' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Arhivează testul' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Scoate din arhivă' })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('says why the archive was refused', async () => {
    const api = apiWith({ status: 'done' });
    vi.mocked(api.setTestArchived).mockRejectedValueOnce(new ApiError(409, 'not_done', 'Poți arhiva un test după ce s-a terminat corectarea.'));
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Arhivează testul' }));
    expect(await screen.findByText('Poți arhiva un test după ce s-a terminat corectarea.')).toBeInTheDocument();
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

  it('creates the multi-upload link on demand and then shows it', async () => {
    const api = apiWith({ status: 'open', uploadToken: FAKE_TOKEN });
    renderAdmin('/teste/6E2-26T1', api);
    await showLinks();
    expect(await screen.findByLabelText('Linkul pentru elevi')).toHaveValue(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(screen.queryByLabelText('Linkul pentru mai multe încărcări')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Creează linkul pentru mai multe încărcări' }));
    expect(api.createMultiUploadLink).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByLabelText('Linkul pentru mai multe încărcări')).toHaveValue(
      `${window.location.origin}/u/${FAKE_MULTI_TOKEN}`,
    );
  });

  it('shows both upload links when the multi-upload link already exists', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'open', uploadToken: FAKE_TOKEN, multiUploadToken: FAKE_MULTI_TOKEN }));
    await showLinks();
    expect(await screen.findByLabelText('Linkul pentru elevi')).toHaveValue(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(screen.getByLabelText('Linkul pentru mai multe încărcări')).toHaveValue(`${window.location.origin}/u/${FAKE_MULTI_TOKEN}`);
    expect(screen.queryByRole('button', { name: 'Creează linkul pentru mai multe încărcări' })).not.toBeInTheDocument();
  });

  it('starts with the upload links hidden, shows them on request, and keeps the choice after a reload', async () => {
    const api = apiWith({ status: 'open', uploadToken: FAKE_TOKEN, multiUploadToken: FAKE_MULTI_TOKEN });
    const { unmount } = renderAdmin('/teste/6E2-26T1', api);
    const toggle = await screen.findByRole('button', { name: 'Arată linkurile' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Linkul pentru elevi')).not.toBeInTheDocument();
    // The button sits on the row of the heading.
    expect(toggle.parentElement).toContainElement(screen.getByRole('heading', { name: 'Încărcarea lucrărilor' }));
    await userEvent.click(toggle);
    expect(await screen.findByLabelText('Linkul pentru elevi')).toBeInTheDocument();
    expect(screen.getByLabelText('Linkul pentru mai multe încărcări')).toBeInTheDocument();

    // A reload keeps the page as the teacher left it.
    unmount();
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByLabelText('Linkul pentru elevi')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ascunde linkurile' }));
    expect(screen.queryByLabelText('Linkul pentru elevi')).not.toBeInTheDocument();
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

  function evaluationApi(overrides: Parameters<typeof fakeTest>[0], rows = uploads, lastCheckAt: string | null = null) {
    const detail = fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, files: FILES, print: { status: 'ready', fromWord: false }, ...overrides }, structuredClone(rows));
    detail.robot.lastCheckAt = lastCheckAt;
    return createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [detail],
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts the evaluation now for the selected uploads, after the teacher confirms', async () => {
    const api = evaluationApi({});
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAdmin('/teste/6E2-26T1', api);
    const start = await screen.findByRole('button', { name: 'Pornește evaluarea acum' });
    // Nothing selected yet: the button stays off.
    expect(start).toBeDisabled();
    expect(screen.getByText('Selectează cel puțin o lucrare cu fișiere din tabel.')).toBeInTheDocument();
    // Select one upload with files (its row checkbox, not the shared header).
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    await userEvent.click(within(pop).getByLabelText('Selectează lucrarea elevului Pop Ion'));
    expect(start).toBeEnabled();
    await userEvent.click(start);
    expect(api.evaluateTest).not.toHaveBeenCalled();
    await userEvent.click(start);
    expect(confirm).toHaveBeenLastCalledWith(
      'Pornești evaluarea acum pentru 1 lucrare? Elevii nu mai pot încărca după asta. Lucrările neselectate cu fișiere așteaptă o evaluare ulterioară.',
    );
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', undefined, [5]);
    expect(await screen.findByText('Se corectează', { selector: '.status' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.');
    expect(screen.getByText(/^Robotul corectează lucrările trimise\. Evaluarea a pornit la 8 oct\. 2026, 10:00\.$/)).toBeInTheDocument();
    expect(screen.getByText('Robotul nu a verificat încă dacă are lucrări de corectat.')).toBeInTheDocument();
    expect(screen.getByText('Corectarea poate întârzia.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Linkul pentru elevi')).not.toBeInTheDocument();
  });

  it('selects only the uploads with files for the evaluation', async () => {
    const rows = [
      fakeUpload({
        studentId: 10,
        studentName: 'Pop Ion',
        submissionId: 5,
        status: 'submitted',
        fileCount: 3,
        startedAt: '2026-10-06T07:20:00.000Z',
        submittedAt: '2026-10-06T07:40:00.000Z',
      }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1, startedAt: '2026-10-06T07:25:00.000Z' }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
    ];
    renderAdmin('/teste/6E2-26T1', evaluationApi({}, rows));
    const start = await screen.findByRole('button', { name: 'Pornește evaluarea acum' });
    expect(start).toBeDisabled();
    // The student without files has no checkbox; the graded one cannot be picked.
    const marin = screen.getByRole('rowheader', { name: 'Marin Dan' }).closest('tr')!;
    expect(within(marin).queryByRole('checkbox')).not.toBeInTheDocument();
    // The header checkbox selects every upload with files, and clears them again.
    await userEvent.click(screen.getByLabelText('Selectează toate lucrările cu fișiere'));
    expect(start).toBeEnabled();
    await userEvent.click(screen.getByLabelText('Selectează toate lucrările cu fișiere'));
    expect(start).toBeDisabled();
    // One row at a time works too.
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    await userEvent.click(within(pop).getByLabelText('Selectează lucrarea elevului Pop Ion'));
    expect(start).toBeEnabled();
  });

  it('leaves the graded uploads out of the selection', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'submitted', fileCount: 1 }),
    ];
    const api = evaluationApi({ status: 'open' }, rows);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/teste/6E2-26T1', api);
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    expect(within(pop).queryByRole('checkbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Selectează toate lucrările cu fișiere'));
    await userEvent.click(screen.getByRole('button', { name: 'Pornește evaluarea acum' }));
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', undefined, [6]);
  });

  it('saves extra comments for the barem', async () => {
    const api = evaluationApi({});
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Adaugă comentarii' }));
    expect(screen.getByText('Robotul le citește ca parte din barem.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Comentarii la barem'), 'Acceptă și metoda cu proporții.');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează comentariile' }));
    expect(api.saveBaremNotes).toHaveBeenCalledWith('6E2-26T1', 'Acceptă și metoda cu proporții.');
    expect(await screen.findByText(/Acceptă și metoda cu proporții/)).toBeInTheDocument();
  });

  it('says when the finished evaluation was partial', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'submitted', fileCount: 1 }),
    ];
    renderAdmin('/teste/6E2-26T1', evaluationApi({ status: 'done', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, rows));
    expect(await screen.findByText('Corectarea s-a terminat. Evaluarea a pornit la 7 oct. 2026, 11:00.')).toBeInTheDocument();
    expect(screen.getByText('Evaluare parțială.')).toBeInTheDocument();
    expect(screen.getByText(/1 lucrare cu fișiere nu a fost corectată/)).toBeInTheDocument();
  });

  it('says nothing partial when every upload with files was graded', async () => {
    const rows = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 })];
    renderAdmin('/teste/6E2-26T1', evaluationApi({ status: 'done', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, rows));
    expect(await screen.findByText('Corectarea s-a terminat. Evaluarea a pornit la 7 oct. 2026, 11:00.')).toBeInTheDocument();
    expect(screen.queryByText('Evaluare parțială.')).not.toBeInTheDocument();
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
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.');
    await screen.findByLabelText('Înlocuiește baremul');
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Înlocuiește baremul')).toBeDisabled();
  });

  it('takes a new barem during evaluation and says when the robot starts', async () => {
    const message = 'Punctajele din barem dau 9, dar totalul este 10.';
    const api = evaluationApi({ status: 'evaluating', exerciseList: { status: 'problem', message } });
    renderAdmin('/teste/6E2-26T1', api);
    const file = new File(['%PDF-1.7'], 'Barem nou.pdf', { type: PDF_TYPE });
    await userEvent.upload(await screen.findByLabelText('Înlocuiește baremul'), file);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'barem', file);
    expect(await screen.findByText('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument());
    expect(screen.getByLabelText('Înlocuiește baremul')).toBeDisabled();
  });

  it('takes a new barem on an open test without a robot message', async () => {
    const message = 'Punctajele din barem dau 9, dar totalul este 10.';
    const api = evaluationApi({ exerciseList: { status: 'problem', message } });
    renderAdmin('/teste/6E2-26T1', api);
    const file = new File(['%PDF-1.7'], 'Barem nou.pdf', { type: PDF_TYPE });
    await userEvent.upload(await screen.findByLabelText('Înlocuiește baremul'), file);
    expect(await screen.findByRole('link', { name: 'Barem nou.pdf' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument());
    expect(screen.queryByText(/^Robotul pornește/)).not.toBeInTheDocument();
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
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.');
  });

  it('shows the grades, the items to check, and a failed grading to try again', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 4, grade: 8.75, flagCount: 2 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'failed', fileCount: 1, lastError: 'Robotul nu a terminat la timp.' }),
    ];
    const api = evaluationApi({ status: 'done', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, rows);
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByRole('heading', { name: 'Încărcări · trimise 2 din 2 · corectate 1 · de verificat 2' })).toBeInTheDocument();
    expect(screen.getByText('Corectarea s-a terminat. Evaluarea a pornit la 7 oct. 2026, 11:00.')).toBeInTheDocument();
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    expect(within(pop).getByText('8,75')).toBeInTheDocument();
    expect(within(pop).getByText('2')).toBeInTheDocument();
    expect(within(pop).queryByRole('button', { name: 'Reîncearcă' })).not.toBeInTheDocument();
    const stan = screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!;
    expect(within(stan).getByText('Robotul nu a terminat la timp.')).toBeInTheDocument();
    await userEvent.click(within(stan).getByRole('button', { name: 'Reîncearcă' }));
    expect(api.retrySubmission).toHaveBeenCalledWith(6, FAKE_STARTED_AT);
    expect(await within(stan).findByText('Trimis')).toBeInTheDocument();
    expect(screen.getByText('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.')).toBeInTheDocument();
    expect(screen.getByText('Evaluare parțială.')).toBeInTheDocument();
    expect(screen.getByText(/1 lucrare cu fișiere nu a fost corectată/)).toBeInTheDocument();
  });

  const gradedAndFailed = () => [
    fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 4, grade: 8.75, flagCount: 2 }),
    fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'failed', fileCount: 1, lastError: 'Robotul nu a terminat la timp.' }),
    fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
  ];

  it('regrades every graded and failed upload after the teacher confirms', async () => {
    const api = evaluationApi({ status: 'done' }, gradedAndFailed());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Recorectează tot' }));
    expect(api.regradeTest).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Recorectează tot' }));
    expect(confirm).toHaveBeenLastCalledWith('Recorectezi 2 lucrări? Punctajele și comentariile schimbate de tine se pierd.');
    expect(api.regradeTest).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByRole('status')).toHaveTextContent(robotStartMessage('next_check'));
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    expect(await within(pop).findByText('Trimis')).toBeInTheDocument();
    expect(within(screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!).getByText('Trimis')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recorectează tot' })).not.toBeInTheDocument();
  });

  it('says how many papers the demo limit let go to a regrade', async () => {
    const api = evaluationApi({ status: 'done' }, gradedAndFailed());
    api.regradeTest.mockResolvedValueOnce({ count: 1, testStatus: 'evaluating', robot: 'next_check' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Recorectează tot' }));
    expect(await screen.findByText('Limita contului demo: se corectează din nou 1 din cele 2 lucrări. Celelalte își păstrează rezultatele.')).toBeInTheDocument();
  });

  it('counts only the papers that stayed out, while the robot grades the others', async () => {
    const api = evaluationApi({ status: 'evaluating' }, [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 1 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan', submissionId: 7, status: 'uploading', fileCount: 0 }),
    ]);
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByText('Evaluare parțială.')).toBeInTheDocument();
    expect(screen.getByText(/1 lucrare cu fișiere nu a fost corectată/)).toBeInTheDocument();
  });

  it('says that an open test grades the uploads again after Start evaluation', async () => {
    const api = evaluationApi({ status: 'open' }, gradedAndFailed());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Recorectează tot' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Lucrările se corectează din nou după ce pornești evaluarea.');
    // The regraded uploads wait for grading: select them first.
    await userEvent.click(screen.getByLabelText('Selectează toate lucrările cu fișiere'));
    // Once the evaluation starts, the words are not true any more.
    await userEvent.click(screen.getByRole('button', { name: 'Pornește evaluarea acum' }));
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', undefined, [5, 6]);
    expect(await screen.findByText('Se corectează', { selector: '.status' })).toBeInTheDocument();
    expect(screen.queryByText('Lucrările se corectează din nou după ce pornești evaluarea.')).not.toBeInTheDocument();
    // Nor after the uploads open again.
    await userEvent.click(screen.getByRole('button', { name: 'Redeschide încărcarea' }));
    expect(await screen.findByRole('button', { name: 'Pornește evaluarea acum' })).toBeInTheDocument();
    expect(screen.queryByText('Lucrările se corectează din nou după ce pornești evaluarea.')).not.toBeInTheDocument();
  });

  it('offers no regrade while nothing is graded', async () => {
    renderAdmin('/teste/6E2-26T1', evaluationApi({ status: 'evaluating' }));
    expect(await screen.findByRole('heading', { name: 'Evaluarea' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recorectează tot' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recorectează' })).not.toBeInTheDocument();
  });

  it('regrades one graded upload from its row', async () => {
    const api = evaluationApi({ status: 'done' }, gradedAndFailed());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/teste/6E2-26T1', api);
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    expect(within(screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!).queryByRole('button', { name: 'Recorectează' })).toBeNull();
    await userEvent.click(within(pop).getByRole('button', { name: 'Recorectează' }));
    expect(confirm).toHaveBeenCalledWith('Recorectezi lucrarea elevului Pop Ion? Corecturile tale se pierd.');
    expect(api.regradeSubmission).toHaveBeenCalledWith(5, '2026-10-07T09:00:00.000Z');
    expect(await within(pop).findByText('Trimis')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(robotStartMessage('next_check'));
  });

  const NOT_STARTED = 'Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.';

  // The API says that GitHub did not take the last request to start the robot.
  function failedStartApi(overrides: Parameters<typeof fakeTest>[0]) {
    const detail = fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, files: FILES, ...overrides }, structuredClone(uploads));
    detail.robot.startFailed = true;
    return createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [detail],
    });
  }

  it('starts at once a schedule whose time passed before the click, and says when the robot did not start', async () => {
    const api = evaluationApi({});
    renderAdmin('/teste/6E2-26T1', api);
    fireEvent.change(await screen.findByLabelText('Sau pornește evaluarea automat la'), { target: { value: '2026-10-08T10:05' } });
    vi.setSystemTime(new Date('2026-10-08T07:06:00.000Z'));
    await userEvent.click(screen.getByRole('button', { name: 'Programează' }));
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', '2026-10-08T07:05:00.000Z');
    expect(await screen.findByText('Se corectează', { selector: '.status' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(NOT_STARTED);
  });

  it('says that the robot did not start for a test in evaluation, also after a reload', async () => {
    renderAdmin('/teste/6E2-26T1', failedStartApi({ status: 'evaluating' }));
    expect(await screen.findByRole('status')).toHaveTextContent(NOT_STARTED);
  });

  it('says it once after a button could not start the robot either', async () => {
    const failed = 'Robotul nu a terminat la timp.';
    const api = failedStartApi({ status: 'evaluating', exerciseList: { status: 'failed', message: failed } });
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Încearcă din nou' }));
    expect(api.retryExerciseList).toHaveBeenCalledWith('6E2-26T1');
    await waitFor(() => expect(screen.queryByText(failed)).not.toBeInTheDocument());
    expect(screen.getAllByText(NOT_STARTED)).toHaveLength(1);
  });

  it.each([
    // The print PDF is ready: a print PDF that waits would be robot work on an open test.
    ['open', /^Evaluarea pornește automat la/, { evaluationAt: '2026-10-20T07:15:00.000Z', print: { status: 'ready', fromWord: false } }],
    ['done', /^Corectarea s-a terminat\./, {}],
  ] as const)('says nothing about a robot start on a test that is %s', async (status, line, overrides) => {
    renderAdmin('/teste/6E2-26T1', failedStartApi({ status, ...overrides }));
    expect(await screen.findByText(line)).toBeInTheDocument();
    expect(screen.queryByText(NOT_STARTED)).not.toBeInTheDocument();
  });

  it('starts the robot again when grading is late and work waits', async () => {
    const api = evaluationApi({ status: 'evaluating' });
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByText('Corectarea poate întârzia.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pornește robotul' }));
    expect(api.startRobot).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByRole('status')).toHaveTextContent(robotStartMessage('next_check'));
  });

  it('says why the robot did not start', async () => {
    const api = evaluationApi({ status: 'evaluating' });
    api.startRobot.mockRejectedValueOnce(new ApiError(409, 'no_work', 'Nicio lucrare a acestui test nu așteaptă robotul.'));
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Pornește robotul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nicio lucrare a acestui test nu așteaptă robotul.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  const graded = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 })];
  const leftInGrading = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'grading', fileCount: 2 })];
  const problem = { status: 'problem', message: 'Punctajele din barem dau 9, dar totalul este 10.' } as const;
  const robotButtonCases: [string, Parameters<typeof fakeTest>[0], UploadRow[], string | null, boolean][] = [
    ['an upload left in grading', { status: 'evaluating' }, leftInGrading, null, true],
    ['a robot that checked 5 minutes ago', { status: 'evaluating' }, uploads, '2026-10-08T06:55:00.000Z', false],
    ['a test with nothing left to grade', { status: 'evaluating' }, graded, null, false],
    ['a class analysis that waits', { status: 'evaluating', analysis: { status: 'requested', stale: false, attempts: 0 } }, graded, null, true],
    ['a barem that waits for the teacher', { status: 'evaluating', exerciseList: problem }, uploads, null, false],
    ['a scheduled evaluation', { evaluationAt: '2026-10-09T07:00:00.000Z' }, uploads, null, false],
  ];

  it.each(robotButtonCases)('offers to start the robot for %s', async (_name, overrides, rows, lastCheckAt, shown) => {
    renderAdmin('/teste/6E2-26T1', evaluationApi(overrides, rows, lastCheckAt));
    expect(await screen.findByText(/^Robotul (nu )?a verificat/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pornește robotul' }) !== null).toBe(shown);
  });

  it('says that the robot writes the class analysis, and links to the class report', async () => {
    renderAdmin('/teste/6E2-26T1', evaluationApi({ status: 'evaluating', analysis: { status: 'requested', stale: false, attempts: 0 } }, graded));
    expect(await screen.findByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Raportul clasei' })).toHaveAttribute('href', '/teste/6E2-26T1/raport');
  });

  it('says that the last attempt failed instead of saying that the robot writes, after a failed attempt', async () => {
    renderAdmin('/teste/6E2-26T1', evaluationApi({ status: 'evaluating', analysis: { status: 'requested', stale: false, attempts: 1 } }, graded));
    expect(
      await screen.findByText('Ultima încercare a eșuat. Robotul va încerca din nou la următoarea rulare.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).not.toBeInTheDocument();
  });

  it('does not say that the work is graded while an upload still waits', async () => {
    const mixed = [...graded, fakeUpload({ studentId: 11, studentName: 'Avram Dan', submissionId: 6, status: 'submitted', fileCount: 1 })];
    renderAdmin(
      '/teste/6E2-26T1',
      evaluationApi({ status: 'evaluating', gradedCount: 1, analysis: { status: 'requested', stale: false, attempts: 0 } }, mixed),
    );
    expect(await screen.findByRole('link', { name: 'Raportul clasei' })).toBeInTheDocument();
    expect(screen.queryByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).not.toBeInTheDocument();
  });

  it('shows the link to the class report only when something is graded', async () => {
    renderAdmin('/teste/6E2-26T1', evaluationApi({ status: 'evaluating' }, leftInGrading));
    expect(await screen.findByText(/^Robotul (nu )?a verificat/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Raportul clasei' })).not.toBeInTheDocument();
    expect(screen.queryByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).not.toBeInTheDocument();
  });

  it('shows the class report button in the head once a result is graded', async () => {
    renderAdmin('/teste/6E2-26T1', evaluationApi({ status: 'done' }, graded));
    const heading = await screen.findByRole('heading', { name: '6E2-26T1' });
    const head = heading.parentElement!;
    const link = within(head).getByRole('link', { name: 'Raportul clasei' });
    expect(link).toHaveAttribute('href', '/teste/6E2-26T1/raport');
    expect(link).toHaveClass('button', 'button-small');
    expect(screen.getAllByRole('link', { name: 'Raportul clasei' })).toHaveLength(1);
  });

  it('has no report button before any grading', async () => {
    renderAdmin('/teste/6E2-26T1', evaluationApi({ status: 'evaluating' }, leftInGrading));
    expect(await screen.findByRole('heading', { name: '6E2-26T1' })).toBeInTheDocument();
    expect(await screen.findByText(/^Robotul (nu )?a verificat/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Raportul clasei' })).not.toBeInTheDocument();
  });

  it('says when the class analysis failed', async () => {
    renderAdmin('/teste/6E2-26T1', evaluationApi({ status: 'done', analysis: { status: 'failed', stale: false, attempts: 0 } }, graded));
    expect(await screen.findByText('Robotul nu a putut scrie analiza clasei.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Raportul clasei' })).toBeInTheDocument();
  });

  it('shows no publish button before anything is graded, and keeps the stop button once results are open', async () => {
    const { unmount } = renderAdmin('/teste/6E2-26T1', apiWith({ status: 'done' }));
    expect(await screen.findByRole('heading', { name: '6E2-26T1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publică rezultatele' })).not.toBeInTheDocument();
    unmount();
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'done', resultsOpen: true }));
    expect(await screen.findByRole('button', { name: 'Oprește accesul la rezultate' })).toBeInTheDocument();
  });

  it('publishes the student results and stops them again', async () => {
    const api = apiWith({ status: 'done', gradedCount: 1 });
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Publică rezultatele' }));
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', true);
    expect(await screen.findByRole('button', { name: 'Oprește accesul la rezultate' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Oprește accesul la rezultate' }));
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', false);
    expect(await screen.findByRole('button', { name: 'Publică rezultatele' })).toBeInTheDocument();
  });

  it('publishes one result while the rest stays unpublished', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
    ];
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: {},
      tests: [fakeTest({ status: 'done' }, rows)],
    });
    renderAdmin('/teste/6E2-26T1', api);
    await screen.findByRole('heading', { name: '6E2-26T1' });
    expect(await screen.findAllByRole('button', { name: 'Publică' })).toHaveLength(2);
    expect(screen.queryByText(/publicat individual/)).not.toBeInTheDocument();

    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    await userEvent.click(within(pop).getByRole('button', { name: 'Publică' }));
    expect(api.setSubmissionResultsOpen).toHaveBeenCalledWith(5, FAKE_STARTED_AT, true);
    expect(await within(pop).findByRole('button', { name: 'Oprește publicarea' })).toBeInTheDocument();
    expect(within(pop).getByText('Publicat')).toBeInTheDocument();
    expect(screen.getByText('1 rezultat publicat individual.')).toBeInTheDocument();
    const stan = screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!;
    expect(within(stan).getByRole('button', { name: 'Publică' })).toBeInTheDocument();

    await userEvent.click(within(pop).getByRole('button', { name: 'Oprește publicarea' }));
    expect(api.setSubmissionResultsOpen).toHaveBeenCalledWith(5, FAKE_STARTED_AT, false);
    expect(await within(pop).findByRole('button', { name: 'Publică' })).toBeInTheDocument();
    expect(screen.queryByText(/publicat individual/)).not.toBeInTheDocument();
  });

  it('hides the single publish buttons once every result is published', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9, resultsOpen: true }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8, resultsOpen: true }),
    ];
    renderAdmin(
      '/teste/6E2-26T1',
      createFakeApi({
        classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
        students: {},
        tests: [fakeTest({ status: 'done', resultsOpen: true }, rows)],
      }),
    );
    await screen.findByRole('heading', { name: '6E2-26T1' });
    expect(screen.queryByRole('button', { name: 'Publică' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Oprește publicarea' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Publicat')).toHaveLength(2);
  });

  it('shows a result link per upload, with copy and WhatsApp share', async () => {
    // Fresh rows: earlier tests reset the shared uploads above.
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
    ];
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: {},
      tests: [fakeTest({ status: 'done' }, rows)],
    });
    renderAdmin('/teste/6E2-26T1', api);
    const links = await screen.findAllByRole('button', { name: 'Link rezultat' });
    expect(links).toHaveLength(2);
    await userEvent.click(links[0]!);
    expect(api.getResultLink).toHaveBeenCalledWith(5, FAKE_STARTED_AT);
    const url = `${window.location.origin}/u/rezultat/result-token-5`;
    expect(await screen.findByDisplayValue(url)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      `https://wa.me/?text=${encodeURIComponent(`Rezultatul la testul 6E2-26T1: ${url}`)}`,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Copiază' }));
    expect(await navigator.clipboard.readText()).toBe(url);
  });

  it('hides the result link while the upload is still on the phone', async () => {
    // Pop Ion sent the upload, Stan Eva still uploads, Marin Dan did not start.
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [fakeTest({ status: 'done' }, uploads)],
    });
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByRole('heading', { name: '6E2-26T1' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Link rezultat' })).toHaveLength(1);
  });
});
