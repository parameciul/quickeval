import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate, useNavigationType } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api.ts';
import { PDF_TYPE } from '../../../shared/files.ts';
import type { UploadRow } from '../../../shared/api.ts';
import { robotStartMessage } from '../../ui/format.ts';
import { createFakeApi, FAKE_MULTI_TOKEN, FAKE_STARTED_AT, FAKE_TOKEN, fakePoint, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
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

// The same students, none of whom has uploaded a file.
const notSent = () => uploads.map((row) => fakeUpload({ studentId: row.studentId, studentName: row.studentName }));

function apiWith(overrides: Parameters<typeof fakeTest>[0] = {}) {
  return createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
    students: {},
    tests: [fakeTest(overrides, uploads)],
  });
}

// The test page, and the address of each stage's panel (redesign spec §6).
const PAGE = '/teste/6E2-26T1';

// Opens the panel of a stage with its link in the list of stages.
async function openStage(name: string) {
  const stages = await screen.findByRole('navigation', { name: 'Etapele testului' });
  await userEvent.click(within(stages).getByRole('link', { name: new RegExp(`^${name} `) }));
  await screen.findByRole('heading', { level: 2, name });
}

const sheet = () => screen.getByRole('region', { name: 'Fișa testului' });

// How the app came to this address: a stage link replaces it, so Back leaves the page.
function NavigationProbe() {
  return <p data-testid="navigation">{useNavigationType()}</p>;
}

// A jump to the test page, as a link of the Teste page or of "De făcut" does.
function GoToTest() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(PAGE)}>
      Mergi la test
    </button>
  );
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('TestPage', () => {
  it('shows the title, its class, its students and its start, and the code and state in Fișa testului', async () => {
    renderAdmin(PAGE, apiWith({ status: 'open', uploadToken: FAKE_TOKEN, startedAt: '2026-10-06T07:15:00.000Z' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Fracții' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
    expect(screen.getByRole('link', { name: 'Clasa 6E2' })).toHaveClass('class-badge', 'class-tone');
    expect(screen.getByText(/3 elevi · început 6 oct\. 2026, 10:15/)).toBeInTheDocument();
    expect(within(sheet()).getByText('6E2-26T1')).toBeInTheDocument();
    expect(within(sheet()).getByText('Deschis')).toBeInTheDocument();
  });

  it('reads the code in any letter case and refuses something else', async () => {
    renderAdmin('/teste/6e2-26t1', apiWith());
    expect(await screen.findByRole('heading', { level: 1, name: 'Fracții' })).toBeInTheDocument();
  });

  it('shows the not-found page for a path that is not a test code', async () => {
    renderAdmin('/teste/abc', apiWith());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('starts a draft test, and its link and QR code stay in Fișa testului', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}#in-clasa`, api);
    expect(await within(await screen.findByRole('region', { name: 'Fișa testului' })).findByLabelText('Linkul pentru elevi')).toHaveValue(
      `${window.location.origin}/u/${FAKE_TOKEN}`,
    );
    expect(screen.getByText('Codul e pe testul tipărit. Elevii trimit lucrările după ce începi testul.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Începe testul' }));
    expect(api.startTest).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByText('Pentru un elev fără testul tipărit.')).toBeInTheDocument();
    expect(within(sheet()).getByLabelText('Linkul pentru elevi')).toHaveValue(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(within(sheet()).getByTitle('Codul QR al linkului')).toBeInTheDocument();
  });

  it('shows the students link only while the test is a draft or open', async () => {
    for (const status of ['draft', 'open'] as const) {
      const view = renderAdmin(PAGE, apiWith({ status }));
      expect(await screen.findByLabelText('Linkul pentru elevi')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Arată linkurile' })).not.toBeInTheDocument();
      view.unmount();
    }
    for (const status of ['evaluating', 'done'] as const) {
      const view = renderAdmin(PAGE, apiWith({ status }));
      await screen.findByRole('region', { name: 'Fișa testului' });
      expect(screen.queryByLabelText('Linkul pentru elevi')).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('shows the print block on a draft and an open test, and not once the uploads closed', async () => {
    const { unmount } = renderAdmin(`${PAGE}#tiparire`, apiWith());
    await screen.findByRole('heading', { level: 2, name: 'Tipărire' });
    expect(screen.getByText('Testul pentru tipărit:')).toBeInTheDocument();
    unmount();
    const open = renderAdmin(`${PAGE}#tiparire`, apiWith({ status: 'open' }));
    await screen.findByRole('heading', { level: 2, name: 'Tipărire' });
    expect(screen.getByText('Testul pentru tipărit:')).toBeInTheDocument();
    open.unmount();
    renderAdmin(`${PAGE}#tiparire`, apiWith({ status: 'evaluating' }));
    expect(await screen.findByText('Testul s-a dat în clasă.')).toBeInTheDocument();
    expect(screen.queryByText('Testul pentru tipărit:')).not.toBeInTheDocument();
  });

  it('lets the teacher download the test with the QR code before she starts it', async () => {
    renderAdmin(
      `${PAGE}#tiparire`,
      apiWith({ files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null }, print: { status: 'ready', fromWord: false } }),
    );
    expect(await screen.findByRole('link', { name: 'Descarcă testul cu cod QR' })).toBeInTheDocument();
    expect(screen.getByText('Poți tipări testul de acum. Elevii încarcă lucrările după ce începi testul.')).toBeInTheDocument();
    expect(within(sheet()).getByRole('link', { name: 'Testul cu cod QR' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/print');
    await openStage('În clasă');
    expect(screen.getByText(/Începe-l în ziua testului/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Începe testul' })).toBeInTheDocument();
  });

  it('starts no robot at Start when the print PDF is made already', async () => {
    const api = apiWith({ files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null }, print: { status: 'ready', fromWord: false } });
    renderAdmin(`${PAGE}#in-clasa`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Începe testul' }));
    expect(await screen.findByText('Deschis')).toBeInTheDocument();
    expect(screen.queryByText(robotStartMessage('dispatched'))).not.toBeInTheDocument();
  });

  it('says the robot started after Start test when the print PDF still waits', async () => {
    renderAdmin(`${PAGE}#in-clasa`, apiWith({ files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null } }));
    await userEvent.click(await screen.findByRole('button', { name: 'Începe testul' }));
    expect(await screen.findByText(robotStartMessage('dispatched'))).toBeInTheDocument();
  });

  it('gives an old draft its link with its test file, so its QR test is made without another click', async () => {
    const api = apiWith({ uploadToken: null });
    renderAdmin(`${PAGE}#tiparire`, api);
    expect(await screen.findByText('Încarcă testul ca să primești varianta cu cod QR.')).toBeInTheDocument();
    await openStage('Pregătire');
    const file = new File(['%PDF-1.7'], 'Test.pdf', { type: PDF_TYPE });
    await userEvent.upload(screen.getByLabelText('Încarcă testul'), file);
    expect(await screen.findByRole('link', { name: 'Test.pdf' })).toBeInTheDocument();
    await openStage('Tipărire');
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pregătește testul cu cod QR' })).not.toBeInTheDocument();
  });

  it('says the robot started after Start test of a draft made before tests got their link', async () => {
    renderAdmin(`${PAGE}#in-clasa`, apiWith({ uploadToken: null, files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null } }));
    await userEvent.click(await screen.findByRole('button', { name: 'Începe testul' }));
    expect(await screen.findByText(robotStartMessage('dispatched'))).toBeInTheDocument();
  });

  it('prepares the test with the QR code of a draft made before tests got their link', async () => {
    const api = apiWith({ uploadToken: null, files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null } });
    renderAdmin(`${PAGE}#tiparire`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Pregătește testul cu cod QR' }));
    expect(api.retryPrint).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toBeInTheDocument();
    expect(screen.getByText(robotStartMessage('dispatched'))).toBeInTheDocument();
  });

  it('copies the link', async () => {
    const user = userEvent.setup();
    renderAdmin(PAGE, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    await user.click(await screen.findByRole('button', { name: 'Copiază linkul' }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(screen.getByRole('status')).toHaveTextContent('Copiat!');
  });

  it('shows the QR code on the whole screen and closes it with Escape', async () => {
    renderAdmin(PAGE, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    await userEvent.click(await screen.findByRole('button', { name: 'Arată codul QR pe tot ecranul' }));
    const dialog = screen.getByRole('dialog', { name: 'Codul QR pentru elevi' });
    expect(within(dialog).getByText(`${window.location.origin}/u/${FAKE_TOKEN}`)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Închide' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('uploads the test file and links to it', async () => {
    const api = apiWith();
    renderAdmin(PAGE, api);
    const file = new File(['%PDF-1.7'], 'Test.pdf', { type: PDF_TYPE });
    await userEvent.upload(await screen.findByLabelText('Încarcă testul'), file);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'test', file);
    expect(await screen.findByRole('link', { name: 'Test.pdf' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/files/test');
    expect(screen.getByLabelText('Înlocuiește testul')).toBeInTheDocument();
    expect(within(sheet()).getByRole('link', { name: 'Testul' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/files/test');
  });

  it('drops "Fără confirmare" once the upload is graded', async () => {
    const graded = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', grade: 8, autoSubmitted: true })];
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 1 }],
      students: {},
      tests: [fakeTest({ status: 'done' }, graded)],
    });
    renderAdmin(PAGE, api);
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    expect(within(pop).queryByText('Fără confirmare')).not.toBeInTheDocument();
  });

  it('locks the files while the test is being graded', async () => {
    renderAdmin(`${PAGE}#pregatire`, apiWith({ status: 'evaluating' }));
    expect(await screen.findByLabelText('Încarcă baremul')).toBeDisabled();
  });

  it('says no paper came yet while the test is open and nothing was uploaded, with the QR code on the whole screen', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, submittedCount: 0, studentCount: 3 }, notSent())],
    });
    renderAdmin(`${PAGE}#in-clasa`, api);
    expect(await screen.findByRole('heading', { level: 3, name: 'Nicio lucrare trimisă încă' })).toBeInTheDocument();
    expect(
      screen.getByText('Elevii scanează codul QR de pe test și trimit pozele. Lucrările apar aici pe măsură ce vin.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Încărcările elevilor' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Oprește testul' })).toBeInTheDocument();
    const empty = screen.getByRole('heading', { name: 'Nicio lucrare trimisă încă' }).parentElement!;
    const show = within(empty).getByRole('button', { name: 'Arată codul QR pe tot ecranul' });
    await userEvent.click(show);
    const dialog = await screen.findByRole('dialog', { name: 'Codul QR pentru elevi' });
    expect(within(dialog).getByText(`${window.location.origin}/u/${FAKE_TOKEN}`)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Închide' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(show).toHaveFocus();
  });

  it('lists the papers as soon as one student uploaded a file, and once the uploads are closed', async () => {
    const one = [notSent()[0]!, uploads[1]!, notSent()[2]!];
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, submittedCount: 0, studentCount: 3 }, one)],
    });
    const first = renderAdmin(`${PAGE}#in-clasa`, api);
    expect(await screen.findByRole('table', { name: 'Încărcările elevilor' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nicio lucrare trimisă încă' })).not.toBeInTheDocument();
    first.unmount();
    renderAdmin(
      `${PAGE}#in-clasa`,
      createFakeApi({
        classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
        students: {},
        tests: [fakeTest({ status: 'done', submittedCount: 0, studentCount: 3 }, notSent())],
      }),
    );
    expect(await screen.findByRole('table', { name: 'Încărcările elevilor' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nicio lucrare trimisă încă' })).not.toBeInTheDocument();
  });

  it('lists the uploads of the students', async () => {
    renderAdmin(`${PAGE}#in-clasa`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN, submittedCount: 1, studentCount: 3 }));
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

  it('puts checkboxes in the table of Corectare only, while the test is open', async () => {
    const { unmount } = renderAdmin(`${PAGE}#corectare`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    const openTable = await screen.findByRole('table', { name: 'Încărcările elevilor' });
    expect(openTable).toHaveClass('uploads', 'is-selectable');
    await openStage('În clasă');
    expect(screen.getByRole('table', { name: 'Încărcările elevilor' })).not.toHaveClass('is-selectable');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    unmount();
    renderAdmin(`${PAGE}#corectare`, apiWith({ status: 'done' }));
    const doneTable = await screen.findByRole('table', { name: 'Încărcările elevilor' });
    expect(doneTable).toHaveClass('uploads');
    expect(doneTable).not.toHaveClass('is-selectable');
  });

  it('labels the upload cells with the column names for narrow screens', async () => {
    renderAdmin(`${PAGE}#corectare`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    const labels = within(pop)
      .getAllByRole('cell')
      .map((cell) => cell.getAttribute('data-label'));
    expect(labels).toEqual([null, 'Stare', 'Fișiere', 'Ora', 'Nota', 'De verificat', null]);
  });

  it('has no Model column unless the setting is on', async () => {
    renderAdmin(`${PAGE}#in-clasa`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
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
    // A done test opens on Rezultate, which has no papers table.
    renderAdmin(`${PAGE}#corectare`, createFakeApi({ classes: [], students: {}, tests: [{ ...detail, showModel: true }] }));
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

  it('keeps the result links and the publish buttons out of the papers table', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9, resultsOpen: true }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
    ];
    renderAdmin(`${PAGE}#corectare`, createFakeApi({ classes: [], students: {}, tests: [fakeTest({ status: 'done' }, rows)] }));
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    expect(within(pop).getByText('Publicat')).toBeInTheDocument();
    expect(within(pop).getByRole('link', { name: 'Vezi lucrarea' })).toBeInTheDocument();
    for (const name of ['Link rezultat', 'Copiază linkul', 'Publică', 'Oprește publicarea']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('marks only the selectable rows for the narrow-screen layout', async () => {
    renderAdmin(`${PAGE}#corectare`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
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
    renderAdmin(`${PAGE}#in-clasa`, api);
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
    renderAdmin(`${PAGE}#in-clasa`, api);
    const stan = (await screen.findByRole('rowheader', { name: 'Stan Eva' })).closest('tr')!;
    vi.mocked(api.getTest).mockRejectedValue(new ApiError(503, 'unavailable', 'Serverul nu răspunde. Încearcă din nou.'));
    await userEvent.click(within(stan).getByRole('button', { name: 'Resetează' }));
    expect(await screen.findByText('Serverul nu răspunde. Încearcă din nou.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Fracții' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'În clasă' })).toBeInTheDocument();
    expect(screen.getByLabelText('Linkul pentru elevi')).toBeInTheDocument();
  });

  it('reopens the uploads of a closed test', async () => {
    const api = apiWith({ status: 'done' });
    renderAdmin(`${PAGE}#in-clasa`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redeschide încărcarea' }));
    expect(api.reopenTest).toHaveBeenCalledWith('6E2-26T1');
  });

  it('archives a finished test and offers to take it out of the archive', async () => {
    const api = apiWith({ status: 'done' });
    renderAdmin(PAGE, api);
    expect(await screen.findByText('Testul nu mai apare în lista clasei și în Teste. Îl găsești cu „Arată și testele arhivate”.')).toBeInTheDocument();
    expect(screen.queryByText('Arhivat')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Arhivează testul' }));
    expect(api.setTestArchived).toHaveBeenCalledWith('6E2-26T1', true);
    expect(await within(sheet()).findByText('Arhivat')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arhivează testul' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Scoate din arhivă' }));
    expect(api.setTestArchived).toHaveBeenLastCalledWith('6E2-26T1', false);
    expect(await screen.findByRole('button', { name: 'Arhivează testul' })).toBeInTheDocument();
    expect(screen.queryByText('Arhivat')).not.toBeInTheDocument();
  });

  it('offers no archive while the test is not finished', async () => {
    for (const status of ['draft', 'open', 'evaluating'] as const) {
      const view = renderAdmin(PAGE, apiWith({ status }));
      expect(await screen.findByRole('button', { name: 'Șterge testul' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Arhivează testul' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Scoate din arhivă' })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('says why the archive was refused', async () => {
    const api = apiWith({ status: 'done' });
    vi.mocked(api.setTestArchived).mockRejectedValueOnce(new ApiError(409, 'not_done', 'Poți arhiva un test după ce s-a terminat corectarea.'));
    renderAdmin(PAGE, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Arhivează testul' }));
    expect(await screen.findByText('Poți arhiva un test după ce s-a terminat corectarea.')).toBeInTheDocument();
  });

  it('renames the test', async () => {
    const api = apiWith();
    renderAdmin(PAGE, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redenumește testul' }));
    const input = within(sheet()).getByLabelText('Titlu nou');
    await userEvent.clear(input);
    await userEvent.type(input, 'Teză');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.renameTest).toHaveBeenCalledWith('6E2-26T1', 'Teză');
    expect(await screen.findByRole('heading', { level: 1, name: 'Teză' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redenumește testul' })).toBeInTheDocument();
  });

  it('deletes the test after the teacher confirms and goes to the test list', async () => {
    const api = apiWith();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(PAGE, api, <LocationProbe />);
    await userEvent.click(await screen.findByRole('button', { name: 'Șterge testul' }));
    expect(api.deleteTest).toHaveBeenCalledWith('6E2-26T1');
    await expectLocation(/^\/$/);
  });

  it('warns before deleting a test whose QR code may be printed already', async () => {
    const api = apiWith({ files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null }, print: { status: 'ready', fromWord: false } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin(PAGE, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Șterge testul' }));
    expect(confirm).toHaveBeenCalledWith(
      'Ștergi testul 6E2-26T1? Se șterg și toate lucrările încărcate. Codurile QR de pe testele tipărite nu vor mai funcționa.',
    );
    expect(api.deleteTest).not.toHaveBeenCalled();
  });

  it('shows the notice that the new-test page passed along', async () => {
    renderAdmin({ pathname: PAGE, state: { notice: 'Testul a fost creat, dar fișierul Test.pdf nu s-a încărcat.' } }, apiWith());
    expect(await screen.findByRole('alert')).toHaveTextContent('Testul a fost creat, dar fișierul Test.pdf nu s-a încărcat.');
  });

  it('keeps the notice of the new-test page when the teacher opens another stage', async () => {
    renderAdmin({ pathname: PAGE, state: { notice: 'Testul a fost creat, dar fișierul Test.pdf nu s-a încărcat.' } }, apiWith());
    expect(await screen.findByText('Testul a fost creat, dar fișierul Test.pdf nu s-a încărcat.')).toBeInTheDocument();
    await openStage('Tipărire');
    expect(screen.getByText('Testul a fost creat, dar fișierul Test.pdf nu s-a încărcat.')).toBeInTheDocument();
  });

  it('creates the multi-upload link on demand and then shows it', async () => {
    const api = apiWith({ status: 'open', uploadToken: FAKE_TOKEN });
    renderAdmin(`${PAGE}#in-clasa`, api);
    expect(await screen.findByLabelText('Linkul pentru elevi')).toHaveValue(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(screen.queryByLabelText('Linkul pentru mai multe încărcări')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Creează linkul pentru mai multe încărcări' }));
    expect(api.createMultiUploadLink).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByLabelText('Linkul pentru mai multe încărcări')).toHaveValue(
      `${window.location.origin}/u/${FAKE_MULTI_TOKEN}`,
    );
  });

  it('shows both upload links when the multi-upload link already exists', async () => {
    renderAdmin(`${PAGE}#in-clasa`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN, multiUploadToken: FAKE_MULTI_TOKEN }));
    expect(await screen.findByLabelText('Linkul pentru elevi')).toHaveValue(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(screen.getByLabelText('Linkul pentru mai multe încărcări')).toHaveValue(`${window.location.origin}/u/${FAKE_MULTI_TOKEN}`);
    expect(screen.queryByRole('button', { name: 'Creează linkul pentru mai multe încărcări' })).not.toBeInTheDocument();
  });

  it('shows the facts and files of the test in Fișa testului', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
    ];
    const test = fakeTest(
      {
        status: 'done',
        startedAt: '2026-10-06T07:15:00.000Z',
        files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: { name: 'Barem.pdf', type: PDF_TYPE } },
        print: { status: 'ready', fromWord: false },
      },
      rows,
    );
    renderAdmin(PAGE, createFakeApi({ classes: [], students: {}, tests: [test] }));
    const card = await screen.findByRole('region', { name: 'Fișa testului' });
    const fact = (name: string) => within(card).getByText(name, { selector: 'dt' }).nextElementSibling;
    expect(fact('Clasa')).toHaveTextContent('Clasa 6E2 · 2 elevi');
    expect(fact('Codul')).toHaveTextContent('6E2-26T1');
    expect(fact('Starea')).toHaveTextContent('Corectat');
    expect(fact('Început')).toHaveTextContent('6 oct. 2026, 10:15');
    expect(fact('Au trimis')).toHaveTextContent('2 din 2');
    expect(fact('Baremul')).toHaveTextContent('activ');
    expect(fact('Media testului')).toHaveTextContent('8,5');
    expect(within(card).getByRole('link', { name: 'Testul' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/files/test');
    expect(within(card).getByRole('link', { name: 'Baremul' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/files/barem');
    expect(within(card).getByRole('link', { name: 'Testul cu cod QR' })).toHaveAttribute('download');
  });

  it('says in Fișa testului what a draft does not have yet', async () => {
    renderAdmin(PAGE, apiWith());
    const card = await screen.findByRole('region', { name: 'Fișa testului' });
    const fact = (name: string) => within(card).getByText(name, { selector: 'dt' }).nextElementSibling;
    expect(fact('Început')).toHaveTextContent('neînceput');
    expect(fact('Baremul')).toHaveTextContent('lipsește');
    expect(within(card).queryByText('Au trimis')).not.toBeInTheDocument();
    expect(within(card).queryByText('Media testului')).not.toBeInTheDocument();
    expect(within(card).getAllByText('lipsește')).toHaveLength(3);
    expect(within(card).queryByRole('link', { name: 'Testul cu cod QR' })).not.toBeInTheDocument();
    expect(screen.getByText(/3 elevi · ciornă/)).toBeInTheDocument();
  });
});

describe('TestPage stages', () => {
  const flagged = [
    fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9, flagCount: 2 }),
    fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
  ];

  function doneApi() {
    return createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: {},
      tests: [fakeTest({ status: 'done', startedAt: '2026-10-06T07:15:00.000Z', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, structuredClone(flagged))],
    });
  }

  it('lists the six stages with their state, and opens the current one', async () => {
    renderAdmin(PAGE, doneApi());
    const stages = await screen.findByRole('navigation', { name: 'Etapele testului' });
    const links = within(stages).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Pregătire gata',
      'Tipărire gata',
      'În clasă gata',
      'Corectare gata',
      'Verificare te așteaptă: 2 puncte nesigure',
      'Rezultate urmează',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/teste/6E2-26T1#pregatire',
      '/teste/6E2-26T1#tiparire',
      '/teste/6E2-26T1#in-clasa',
      '/teste/6E2-26T1#corectare',
      '/teste/6E2-26T1#verificare',
      '/teste/6E2-26T1#rezultate',
    ]);
    expect(links.map((link) => link.closest('li')!.className)).toEqual(['is-done', 'is-done', 'is-done', 'is-done', 'is-wait', 'is-later']);
    expect(links[4]).toHaveAttribute('aria-current', 'step');
    expect(links.filter((link) => link.hasAttribute('aria-current'))).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Verificare' })).toBeInTheDocument();
    expect(screen.getByText('Punctele nesigure te așteaptă pe tine. Accepți sau schimbi punctajul.')).toBeInTheDocument();
  });

  it('opens the stage a link names, keeps it in the address, and moves on with the next-stage link', async () => {
    renderAdmin(
      PAGE,
      doneApi(),
      <>
        <LocationProbe />
        <NavigationProbe />
      </>,
    );
    await openStage('Pregătire');
    await expectLocation('/teste/6E2-26T1#pregatire');
    // The stage replaces the address: Back leaves the test page.
    expect(screen.getByTestId('navigation')).toHaveTextContent('REPLACE');
    const stages = screen.getByRole('navigation', { name: 'Etapele testului' });
    expect(within(stages).getByRole('link', { name: /^Pregătire / })).toHaveAttribute('aria-current', 'step');
    expect(within(stages).getByRole('link', { name: /^Verificare / })).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('heading', { level: 2, name: 'Verificare' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Următoarea etapă: Tipărire →' }));
    // The new panel's heading takes the focus, so the page shows its top.
    expect(await screen.findByRole('heading', { level: 2, name: 'Tipărire' })).toHaveFocus();
    await expectLocation('/teste/6E2-26T1#tiparire');
    // A click on the list of stages keeps the focus on its link.
    const corectare = within(stages).getByRole('link', { name: /^Corectare / });
    await userEvent.click(corectare);
    expect(await screen.findByRole('heading', { level: 2, name: 'Corectare' })).not.toHaveFocus();
    expect(corectare).toHaveFocus();
  });

  it('moves the focus to a new panel only when the next-stage link opened it', async () => {
    renderAdmin(`${PAGE}#pregatire`, doneApi());
    const user = userEvent.setup();
    // A click with Ctrl opens the link in a new tab: this page stays as it is.
    // jsdom has no tabs, so the test stops that part of the click.
    const noNewTab = (event: MouseEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };
    window.addEventListener('click', noNewTab, true);
    await user.keyboard('{Control>}');
    await user.click(await screen.findByRole('link', { name: 'Următoarea etapă: Tipărire →' }));
    await user.keyboard('{/Control}');
    window.removeEventListener('click', noNewTab, true);
    expect(screen.getByRole('heading', { level: 2, name: 'Pregătire' })).toBeInTheDocument();
    const corectare = within(screen.getByRole('navigation', { name: 'Etapele testului' })).getByRole('link', { name: /^Corectare / });
    await user.click(corectare);
    expect(await screen.findByRole('heading', { level: 2, name: 'Corectare' })).not.toHaveFocus();
    expect(corectare).toHaveFocus();
  });

  it('opens the stage the test is at now, not the one that data kept from an earlier visit shows', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: {},
      tests: [
        fakeTest(
          { status: 'evaluating', startedAt: '2026-10-06T07:15:00.000Z', evaluationStartedAt: '2026-10-07T08:00:00.000Z' },
          flagged.map((row) => ({ ...row, flagCount: 0 })),
        ),
      ],
    });
    renderAdmin(PAGE, api, <GoToTest />);
    expect(await screen.findByRole('heading', { level: 2, name: 'Corectare' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: '← Toate testele' }));
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Etapele testului' })).not.toBeInTheDocument());
    // Meanwhile the grading ended, and points wait to be checked.
    api.getTest = doneApi().getTest;
    await userEvent.click(screen.getByRole('button', { name: 'Mergi la test' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Verificare' })).toBeInTheDocument();
  });

  it('opens the stage the address names, and the current stage for an unknown address', async () => {
    const { unmount } = renderAdmin(`${PAGE}#in-clasa`, doneApi());
    expect(await screen.findByRole('heading', { level: 2, name: 'În clasă' })).toBeInTheDocument();
    unmount();
    renderAdmin(`${PAGE}#nimic`, doneApi());
    expect(await screen.findByRole('heading', { level: 2, name: 'Verificare' })).toBeInTheDocument();
  });

  it('keeps the panel open when a button moves the test to another stage', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
      students: {},
      tests: [
        fakeTest({
          files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: { name: 'Barem.docx', type: PDF_TYPE } },
          barem: { request: 'none', unchecked: true },
          print: { status: 'ready', fromWord: false },
        }),
      ],
    });
    renderAdmin(PAGE, api);
    const stages = await screen.findByRole('navigation', { name: 'Etapele testului' });
    expect(within(stages).getByRole('link', { name: 'Pregătire te așteaptă: baremul de verificat' })).toHaveAttribute('aria-current', 'step');
    await userEvent.click(screen.getByRole('button', { name: 'Am verificat baremul' }));
    // The test is ready for the class now, and its current stage is În clasă.
    expect(await within(stages).findByRole('link', { name: 'Pregătire gata' })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('heading', { level: 2, name: 'Pregătire' })).toBeInTheDocument();
  });

  it('says what a stage that has not come yet will hold', async () => {
    renderAdmin(`${PAGE}#corectare`, apiWith());
    expect(await screen.findByText(/^Corectarea începe după ce elevii trimit lucrările\./)).toBeInTheDocument();
    await openStage('Verificare');
    expect(screen.getByText('Punctele nesigure apar după ce se corectează lucrările.')).toBeInTheDocument();
    await openStage('Rezultate');
    expect(screen.getByRole('heading', { level: 3, name: 'Rezultatele se publică după corectare' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('TestPage Verificare', () => {
  function reviewApi(rows: UploadRow[]) {
    return createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [fakeTest({ status: 'done', startedAt: '2026-10-06T07:15:00.000Z' }, rows)],
    });
  }

  it('lists each point with its reason, each opening the review at it, and starts with the first', async () => {
    renderAdmin(
      PAGE,
      reviewApi([
        fakeUpload({
          studentId: 10,
          studentName: 'Pop Ion',
          submissionId: 5,
          status: 'graded',
          fileCount: 2,
          grade: 8.75,
          flagCount: 1,
          reviewPoints: [fakePoint(31, { label: 'Subiectul I, 3)', points: 0.5, maxPoints: 2, reason: 'Cifra se citește greu.' })],
        }),
        fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
        fakeUpload({
          studentId: 12,
          studentName: 'Marin Dan',
          submissionId: 7,
          status: 'graded',
          fileCount: 1,
          grade: 6.5,
          flagCount: 2,
          reviewPoints: [
            { kind: 'pages', pages: ['student/page-02.jpg'] },
            fakePoint(41, { label: 'Subiectul II, 1)', points: 3, maxPoints: 5, reason: 'Răspunsul e tăiat.' }),
          ],
        }),
      ]),
    );
    const panel = await screen.findByRole('region', { name: 'Verificare' });
    expect(within(panel).getByRole('link', { name: 'Începe verificarea' })).toHaveAttribute('href', '/teste/6E2-26T1/verificare');
    expect(within(panel).getByRole('link', { name: 'Începe verificarea' })).toHaveClass('button');
    const points = within(within(panel).getByRole('list', { name: 'Puncte de verificat' })).getAllByRole('listitem');
    expect(points.map((point) => point.textContent)).toEqual([
      'Pop Ion · Subiectul I, 3)Cifra se citește greu.propus 0,5p din 2pDecide',
      'Marin Dan · Paginile necititeRobotul nu a putut citi: Pagina 2.Decide',
      'Marin Dan · Subiectul II, 1)Răspunsul e tăiat.propus 3p din 5pDecide',
    ]);
    expect(within(points[2]!).getByText('propus 3p din 5p')).toHaveClass('tag', 'tag-wait');
    expect(within(panel).getByRole('link', { name: 'Decide: Pop Ion, Subiectul I, 3)' })).toHaveAttribute(
      'href',
      '/teste/6E2-26T1/verificare?lucrare=5&punct=31',
    );
    expect(within(panel).getByRole('link', { name: 'Decide: Marin Dan, Paginile necitite' })).toHaveAttribute(
      'href',
      '/teste/6E2-26T1/verificare?lucrare=7&punct=pagini',
    );
    // The table of every paper follows.
    expect(within(panel).getByRole('rowheader', { name: 'Stan Eva' })).toBeInTheDocument();
  });

  it('says when every point is checked, and still opens the papers in the review', async () => {
    renderAdmin(
      `${PAGE}#verificare`,
      reviewApi([fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 })]),
    );
    expect(await screen.findByText(/^Toate punctele sunt verificate\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vezi lucrările' })).toHaveAttribute('href', '/teste/6E2-26T1/verificare');
    expect(screen.queryByRole('link', { name: 'Începe verificarea' })).not.toBeInTheDocument();
  });

  it('waits for the grading before it lists anything', async () => {
    renderAdmin(`${PAGE}#verificare`, apiWith({ status: 'evaluating' }));
    expect(await screen.findByText('Punctele nesigure apar după ce se corectează lucrările.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Puncte de verificat' })).not.toBeInTheDocument();
    expect(screen.queryByText('Toate punctele sunt verificate.')).not.toBeInTheDocument();
  });
});

describe('TestPage and a test started by mistake', () => {
  const noFiles = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'uploading', fileCount: 0 }), fakeUpload({ studentId: 12, studentName: 'Marin Dan' })];

  function openApi(rows: UploadRow[]) {
    return createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: {},
      tests: [fakeTest({ status: 'open', startedAt: '2026-10-05T17:30:00.000Z' }, structuredClone(rows))],
    });
  }

  it('stops an open test while no student has uploaded a file, after a confirmation', async () => {
    const api = openApi(noFiles);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#in-clasa`, api);
    expect(await screen.findByText(/început 5 oct\. 2026, 20:30/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Oprește testul' }));
    expect(confirm).toHaveBeenCalledWith(
      'Oprești testul? Elevii nu mai pot încărca lucrările până îl începi din nou, iar data testului se șterge.',
    );
    expect(api.stopTest).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByRole('button', { name: 'Începe testul' })).toBeInTheDocument();
    expect(screen.getByText('Ciornă')).toBeInTheDocument();
    expect(screen.queryByText(/început 5 oct/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Oprește testul' })).not.toBeInTheDocument();
  });

  it('keeps the test open when the teacher says no', async () => {
    const api = openApi(noFiles);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin(`${PAGE}#in-clasa`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Oprește testul' }));
    expect(api.stopTest).not.toHaveBeenCalled();
  });

  it('says in the confirmation that a scheduled evaluation is cancelled too', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: {},
      tests: [fakeTest({ status: 'open', evaluationAt: '2026-10-06T09:00:00.000Z' }, structuredClone(noFiles))],
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin(`${PAGE}#in-clasa`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Oprește testul' }));
    expect(confirm).toHaveBeenCalledWith(
      'Oprești testul? Elevii nu mai pot încărca lucrările până îl începi din nou, iar data testului se șterge. Evaluarea programată se anulează.',
    );
  });

  it('offers no stop on a test reopened after an evaluation', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: {},
      tests: [fakeTest({ status: 'open', evaluationStartedAt: '2026-10-06T09:00:00.000Z' }, structuredClone(noFiles))],
    });
    renderAdmin(`${PAGE}#in-clasa`, api);
    expect(await screen.findByText(/^Elevii trimit lucrările\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Oprește testul' })).not.toBeInTheDocument();
  });

  it('offers no stop once a student has uploaded a file', async () => {
    renderAdmin(`${PAGE}#in-clasa`, openApi(uploads));
    expect(await screen.findByText(/^Elevii trimit lucrările\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Oprește testul' })).not.toBeInTheDocument();
  });

  it('says why the API refused the stop', async () => {
    const api = openApi(noFiles);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.stopTest.mockRejectedValueOnce(
      new ApiError(409, 'has_uploads', 'Un elev a încărcat deja lucrarea, așa că testul nu mai poate fi oprit.'),
    );
    renderAdmin(`${PAGE}#in-clasa`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Oprește testul' }));
    expect(await screen.findByText('Un elev a încărcat deja lucrarea, așa că testul nu mai poate fi oprit.')).toBeInTheDocument();
  });
});

describe('refreshInterval', () => {
  it('asks for news every 10 seconds only while uploads or grading go on', () => {
    expect(refreshInterval('open')).toBe(10_000);
    expect(refreshInterval('evaluating')).toBe(10_000);
    expect(refreshInterval('draft')).toBe(false);
    expect(refreshInterval('done')).toBe(false);
    expect(refreshInterval(undefined)).toBe(false);
    expect(refreshInterval('draft', 'requested')).toBe(10_000);
    expect(refreshInterval('draft', 'failed')).toBe(false);
    // A draft whose print PDF the robot is making.
    expect(refreshInterval('draft', 'none', true)).toBe(10_000);
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
    renderAdmin(`${PAGE}#corectare`, api);
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

  it('keeps the selection while the teacher looks at another stage', async () => {
    const api = evaluationApi({});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#corectare`, api);
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    await userEvent.click(within(pop).getByLabelText('Selectează lucrarea elevului Pop Ion'));
    await openStage('În clasă');
    await openStage('Corectare');
    expect(screen.getByLabelText('Selectează lucrarea elevului Pop Ion')).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Pornește evaluarea acum' }));
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', undefined, [5]);
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
    renderAdmin(`${PAGE}#corectare`, evaluationApi({}, rows));
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
    renderAdmin(`${PAGE}#corectare`, api);
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    expect(within(pop).queryByRole('checkbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Selectează toate lucrările cu fișiere'));
    await userEvent.click(screen.getByRole('button', { name: 'Pornește evaluarea acum' }));
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', undefined, [6]);
  });

  it('offers "Marchează ca terminat" in place of the start button when every sent paper is graded', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
    ];
    const api = evaluationApi({ evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, rows);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAdmin(`${PAGE}#corectare`, api);
    expect(await screen.findByText('✓ Corectat complet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pornește evaluarea acum' })).not.toBeInTheDocument();
    expect(screen.queryByText('Selectează cel puțin o lucrare cu fișiere din tabel.')).not.toBeInTheDocument();
    const finish = screen.getByRole('button', { name: 'Marchează ca terminat' });
    await userEvent.click(finish);
    expect(api.finishTest).not.toHaveBeenCalled();
    await userEvent.click(finish);
    expect(api.finishTest).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByText(/^Corectarea s-a terminat\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marchează ca terminat' })).not.toBeInTheDocument();
  });

  it('keeps the start button while a sent paper waits for grading', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'submitted', fileCount: 1 }),
    ];
    renderAdmin(`${PAGE}#corectare`, evaluationApi({}, rows));
    expect(await screen.findByRole('button', { name: 'Pornește evaluarea acum' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Marchează ca terminat' })).not.toBeInTheDocument();
    expect(screen.queryByText('✓ Corectat complet')).not.toBeInTheDocument();
  });

  it('saves extra comments for the barem', async () => {
    const api = evaluationApi({});
    renderAdmin(`${PAGE}#pregatire`, api);
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
    renderAdmin(`${PAGE}#corectare`, evaluationApi({ status: 'done', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, rows));
    expect(await screen.findByText('Corectarea s-a terminat. Evaluarea a pornit la 7 oct. 2026, 11:00.')).toBeInTheDocument();
    expect(screen.getByText('Evaluare parțială.')).toBeInTheDocument();
    expect(screen.getByText(/1 lucrare cu fișiere nu a fost corectată/)).toBeInTheDocument();
  });

  it('says nothing partial when every upload with files was graded', async () => {
    const rows = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 })];
    renderAdmin(`${PAGE}#corectare`, evaluationApi({ status: 'done', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, rows));
    expect(await screen.findByText('Corectarea s-a terminat. Evaluarea a pornit la 7 oct. 2026, 11:00.')).toBeInTheDocument();
    expect(screen.queryByText('Evaluare parțială.')).not.toBeInTheDocument();
  });

  it('says what the evaluation still needs', async () => {
    const empty = [fakeUpload({ studentId: 12, studentName: 'Marin Dan' })];
    renderAdmin(`${PAGE}#corectare`, evaluationApi({ files: { test: FILES.test, barem: null } }, empty));
    expect(await screen.findByRole('button', { name: 'Pornește evaluarea acum' })).toBeDisabled();
    expect(screen.getByText('Ca să pornești evaluarea: Încarcă baremul. Niciun elev nu a încărcat încă fișiere.')).toBeInTheDocument();
    expect(screen.getByLabelText('Sau pornește evaluarea automat la')).toBeDisabled();
  });

  it("schedules the evaluation in Romania's time, and cancels the schedule", async () => {
    const api = evaluationApi({});
    renderAdmin(`${PAGE}#corectare`, api);
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

  it('shows a problem of the barem in Corectare, takes a new barem in Pregătire, and grades anyway', async () => {
    const message = 'Punctajele din barem dau 9, dar totalul este 10.';
    const api = evaluationApi({ status: 'evaluating', exerciseList: { status: 'problem', message } });
    renderAdmin(`${PAGE}#corectare`, api);
    expect(await screen.findByText(message)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Înlocuiește baremul' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Pregătire' })).toBeInTheDocument();
    expect(screen.getByLabelText('Înlocuiește baremul')).toBeEnabled();
    await openStage('Corectare');
    await userEvent.click(screen.getByRole('button', { name: 'Folosește oricum' }));
    expect(api.acceptExerciseList).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.');
    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument());
    await openStage('Pregătire');
    expect(screen.getByLabelText('Înlocuiește baremul')).toBeDisabled();
  });

  it('gives the focus to the panel Pregătire when the barem warning opens it', async () => {
    const api = evaluationApi({ status: 'evaluating', exerciseList: { status: 'problem', message: 'Punctajele din barem dau 9, dar totalul este 10.' } });
    renderAdmin(`${PAGE}#corectare`, api);
    await userEvent.click(await screen.findByRole('link', { name: 'Înlocuiește baremul' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Pregătire' })).toHaveFocus();
  });

  it('asks before replacing the barem and keeps it on Renunță', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const api = evaluationApi({});
    renderAdmin(`${PAGE}#pregatire`, api);
    const input = await screen.findByLabelText('Înlocuiește baremul');
    await userEvent.upload(input, new File(['%PDF-1.7'], 'nou.pdf', { type: PDF_TYPE }));
    expect(window.confirm).toHaveBeenCalledWith('Înlocuiești baremul existent cu nou.pdf?');
    expect(api.uploadTestFile).not.toHaveBeenCalled();
    expect(input).toHaveValue('');
    expect(screen.getByRole('link', { name: 'Barem.pdf' })).toBeInTheDocument();
  });

  it('replaces the barem when the teacher confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const api = evaluationApi({});
    renderAdmin(`${PAGE}#pregatire`, api);
    const file = new File(['%PDF-1.7'], 'nou.pdf', { type: PDF_TYPE });
    await userEvent.upload(await screen.findByLabelText('Înlocuiește baremul'), file);
    expect(api.uploadTestFile).toHaveBeenCalledTimes(1);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'barem', file);
  });

  it('does not ask for the first barem', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const api = evaluationApi({ files: { test: FILES.test, barem: null } });
    renderAdmin(`${PAGE}#pregatire`, api);
    await userEvent.upload(await screen.findByLabelText('Încarcă baremul'), new File(['%PDF-1.7'], 'nou.pdf', { type: PDF_TYPE }));
    expect(confirm).not.toHaveBeenCalled();
    expect(api.uploadTestFile).toHaveBeenCalledTimes(1);
  });

  it('does not ask before replacing the test file', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const api = evaluationApi({});
    renderAdmin(`${PAGE}#pregatire`, api);
    await userEvent.upload(await screen.findByLabelText('Înlocuiește testul'), new File(['%PDF-1.7'], 'nou.pdf', { type: PDF_TYPE }));
    expect(confirm).not.toHaveBeenCalled();
    expect(api.uploadTestFile).toHaveBeenCalledTimes(1);
  });

  it('takes a new barem during evaluation and says when the robot starts', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const message = 'Punctajele din barem dau 9, dar totalul este 10.';
    const api = evaluationApi({ status: 'evaluating', exerciseList: { status: 'problem', message } });
    renderAdmin(`${PAGE}#pregatire`, api);
    const file = new File(['%PDF-1.7'], 'Barem nou.pdf', { type: PDF_TYPE });
    await userEvent.upload(await screen.findByLabelText('Înlocuiește baremul'), file);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'barem', file);
    expect(await screen.findByText('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Înlocuiește baremul')).toBeDisabled());
    await openStage('Corectare');
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it('takes a new barem on an open test without a robot message', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const message = 'Punctajele din barem dau 9, dar totalul este 10.';
    const api = evaluationApi({ exerciseList: { status: 'problem', message } });
    renderAdmin(`${PAGE}#pregatire`, api);
    const file = new File(['%PDF-1.7'], 'Barem nou.pdf', { type: PDF_TYPE });
    await userEvent.upload(await screen.findByLabelText('Înlocuiește baremul'), file);
    expect(await screen.findByRole('link', { name: 'Barem nou.pdf' })).toBeInTheDocument();
    expect(screen.queryByText(/^Robotul pornește/)).not.toBeInTheDocument();
    await openStage('Corectare');
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it('accepts a problem of the barem on an open test without a robot message', async () => {
    const message = 'Punctajele din barem dau 9, dar totalul este 10.';
    const api = evaluationApi({ exerciseList: { status: 'problem', message } });
    renderAdmin(`${PAGE}#corectare`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Folosește oricum' }));
    expect(api.acceptExerciseList).toHaveBeenCalledWith('6E2-26T1');
    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('lets the robot try the barem again', async () => {
    const api = evaluationApi({ status: 'evaluating', exerciseList: { status: 'failed', message: 'Robotul nu a terminat la timp.' } });
    renderAdmin(`${PAGE}#corectare`, api);
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
    renderAdmin(`${PAGE}#corectare`, api);
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
    renderAdmin(`${PAGE}#corectare`, api);
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
    renderAdmin(`${PAGE}#corectare`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Recorectează tot' }));
    expect(await screen.findByText('Limita contului demo: se corectează din nou 1 din cele 2 lucrări. Celelalte își păstrează rezultatele.')).toBeInTheDocument();
  });

  it('counts only the papers that stayed out, while the robot grades the others', async () => {
    const api = evaluationApi({ status: 'evaluating' }, [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 1 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan', submissionId: 7, status: 'uploading', fileCount: 0 }),
    ]);
    renderAdmin(`${PAGE}#corectare`, api);
    expect(await screen.findByText('Evaluare parțială.')).toBeInTheDocument();
    expect(screen.getByText(/1 lucrare cu fișiere nu a fost corectată/)).toBeInTheDocument();
  });

  it('says that an open test grades the uploads again after Start evaluation', async () => {
    const api = evaluationApi({ status: 'open' }, gradedAndFailed());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#corectare`, api);
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
    await openStage('În clasă');
    await userEvent.click(screen.getByRole('button', { name: 'Redeschide încărcarea' }));
    expect(await screen.findByText(/^Elevii trimit lucrările\./)).toBeInTheDocument();
    await openStage('Corectare');
    expect(screen.getByRole('button', { name: 'Pornește evaluarea acum' })).toBeInTheDocument();
    expect(screen.queryByText('Lucrările se corectează din nou după ce pornești evaluarea.')).not.toBeInTheDocument();
  });

  it('offers no regrade while nothing is graded', async () => {
    renderAdmin(`${PAGE}#corectare`, evaluationApi({ status: 'evaluating' }));
    expect(await screen.findByText(/^Robotul corectează lucrările trimise\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recorectează tot' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recorectează' })).not.toBeInTheDocument();
  });

  it('regrades one graded upload from its row', async () => {
    const api = evaluationApi({ status: 'done' }, gradedAndFailed());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#corectare`, api);
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
    renderAdmin(`${PAGE}#corectare`, api);
    fireEvent.change(await screen.findByLabelText('Sau pornește evaluarea automat la'), { target: { value: '2026-10-08T10:05' } });
    vi.setSystemTime(new Date('2026-10-08T07:06:00.000Z'));
    await userEvent.click(screen.getByRole('button', { name: 'Programează' }));
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', '2026-10-08T07:05:00.000Z');
    expect(await screen.findByText('Se corectează', { selector: '.status' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(NOT_STARTED);
  });

  it('says that the robot did not start for a test in evaluation, also after a reload', async () => {
    renderAdmin(PAGE, failedStartApi({ status: 'evaluating' }));
    expect(await screen.findByRole('status')).toHaveTextContent(NOT_STARTED);
  });

  it('says it once after a button could not start the robot either', async () => {
    const failed = 'Robotul nu a terminat la timp.';
    const api = failedStartApi({ status: 'evaluating', exerciseList: { status: 'failed', message: failed } });
    renderAdmin(`${PAGE}#corectare`, api);
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
    renderAdmin(`${PAGE}#corectare`, failedStartApi({ status, ...overrides }));
    expect(await screen.findByText(line)).toBeInTheDocument();
    expect(screen.queryByText(NOT_STARTED)).not.toBeInTheDocument();
  });

  it('starts the robot again when grading is late and work waits', async () => {
    const api = evaluationApi({ status: 'evaluating' });
    renderAdmin(`${PAGE}#corectare`, api);
    expect(await screen.findByText('Corectarea poate întârzia.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pornește robotul' }));
    expect(api.startRobot).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByRole('status')).toHaveTextContent(robotStartMessage('next_check'));
  });

  it('says why the robot did not start', async () => {
    const api = evaluationApi({ status: 'evaluating' });
    api.startRobot.mockRejectedValueOnce(new ApiError(409, 'no_work', 'Nicio lucrare a acestui test nu așteaptă robotul.'));
    renderAdmin(`${PAGE}#corectare`, api);
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
    renderAdmin(`${PAGE}#corectare`, evaluationApi(overrides, rows, lastCheckAt));
    expect(await screen.findByText(/^Robotul (nu )?a verificat/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pornește robotul' }) !== null).toBe(shown);
  });

  it('says in Corectare that the robot writes the class analysis, and links to the class report in Rezultate', async () => {
    renderAdmin(`${PAGE}#corectare`, evaluationApi({ status: 'evaluating', analysis: { status: 'requested', stale: false, attempts: 0 } }, graded));
    expect(await screen.findByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).toBeInTheDocument();
    await openStage('Rezultate');
    expect(screen.getByRole('link', { name: 'Deschide raportul' })).toHaveAttribute('href', '/teste/6E2-26T1/raport');
  });

  it('says that the last attempt failed instead of saying that the robot writes, after a failed attempt', async () => {
    renderAdmin(`${PAGE}#corectare`, evaluationApi({ status: 'evaluating', analysis: { status: 'requested', stale: false, attempts: 1 } }, graded));
    expect(
      await screen.findByText('Ultima încercare a eșuat. Robotul va încerca din nou la următoarea rulare.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).not.toBeInTheDocument();
  });

  it('does not say that the work is graded while an upload still waits', async () => {
    const mixed = [...graded, fakeUpload({ studentId: 11, studentName: 'Avram Dan', submissionId: 6, status: 'submitted', fileCount: 1 })];
    renderAdmin(
      `${PAGE}#corectare`,
      evaluationApi({ status: 'evaluating', gradedCount: 1, analysis: { status: 'requested', stale: false, attempts: 0 } }, mixed),
    );
    expect(await screen.findByText(/^Robotul corectează lucrările trimise\./)).toBeInTheDocument();
    expect(screen.queryByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).not.toBeInTheDocument();
    await openStage('Rezultate');
    expect(screen.getByRole('link', { name: 'Deschide raportul' })).toBeInTheDocument();
  });

  it('shows the link to the class report only when something is graded', async () => {
    renderAdmin(`${PAGE}#rezultate`, evaluationApi({ status: 'evaluating' }, leftInGrading));
    expect(await screen.findByRole('heading', { level: 2, name: 'Rezultate' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Deschide raportul' })).not.toBeInTheDocument();
    await openStage('Corectare');
    expect(await screen.findByText(/^Robotul (nu )?a verificat/)).toBeInTheDocument();
    expect(screen.queryByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).not.toBeInTheDocument();
  });

  it('puts the class report in Rezultate once a result is graded', async () => {
    renderAdmin(PAGE, evaluationApi({ status: 'done' }, graded));
    const panel = await screen.findByRole('region', { name: 'Rezultate' });
    const link = within(panel).getByRole('link', { name: 'Deschide raportul' });
    expect(link).toHaveAttribute('href', '/teste/6E2-26T1/raport');
    expect(link).toHaveClass('button-quiet', 'button-small');
    expect(screen.getAllByRole('link', { name: 'Deschide raportul' })).toHaveLength(1);
  });

  it('has no report button before any grading', async () => {
    renderAdmin(`${PAGE}#rezultate`, evaluationApi({ status: 'evaluating' }, leftInGrading));
    expect(await screen.findByRole('heading', { level: 2, name: 'Rezultate' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Deschide raportul' })).not.toBeInTheDocument();
  });

  it('says when the class analysis failed', async () => {
    renderAdmin(`${PAGE}#corectare`, evaluationApi({ status: 'done', analysis: { status: 'failed', stale: false, attempts: 0 } }, graded));
    expect(await screen.findByText('Robotul nu a putut scrie analiza clasei.')).toBeInTheDocument();
    await openStage('Rezultate');
    expect(screen.getByRole('link', { name: 'Deschide raportul' })).toBeInTheDocument();
  });
});
