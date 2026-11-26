import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api.ts';
import { PDF_TYPE } from '../../../shared/files.ts';
import type { UploadRow } from '../../../shared/api.ts';
import { unsupportedMessage } from '../../../shared/subjects.ts';
import { robotStartMessage } from '../../ui/format.ts';
import { createFakeApi, FAKE_STARTED_AT, FAKE_TOKEN, fakeTeacher, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { uploads, PAGE, openStage, chooseAction, actionNames, chooseInRow } from './testPageTestKit.tsx';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('TestPage evaluation', () => {
  const FILES = { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: { name: 'Barem.pdf', type: PDF_TYPE } };
  const NOW = new Date('2026-10-08T07:00:00.000Z');

  // Pop Ion sent his paper, Stan Eva is still sending hers (one file), Marin
  // Dan sent nothing. New objects, so no earlier test changed them.
  const twoWithFiles = () => [
    fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 3, submittedAt: '2026-10-06T07:40:00.000Z' }),
    fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1, startedAt: '2026-10-06T07:25:00.000Z' }),
    fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
  ];

  // The rows these tests are about: Pop Ion sent his paper, Stan Eva and Marin
  // Dan sent nothing, so no paper with files is left out of the evaluation.
  const sentByPop = (): UploadRow[] => [uploads[0]!, fakeUpload({ studentId: 11, studentName: 'Stan Eva' }), uploads[2]!];

  function evaluationApi(overrides: Parameters<typeof fakeTest>[0], rows: UploadRow[] = sentByPop(), lastCheckAt: string | null = null) {
    const detail = fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, files: structuredClone(FILES), print: { status: 'ready', fromWord: false }, ...overrides }, structuredClone(rows));
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
    const api = evaluationApi({}, twoWithFiles());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAdmin(`${PAGE}#grading`, api);
    const start = await screen.findByRole('button', { name: 'Închide încărcarea și pornește corectarea' });
    // Every upload with files starts checked: the button is on.
    expect(start).toBeEnabled();
    expect(screen.getByLabelText('Selectează lucrarea elevului Pop Ion')).toBeChecked();
    expect(screen.getByLabelText('Selectează lucrarea elevului Stan Eva')).toBeChecked();
    expect(screen.getByLabelText('Selectează toate lucrările cu fișiere')).toBeChecked();
    // Uncheck one upload to grade it later (its row checkbox, not the shared header).
    const stan = screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!;
    await userEvent.click(within(stan).getByLabelText('Selectează lucrarea elevului Stan Eva'));
    expect(start).toBeEnabled();
    await userEvent.click(start);
    expect(api.evaluateTest).not.toHaveBeenCalled();
    await userEvent.click(start);
    expect(confirm).toHaveBeenLastCalledWith(
      'Închizi încărcarea și pornești corectarea pentru 1 lucrare? Elevii nu mai pot trimite; poți redeschide încărcarea oricând. Lucrările neselectate cu fișiere așteaptă o corectare ulterioară.',
    );
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', undefined, [5]);
    expect(await screen.findByText('Se corectează', { selector: '.status' })).toBeInTheDocument();
    expect(screen.getByText('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.')).toHaveAttribute('role', 'status');
    // The unchecked paper waits for a later evaluation.
    expect(screen.getByText(/1 lucrare cu fișiere nu a fost corectată/)).toBeInTheDocument();
    expect(screen.getByText('Acum · corectarea a pornit pe 8 oct. 2026, 10:00')).toBeInTheDocument();
    expect(screen.getByText('Robotul nu a verificat încă dacă are lucrări de corectat.')).toBeInTheDocument();
    expect(screen.getByText('Corectarea poate întârzia.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copiază linkul' })).not.toBeInTheDocument();
  });

  it('starts the evaluation for every upload with files when the teacher unchecks nothing', async () => {
    const api = evaluationApi({}, twoWithFiles());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#grading`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Închide încărcarea și pornește corectarea' }));
    expect(confirm).toHaveBeenLastCalledWith(
      'Închizi încărcarea și pornești corectarea pentru 2 lucrări? Elevii nu mai pot trimite; poți redeschide încărcarea oricând. Lucrările neselectate cu fișiere așteaptă o corectare ulterioară.',
    );
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', undefined, [5, 6]);
  });

  it('keeps an unchecked upload unchecked while the teacher looks at another stage', async () => {
    const api = evaluationApi({}, twoWithFiles());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#grading`, api);
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    await userEvent.click(within(pop).getByLabelText('Selectează lucrarea elevului Pop Ion'));
    await openStage('În clasă');
    await openStage('Corectare');
    expect(screen.getByLabelText('Selectează lucrarea elevului Pop Ion')).not.toBeChecked();
    expect(screen.getByLabelText('Selectează lucrarea elevului Stan Eva')).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Închide încărcarea și pornește corectarea' }));
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', undefined, [6]);
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
    renderAdmin(`${PAGE}#grading`, evaluationApi({}, rows));
    const start = await screen.findByRole('button', { name: 'Închide încărcarea și pornește corectarea' });
    expect(start).toBeEnabled();
    // The student without files has no checkbox; the graded one cannot be picked.
    const marin = screen.getByRole('rowheader', { name: 'Marin Dan' }).closest('tr')!;
    expect(within(marin).queryByRole('checkbox')).not.toBeInTheDocument();
    // The header checkbox clears every upload with files, and checks them again.
    const all = screen.getByLabelText('Selectează toate lucrările cu fișiere');
    await userEvent.click(all);
    expect(start).toBeDisabled();
    expect(screen.getByText('Bifează în tabel cel puțin o lucrare cu fișiere.')).toBeInTheDocument();
    await userEvent.click(all);
    expect(start).toBeEnabled();
    // One row at a time works too; with only some checked, the header box is mixed.
    await userEvent.click(all);
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    await userEvent.click(within(pop).getByLabelText('Selectează lucrarea elevului Pop Ion'));
    expect(start).toBeEnabled();
    expect(all).toBePartiallyChecked();
  });

  it('checks a paper sent after the page opened', async () => {
    const api = evaluationApi({}, twoWithFiles());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { queryClient } = renderAdmin(`${PAGE}#grading`, api);
    const stan = (await screen.findByRole('rowheader', { name: 'Stan Eva' })).closest('tr')!;
    await userEvent.click(within(stan).getByLabelText('Selectează lucrarea elevului Stan Eva'));
    // Marin Dan sends a paper; the page reads the test again.
    const detail = await api.getTest('6E2-26T1');
    const marin = detail.uploads.find((row) => row.studentId === 12)!;
    Object.assign(marin, { submissionId: 7, status: 'uploading', fileCount: 2, startedAt: '2026-10-06T07:30:00.000Z' });
    api.getTest.mockResolvedValue(structuredClone(detail));
    await queryClient.invalidateQueries({ queryKey: ['test', '6E2-26T1'] });
    expect(await screen.findByLabelText('Selectează lucrarea elevului Marin Dan')).toBeChecked();
    expect(screen.getByLabelText('Selectează lucrarea elevului Stan Eva')).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Închide încărcarea și pornește corectarea' }));
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', undefined, [5, 7]);
  });

  it('leaves the graded uploads out of the selection', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'submitted', fileCount: 1 }),
    ];
    const api = evaluationApi({ status: 'open' }, rows);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#grading`, api);
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    expect(within(pop).queryByRole('checkbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Închide încărcarea și pornește corectarea' }));
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
    renderAdmin(`${PAGE}#grading`, api);
    // Marin Dan can still send: the label stays grey until the uploads close.
    expect(await screen.findByText('2 corectate · 1 încă nu a trimis')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Închide încărcarea și pornește corectarea' })).not.toBeInTheDocument();
    expect(screen.queryByText('Bifează în tabel cel puțin o lucrare cu fișiere.')).not.toBeInTheDocument();
    const finish = screen.getByRole('button', { name: 'Marchează ca terminat' });
    await userEvent.click(finish);
    expect(api.finishTest).not.toHaveBeenCalled();
    await userEvent.click(finish);
    expect(api.finishTest).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByText('Corectarea s-a terminat')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marchează ca terminat' })).not.toBeInTheDocument();
  });

  it('labels the papers "toate corectate" in green once the uploads closed and every paper is graded', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
    ];
    renderAdmin(`${PAGE}#grading`, evaluationApi({ status: 'done', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, rows));
    const papers = await screen.findByRole('region', { name: 'Elevii' });
    expect(within(papers).getByText('toate corectate', { selector: '.tag' })).toHaveClass('tag-ok');
  });

  it('keeps the start button while a sent paper waits for grading', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'submitted', fileCount: 1 }),
    ];
    renderAdmin(`${PAGE}#grading`, evaluationApi({}, rows));
    expect(await screen.findByRole('button', { name: 'Închide încărcarea și pornește corectarea' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Marchează ca terminat' })).not.toBeInTheDocument();
    expect(screen.queryByText('toate corectate')).not.toBeInTheDocument();
  });

  it('saves the indications for the barem from a text box that is always open', async () => {
    const api = evaluationApi({});
    renderAdmin(`${PAGE}#prepare`, api);
    const box = await screen.findByLabelText('Indicații suplimentare pentru corectare');
    expect(box).toHaveAccessibleDescription('Se adaugă la barem. Robotul le folosește când dă punctele, ca să corecteze cum vrei tu.');
    expect(screen.queryByRole('button', { name: 'Salvează indicațiile' })).not.toBeInTheDocument();
    await userEvent.type(box, 'Acceptă și metoda cu proporții.');
    expect(screen.getByText('31 / 2000')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvează indicațiile' }));
    expect(api.saveBaremNotes).toHaveBeenCalledWith('6E2-26T1', 'Acceptă și metoda cu proporții.', 'class');
    expect(await screen.findByText('Salvate')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvează indicațiile' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Indicații suplimentare pentru corectare')).toHaveValue('Acceptă și metoda cu proporții.');
  });

  it('hides the indications from a teacher by default, and keeps the barem row', async () => {
    const api = evaluationApi({ baremNotes: 'La 2, și proporții.' });
    api.me.mockResolvedValue({ ...fakeTeacher({ role: 'teacher' }), viewing: null });
    renderAdmin(`${PAGE}#prepare`, api);
    expect(await screen.findByLabelText('Înlocuiește baremul')).toBeInTheDocument();
    expect(screen.queryByLabelText('Indicații suplimentare pentru corectare')).not.toBeInTheDocument();
    expect(screen.queryByText('La 2, și proporții.')).not.toBeInTheDocument();
  });

  it('shows the indications to a teacher an administrator chose, and hides them from an administrator who chose not to see them', async () => {
    const teacherApi = evaluationApi({});
    teacherApi.me.mockResolvedValue({ ...fakeTeacher({ role: 'teacher', showBaremNotes: true }), viewing: null });
    const shown = renderAdmin(`${PAGE}#prepare`, teacherApi);
    expect(await screen.findByLabelText('Indicații suplimentare pentru corectare')).toBeEnabled();
    shown.unmount();

    const adminApi = evaluationApi({});
    adminApi.me.mockResolvedValue({ ...fakeTeacher({ showBaremNotes: false }), viewing: null });
    renderAdmin(`${PAGE}#prepare`, adminApi);
    expect(await screen.findByLabelText('Înlocuiește baremul')).toBeInTheDocument();
    expect(screen.queryByLabelText('Indicații suplimentare pentru corectare')).not.toBeInTheDocument();
  });

  it('takes the saved indications as they are kept, without the empty lines at the end', async () => {
    const api = evaluationApi({});
    renderAdmin(`${PAGE}#prepare`, api);
    await userEvent.type(await screen.findByLabelText('Indicații suplimentare pentru corectare'), 'Acceptă și proporții.{enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează indicațiile' }));
    expect(await screen.findByText('Salvate')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvează indicațiile' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Indicații suplimentare pentru corectare')).toHaveValue('Acceptă și proporții.');
  });

  it('puts back the saved indications with Renunță, without saving', async () => {
    const api = evaluationApi({ baremNotes: 'La 2, și proporții.' });
    renderAdmin(`${PAGE}#prepare`, api);
    const box = await screen.findByLabelText('Indicații suplimentare pentru corectare');
    expect(box).toHaveValue('La 2, și proporții.');
    await userEvent.type(box, ' Altceva.');
    await userEvent.click(screen.getByRole('button', { name: 'Renunță' }));
    expect(box).toHaveValue('La 2, și proporții.');
    expect(screen.queryByRole('button', { name: 'Salvează indicațiile' })).not.toBeInTheDocument();
    expect(api.saveBaremNotes).not.toHaveBeenCalled();
  });

  it('shows the indications before the barem is there, since a generated barem uses them too', async () => {
    renderAdmin(`${PAGE}#prepare`, evaluationApi({ files: { test: FILES.test, barem: null } }));
    expect(await screen.findByLabelText('Indicații suplimentare pentru corectare')).toBeEnabled();
    expect(screen.getByLabelText(/^Fișierul baremului/)).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Generează baremul' })).toBeEnabled();
  });

  it('says when the finished evaluation was partial', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'submitted', fileCount: 1 }),
    ];
    renderAdmin(`${PAGE}#grading`, evaluationApi({ status: 'done', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, rows));
    expect(await screen.findByText('Acum · corectarea a pornit pe 7 oct. 2026, 11:00')).toBeInTheDocument();
    expect(screen.getByText('Evaluare parțială.')).toBeInTheDocument();
    expect(screen.getByText(/1 lucrare cu fișiere nu a fost corectată/)).toBeInTheDocument();
  });

  it('says nothing partial when every upload with files was graded', async () => {
    const rows = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 })];
    renderAdmin(`${PAGE}#grading`, evaluationApi({ status: 'done', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, rows));
    expect(await screen.findByText('Acum · corectarea a pornit pe 7 oct. 2026, 11:00')).toBeInTheDocument();
    expect(screen.queryByText('Evaluare parțială.')).not.toBeInTheDocument();
  });

  it('says what the evaluation still needs', async () => {
    const empty = [fakeUpload({ studentId: 12, studentName: 'Marin Dan' })];
    renderAdmin(`${PAGE}#grading`, evaluationApi({ files: { test: FILES.test, barem: null } }, empty));
    expect(await screen.findByRole('button', { name: 'Închide încărcarea și pornește corectarea' })).toBeDisabled();
    expect(screen.getByText('Ca să pornești corectarea: Încarcă baremul. Niciun elev nu a încărcat încă fișiere.')).toBeInTheDocument();
  });


  it('shows a grading scheduled before, with no way to schedule a new one, and cancels it', async () => {
    const api = evaluationApi({ evaluationAt: '2026-10-20T07:15:00.000Z' });
    renderAdmin(`${PAGE}#grading`, api);
    expect(await screen.findByText('Corectarea pornește automat la 20 oct. 2026, 10:15.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Programează' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Anulează programarea' }));
    expect(api.cancelSchedule).toHaveBeenCalledWith('6E2-26T1');
    await waitFor(() => expect(screen.queryByText(/^Corectarea pornește automat/)).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Programează' })).not.toBeInTheDocument();
  });
  it('shows a problem of the barem in Corectare, takes a new barem in Pregătire, and grades anyway', async () => {
    const message = 'Punctajele din barem dau 9, dar totalul este 10.';
    const api = evaluationApi({ status: 'evaluating', exerciseList: { status: 'problem', message } });
    renderAdmin(`${PAGE}#grading`, api);
    expect(await screen.findByText(message)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Înlocuiește baremul' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Pregătire' })).toBeInTheDocument();
    expect(screen.getByLabelText('Înlocuiește baremul')).toBeEnabled();
    await openStage('Corectare');
    await userEvent.click(screen.getByRole('button', { name: 'Folosește oricum' }));
    expect(api.acceptExerciseList).toHaveBeenCalledWith('6E2-26T1', 'class');
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.');
    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument());
    await openStage('Pregătire');
    expect(screen.getByLabelText('Înlocuiește baremul')).toBeDisabled();
  });

  it('says in Corectare that the subject is not graded, with no retry, and opens the test file in Pregătire', async () => {
    const message = unsupportedMessage('istorie');
    const api = evaluationApi({
      status: 'evaluating',
      exerciseList: { status: 'failed', message },
      subject: { value: 'alta', name: 'istorie', by: 'robot' },
    });
    renderAdmin(`${PAGE}#grading`, api);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText('Nu corectăm încă această materie.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Încearcă din nou' })).not.toBeInTheDocument();
    expect(screen.queryByText('Robotul nu a putut citi testul și baremul.')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Corectare' })).getByRole('button', { name: 'Schimbă materia' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Înlocuiește testul' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Pregătire' })).toBeInTheDocument();
    expect(screen.getByLabelText('Înlocuiește testul')).toBeEnabled();
  });

  it('gives the focus to the panel Pregătire when the barem warning opens it', async () => {
    const api = evaluationApi({ status: 'evaluating', exerciseList: { status: 'problem', message: 'Punctajele din barem dau 9, dar totalul este 10.' } });
    renderAdmin(`${PAGE}#grading`, api);
    await userEvent.click(await screen.findByRole('link', { name: 'Înlocuiește baremul' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Pregătire' })).toHaveFocus();
  });

  it('asks before replacing the barem and keeps it on Renunță', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const api = evaluationApi({});
    renderAdmin(`${PAGE}#prepare`, api);
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
    renderAdmin(`${PAGE}#prepare`, api);
    const file = new File(['%PDF-1.7'], 'nou.pdf', { type: PDF_TYPE });
    await userEvent.upload(await screen.findByLabelText('Înlocuiește baremul'), file);
    expect(api.uploadTestFile).toHaveBeenCalledTimes(1);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'barem', file, 'class');
  });

  it('does not ask for the first barem', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const api = evaluationApi({ files: { test: FILES.test, barem: null } });
    renderAdmin(`${PAGE}#prepare`, api);
    await userEvent.upload(await screen.findByLabelText(/^Fișierul baremului/), new File(['%PDF-1.7'], 'nou.pdf', { type: PDF_TYPE }));
    expect(confirm).not.toHaveBeenCalled();
    expect(api.uploadTestFile).toHaveBeenCalledTimes(1);
  });

  it('does not ask before replacing the test file', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const api = evaluationApi({});
    renderAdmin(`${PAGE}#prepare`, api);
    await userEvent.upload(await screen.findByLabelText('Înlocuiește testul'), new File(['%PDF-1.7'], 'nou.pdf', { type: PDF_TYPE }));
    expect(confirm).not.toHaveBeenCalled();
    expect(api.uploadTestFile).toHaveBeenCalledTimes(1);
  });

  it('takes a new barem during evaluation and says when the robot starts', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const message = 'Punctajele din barem dau 9, dar totalul este 10.';
    const api = evaluationApi({ status: 'evaluating', exerciseList: { status: 'problem', message } });
    renderAdmin(`${PAGE}#prepare`, api);
    const file = new File(['%PDF-1.7'], 'Barem nou.pdf', { type: PDF_TYPE });
    await userEvent.upload(await screen.findByLabelText('Înlocuiește baremul'), file);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'barem', file, 'class');
    expect(await screen.findByText('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Înlocuiește baremul')).toBeDisabled());
    await openStage('Corectare');
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it('takes a new barem on an open test without a robot message', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const message = 'Punctajele din barem dau 9, dar totalul este 10.';
    const api = evaluationApi({ exerciseList: { status: 'problem', message } });
    renderAdmin(`${PAGE}#prepare`, api);
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
    renderAdmin(`${PAGE}#grading`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Folosește oricum' }));
    expect(api.acceptExerciseList).toHaveBeenCalledWith('6E2-26T1', 'class');
    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('lets the robot try the barem again', async () => {
    const api = evaluationApi({ status: 'evaluating', exerciseList: { status: 'failed', message: 'Robotul nu a terminat la timp.' } });
    renderAdmin(`${PAGE}#grading`, api);
    expect(await screen.findByText('Robotul nu a terminat la timp.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(api.retryExerciseList).toHaveBeenCalledWith('6E2-26T1', 'class');
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.');
  });

  it('shows the grades, the items to check, and a failed grading to try again', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 4, grade: 8.75, flagCount: 2 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'failed', fileCount: 1, lastError: 'Robotul nu a terminat la timp.' }),
    ];
    const api = evaluationApi({ status: 'done', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, rows);
    renderAdmin(`${PAGE}#grading`, api);
    const papers = await screen.findByRole('region', { name: 'Elevii' });
    expect(within(papers).getByText('1 corectată · 1 eșuată', { selector: '.tag' })).toBeInTheDocument();
    // The points to check are named in the stage list, "Urmează" and the bar at the foot, not over the table.
    expect(within(papers).queryByText('2 puncte de verificat')).not.toBeInTheDocument();
    expect(within(papers).queryByRole('link', { name: 'Verifică' })).not.toBeInTheDocument();
    expect(screen.getByText('Acum · corectarea a pornit pe 7 oct. 2026, 11:00')).toBeInTheDocument();
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    expect(within(pop).getByText('8,75')).toBeInTheDocument();
    expect(within(pop).getByText('2 de verificat')).toBeInTheDocument();
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
    renderAdmin(`${PAGE}#grading`, api);
    await screen.findByRole('rowheader', { name: 'Pop Ion' });
    // In "Acțiuni", not in the panel.
    expect(screen.queryByRole('button', { name: 'Recorectează tot' })).not.toBeInTheDocument();
    await chooseAction('Recorectează tot');
    expect(api.regradeTest).not.toHaveBeenCalled();
    await chooseAction('Recorectează tot');
    expect(confirm).toHaveBeenLastCalledWith('Recorectezi 2 lucrări? Punctajele și comentariile schimbate de tine se pierd.');
    expect(api.regradeTest).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByRole('status')).toHaveTextContent(robotStartMessage('next_check'));
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    expect(await within(pop).findByText('Trimis')).toBeInTheDocument();
    expect(within(screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!).getByText('Trimis')).toBeInTheDocument();
    expect(await actionNames()).not.toContain('Recorectează tot');
  });

  it('says how many papers the demo limit let go to a regrade', async () => {
    const api = evaluationApi({ status: 'done' }, gradedAndFailed());
    api.regradeTest.mockResolvedValueOnce({ count: 1, testStatus: 'evaluating', robot: 'next_check' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#grading`, api);
    await screen.findByRole('rowheader', { name: 'Pop Ion' });
    await chooseAction('Recorectează tot');
    expect(await screen.findByText('Limita contului demo: se corectează din nou 1 din cele 2 lucrări. Celelalte își păstrează rezultatele.')).toBeInTheDocument();
  });

  it('counts only the papers that stayed out, while the robot grades the others', async () => {
    const api = evaluationApi({ status: 'evaluating' }, [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 1 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan', submissionId: 7, status: 'uploading', fileCount: 0 }),
    ]);
    renderAdmin(`${PAGE}#grading`, api);
    expect(await screen.findByText('Evaluare parțială.')).toBeInTheDocument();
    expect(screen.getByText(/1 lucrare cu fișiere nu a fost corectată/)).toBeInTheDocument();
  });

  it('says that an open test grades the uploads again after Start evaluation', async () => {
    const api = evaluationApi({ status: 'open' }, gradedAndFailed());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#grading`, api);
    await screen.findByRole('rowheader', { name: 'Pop Ion' });
    await chooseAction('Recorectează tot');
    expect(await screen.findByRole('status')).toHaveTextContent('Lucrările se corectează din nou după ce pornești corectarea.');
    // The regraded uploads wait for grading, checked.
    expect(await screen.findByLabelText('Selectează toate lucrările cu fișiere')).toBeChecked();
    // Once the evaluation starts, the words are not true any more.
    await userEvent.click(screen.getByRole('button', { name: 'Închide încărcarea și pornește corectarea' }));
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', undefined, [5, 6]);
    expect(await screen.findByText('Se corectează', { selector: '.status' })).toBeInTheDocument();
    expect(screen.queryByText('Lucrările se corectează din nou după ce pornești corectarea.')).not.toBeInTheDocument();
    // Nor after the uploads open again.
    await openStage('În clasă');
    await userEvent.click(screen.getByRole('button', { name: 'Redeschide încărcarea' }));
    expect(await screen.findByText('Încărcarea e deschisă.')).toBeInTheDocument();
    await openStage('Corectare');
    expect(screen.getByRole('button', { name: 'Închide încărcarea și pornește corectarea' })).toBeInTheDocument();
    expect(screen.queryByText('Lucrările se corectează din nou după ce pornești corectarea.')).not.toBeInTheDocument();
  });

  it('offers no regrade while nothing is graded', async () => {
    renderAdmin(`${PAGE}#grading`, evaluationApi({ status: 'evaluating' }));
    expect(await screen.findByText(/^Se corectează: /)).toBeInTheDocument();
    expect(await actionNames()).not.toContain('Recorectează tot');
    expect(screen.queryByRole('button', { name: 'Recorectează' })).not.toBeInTheDocument();
  });

  it('regrades one graded upload from its row', async () => {
    const api = evaluationApi({ status: 'done' }, gradedAndFailed());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#grading`, api);
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    // A failed paper keeps "Reîncearcă" on the row, and its ⋯ has no regrade.
    const stan = screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!;
    expect(within(stan).getByRole('button', { name: 'Reîncearcă' })).toBeInTheDocument();
    await userEvent.click(within(stan).getByRole('button', { name: 'Mai multe pentru Stan Eva' }));
    expect(within(stan).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Resetează']);
    await userEvent.keyboard('{Escape}');
    await chooseInRow(pop, 'Pop Ion', 'Recorectează');
    expect(confirm).toHaveBeenCalledWith('Recorectezi lucrarea elevului Pop Ion? Corecturile tale se pierd.');
    expect(api.regradeSubmission).toHaveBeenCalledWith(5, '2026-10-07T09:00:00.000Z');
    expect(await within(pop).findByText('Trimis')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(robotStartMessage('next_check'));
  });

  const NOT_STARTED = 'Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.';

  // The API says that GitHub did not take the last request to start the robot.
  function failedStartApi(overrides: Parameters<typeof fakeTest>[0]) {
    const detail = fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, files: structuredClone(FILES), ...overrides }, sentByPop());
    detail.robot.startFailed = true;
    return createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [detail],
    });
  }

  it('says that the robot did not start for a test in evaluation, also after a reload', async () => {
    renderAdmin(PAGE, failedStartApi({ status: 'evaluating' }));
    expect(await screen.findByRole('status')).toHaveTextContent(NOT_STARTED);
  });

  it('says it once after a button could not start the robot either', async () => {
    const failed = 'Robotul nu a terminat la timp.';
    const api = failedStartApi({ status: 'evaluating', exerciseList: { status: 'failed', message: failed } });
    renderAdmin(`${PAGE}#grading`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Încearcă din nou' }));
    expect(api.retryExerciseList).toHaveBeenCalledWith('6E2-26T1', 'class');
    await waitFor(() => expect(screen.queryByText(failed)).not.toBeInTheDocument());
    expect(screen.getAllByText(NOT_STARTED)).toHaveLength(1);
  });

  it.each([
    // The print PDF is ready: a print PDF that waits would be robot work on an open test.
    ['open', /^Corectarea pornește automat la/, { evaluationAt: '2026-10-20T07:15:00.000Z', print: { status: 'ready', fromWord: false } }],
    ['done', /^Corectarea s-a terminat$/, {}],
  ] as const)('says nothing about a robot start on a test that is %s', async (status, line, overrides) => {
    renderAdmin(`${PAGE}#grading`, failedStartApi({ status, ...overrides }));
    expect(await screen.findByText(line)).toBeInTheDocument();
    expect(screen.queryByText(NOT_STARTED)).not.toBeInTheDocument();
  });

  it('starts the robot again when grading is late and work waits', async () => {
    const api = evaluationApi({ status: 'evaluating' });
    renderAdmin(`${PAGE}#grading`, api);
    expect(await screen.findByText('Corectarea poate întârzia.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pornește robotul' }));
    expect(api.startRobot).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByRole('status')).toHaveTextContent(robotStartMessage('next_check'));
  });

  it('says why the robot did not start', async () => {
    const api = evaluationApi({ status: 'evaluating' });
    api.startRobot.mockRejectedValueOnce(new ApiError(409, 'no_work', 'Nicio lucrare a acestui test nu așteaptă robotul.'));
    renderAdmin(`${PAGE}#grading`, api);
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
    renderAdmin(`${PAGE}#grading`, evaluationApi(overrides, rows, lastCheckAt));
    expect(await screen.findByText(/^Robotul (nu )?a verificat/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pornește robotul' }) !== null).toBe(shown);
  });

  it('says in Corectare that the robot writes the class analysis, and links to the class report in Rezultate', async () => {
    renderAdmin(`${PAGE}#grading`, evaluationApi({ status: 'evaluating', analysis: { status: 'requested', stale: false, attempts: 0 } }, graded));
    expect(await screen.findByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).toBeInTheDocument();
    await openStage('Rezultate');
    expect(screen.getByRole('link', { name: 'Deschide raportul' })).toHaveAttribute('href', '/tests/6E2-26T1/report');
  });

  it('says that the last attempt failed instead of saying that the robot writes, after a failed attempt', async () => {
    renderAdmin(`${PAGE}#grading`, evaluationApi({ status: 'evaluating', analysis: { status: 'requested', stale: false, attempts: 1 } }, graded));
    expect(
      await screen.findByText('Ultima încercare a eșuat. Robotul va încerca din nou la următoarea rulare.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).not.toBeInTheDocument();
  });

  it('does not say that the work is graded while an upload still waits', async () => {
    const mixed = [...graded, fakeUpload({ studentId: 11, studentName: 'Avram Dan', submissionId: 6, status: 'submitted', fileCount: 1 })];
    renderAdmin(
      `${PAGE}#grading`,
      evaluationApi({ status: 'evaluating', gradedCount: 1, analysis: { status: 'requested', stale: false, attempts: 0 } }, mixed),
    );
    expect(await screen.findByText(/^Se corectează: /)).toBeInTheDocument();
    expect(screen.queryByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).not.toBeInTheDocument();
    await openStage('Rezultate');
    expect(screen.getByRole('link', { name: 'Deschide raportul' })).toBeInTheDocument();
  });

  it('shows the link to the class report only when something is graded', async () => {
    renderAdmin(`${PAGE}#results`, evaluationApi({ status: 'evaluating' }, leftInGrading));
    expect(await screen.findByRole('heading', { level: 2, name: 'Rezultate' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Deschide raportul' })).not.toBeInTheDocument();
    await openStage('Corectare');
    expect(await screen.findByText(/^Robotul (nu )?a verificat/)).toBeInTheDocument();
    expect(screen.queryByText('Lucrările sunt corectate. Robotul scrie acum analiza clasei.')).not.toBeInTheDocument();
  });

  it('puts the class report in Rezultate once a result is graded, as its main button', async () => {
    renderAdmin(PAGE, evaluationApi({ status: 'done' }, graded));
    const panel = await screen.findByRole('region', { name: 'Rezultate' });
    const link = within(panel).getByRole('link', { name: 'Deschide raportul' });
    expect(link).toHaveAttribute('href', '/tests/6E2-26T1/report');
    expect(link).toHaveClass('button');
    expect(link).not.toHaveClass('button-quiet');
    expect(screen.getAllByRole('link', { name: 'Deschide raportul' })).toHaveLength(1);
  });

  it('has no bar to a next stage in Rezultate, the last stage', async () => {
    renderAdmin(`${PAGE}#results`, evaluationApi({ status: 'done' }, graded));
    expect(await screen.findByRole('heading', { level: 2, name: 'Rezultate' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Etapa următoare' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Mergi la / })).not.toBeInTheDocument();
  });

  it('has no report button before any grading', async () => {
    renderAdmin(`${PAGE}#results`, evaluationApi({ status: 'evaluating' }, leftInGrading));
    expect(await screen.findByRole('heading', { level: 2, name: 'Rezultate' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Deschide raportul' })).not.toBeInTheDocument();
  });

  it('says when the class analysis failed', async () => {
    renderAdmin(`${PAGE}#grading`, evaluationApi({ status: 'done', analysis: { status: 'failed', stale: false, attempts: 0 } }, graded));
    expect(await screen.findByText('Robotul nu a putut scrie analiza clasei.')).toBeInTheDocument();
    await openStage('Rezultate');
    expect(screen.getByRole('link', { name: 'Deschide raportul' })).toBeInTheDocument();
  });
});
