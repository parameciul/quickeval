import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api.ts';
import { PDF_TYPE } from '../../../shared/files.ts';
import { unsupportedMessage } from '../../../shared/subjects.ts';
import { robotStartMessage } from '../../ui/format.ts';
import { createFakeApi, FAKE_MULTI_TOKEN, FAKE_TOKEN, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { notSent, apiWith, PAGE, sheet, openActions, chooseAction, actionNames } from './testPageTestKit.tsx';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('TestPage subject', () => {
  const dialog = () => screen.getByRole('dialog');
  const subjects = () => within(dialog()).getByRole('group', { name: 'Materia testului' });

  it('shows in Fișa testului that the robot finds the subject, and the teacher can choose it in "Acțiuni"', async () => {
    const api = apiWith();
    renderAdmin(PAGE, api);
    expect(await within(await screen.findByRole('region', { name: 'Fișa testului' })).findByText('Se stabilește la corectare')).toBeInTheDocument();
    await chooseAction('Alege materia');
    expect(dialog()).toHaveAccessibleName('Alege materia');
    expect(within(subjects()).getAllByRole('radio').map((radio) => radio.closest('label')!.textContent)).toEqual([
      'Matematică',
      'Fizică',
      'Chimie',
      'Biologie',
      'Științe',
      'Limba română',
      'Limba engleză',
    ]);
    expect(within(dialog()).getByRole('button', { name: 'Salvează' })).toBeDisabled();
    // A draft has no exercise list: nothing is graded again.
    await userEvent.click(within(subjects()).getByRole('radio', { name: 'Fizică' }));
    expect(within(dialog()).queryByText(/se corectează din nou/)).not.toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Salvează' }));
    expect(api.setSubject).toHaveBeenCalledWith('6E2-26T1', 'fizica');
    expect(await within(sheet()).findByText('Fizică')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await actionNames()).toContain('Schimbă materia');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says that a finished test is graded again with a new subject, and that the robot starts', async () => {
    const api = apiWith({
      status: 'done',
      exerciseList: { status: 'ready', message: null },
      subject: { value: 'matematica', name: '', by: 'robot' },
    });
    renderAdmin(PAGE, api);
    const menu = await openActions();
    expect(within(menu).getByRole('menuitem', { name: 'Schimbă materia' })).toHaveAccessibleDescription(
      'Lista de exerciții se face din nou, iar lucrările corectate se corectează din nou.',
    );
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Schimbă materia' }));
    expect(within(subjects()).getByRole('radio', { name: 'Matematică' })).toBeChecked();
    expect(within(dialog()).queryByText(/se corectează din nou/)).not.toBeInTheDocument();
    await userEvent.click(within(subjects()).getByRole('radio', { name: 'Fizică' }));
    expect(within(dialog()).getByText('Lista de exerciții se face din nou, iar lucrările corectate se corectează din nou.')).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Salvează' }));
    expect(await screen.findByRole('status')).toHaveTextContent(robotStartMessage('next_check'));
    expect(await within(sheet()).findByText('Fizică')).toBeInTheDocument();
  });

  it('says that a reopened test is graded again with a new subject at its next start', async () => {
    const api = apiWith({ status: 'open', exerciseList: { status: 'ready', message: null }, subject: { value: 'matematica', name: '', by: 'robot' } });
    renderAdmin(PAGE, api);
    await chooseAction('Schimbă materia');
    await userEvent.click(within(subjects()).getByRole('radio', { name: 'Fizică' }));
    expect(within(dialog()).getByText('Lista de exerciții se face din nou, iar lucrările corectate se corectează din nou.')).toBeInTheDocument();
  });

  it('offers no change of subject while the robot grades the test, and says when it can change', async () => {
    const api = apiWith({ status: 'evaluating', exerciseList: { status: 'ready', message: null }, subject: { value: 'matematica', name: '', by: 'robot' } });
    renderAdmin(PAGE, api);
    expect(await within(await screen.findByRole('region', { name: 'Fișa testului' })).findByText('Matematică')).toBeInTheDocument();
    const item = within(await openActions()).getByRole('menuitem', { name: 'Schimbă materia' });
    expect(item).toBeDisabled();
    expect(item).toHaveAccessibleDescription('Poți schimba materia după ce se termină corectarea.');
  });

  it('says what a new subject does before the exercise list exists', async () => {
    renderAdmin(PAGE, apiWith({ subject: { value: 'matematica', name: '', by: 'teacher' } }));
    expect(within(await openActions()).getByRole('menuitem', { name: 'Schimbă materia' })).toHaveAccessibleDescription(
      'Robotul corectează testul după materia aleasă.',
    );
  });

  it('keeps the form open with the reason when the subject cannot change now', async () => {
    const api = apiWith({ subject: { value: 'matematica', name: '', by: 'teacher' } });
    api.setSubject.mockRejectedValueOnce(new ApiError(409, 'barem_generating', 'Baremul se generează acum. Poți schimba materia după ce este gata.'));
    renderAdmin(PAGE, api);
    await chooseAction('Schimbă materia');
    await userEvent.click(within(subjects()).getByRole('radio', { name: 'Chimie' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Salvează' }));
    expect(await within(dialog()).findByText('Baremul se generează acum. Poți schimba materia după ce este gata.')).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Renunță' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(sheet()).getByText('Matematică')).toBeInTheDocument();
  });

  it('says in Pregătire that a subject the generated barem found is not graded, and the teacher changes it there', async () => {
    const api = apiWith({ subject: { value: 'alta', name: 'istorie', by: 'robot' } });
    renderAdmin(`${PAGE}#prepare`, api);
    const panel = await screen.findByRole('region', { name: 'Pregătire' });
    expect(within(panel).getByText(unsupportedMessage('istorie'))).toBeInTheDocument();
    expect(within(sheet()).getByText('istorie (nu o corectăm)')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Schimbă materia' }));
    // No subject is chosen yet: the robot's guess is not one of the list.
    expect(within(panel).getAllByRole('radio').filter((radio) => (radio as HTMLInputElement).checked)).toEqual([]);
    await userEvent.click(within(panel).getByRole('radio', { name: 'Limba română' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Salvează' }));
    expect(api.setSubject).toHaveBeenCalledWith('6E2-26T1', 'romana');
    await waitFor(() => expect(within(panel).queryByText(unsupportedMessage('istorie'))).not.toBeInTheDocument());
    expect(within(sheet()).getByText('Limba română')).toBeInTheDocument();
  });
});

describe('TestPage uploads switch', () => {
  const FILES = { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: { name: 'Barem.pdf', type: PDF_TYPE } };

  // Pop Ion sent his paper, Stan Eva is still sending hers, Marin Dan sent nothing.
  const rows = () => [
    fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 3 }),
    fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1 }),
    fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
  ];

  function switchApi(overrides: Parameters<typeof fakeTest>[0] = {}) {
    return createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, files: FILES, print: { status: 'ready', fromWord: false }, ...overrides }, rows())],
    });
  }

  it('closes the uploads at the end of the hour without grading, and opens them again', async () => {
    const api = switchApi();
    renderAdmin(`${PAGE}#in-class`, api);
    const toggle = await screen.findByRole('switch', { name: /^Încărcarea lucrărilor/ });
    expect(toggle).toBeChecked();
    expect(screen.getByText('Încărcarea e deschisă.')).toBeInTheDocument();
    expect(screen.getByText('1 din 3 elevi a trimis lucrarea')).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(api.setUploadsClosed).toHaveBeenCalledWith('6E2-26T1', true);
    expect(await screen.findByText('Încărcarea e închisă.')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /^Încărcarea lucrărilor/ })).not.toBeChecked();
    // No links while closed, and nothing went to the robot.
    expect(screen.queryByRole('button', { name: 'Copiază linkul' })).not.toBeInTheDocument();
    expect(screen.getByText(/linkurile nu primesc lucrări până o redeschizi/)).toBeInTheDocument();
    expect(within(sheet()).getByText('Încărcare închisă')).toBeInTheDocument();
    expect(api.evaluateTest).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('switch', { name: /^Încărcarea lucrărilor/ }));
    expect(api.setUploadsClosed).toHaveBeenLastCalledWith('6E2-26T1', false);
    expect(await screen.findByText('Încărcarea e deschisă.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiază linkul' })).toBeInTheDocument();
  });

  it('says on Corectare that the start closes the uploads, and only starts the grading once they are closed', async () => {
    const api = switchApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#grading`, api);
    expect(await screen.findByText(/Când pornești corectarea, se închide singură\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Închide încărcarea și pornește corectarea' })).toBeInTheDocument();
    // One number for the waiting papers, here and in the list of stages.
    expect(screen.getByText('1 lucrare așteaptă corectarea')).toBeInTheDocument();
    const stages = screen.getByRole('navigation', { name: 'Etapele testului' });
    expect(within(stages).getByRole('link', { name: /^Corectare / })).toHaveTextContent('1 lucrare așteaptă');
    expect(screen.getByText(/^Încă 1 elev își încarcă lucrarea/)).toBeInTheDocument();
    expect(screen.getByText(/^Se corectează 2 lucrări, bifate în tabel\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: /^Încărcarea lucrărilor/ }));
    const start = await screen.findByRole('button', { name: 'Pornește corectarea' });
    expect(screen.queryByText(/se închide singură/)).not.toBeInTheDocument();
    await userEvent.click(start);
    expect(window.confirm).toHaveBeenLastCalledWith('Pornești corectarea pentru 2 lucrări? Lucrările neselectate cu fișiere așteaptă o corectare ulterioară.');
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', undefined, [5, 6]);
  });

  it('gives the focus to the panel when the uploads close while the QR code is on the whole screen', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const detail = fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, studentCount: 3 }, notSent());
    const api = createFakeApi({ classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }], students: {}, tests: [detail] });
    renderAdmin(`${PAGE}#in-class`, api);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Arată codul QR' }))[0]!);
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Linkul testului pentru elevi' })).getByRole('button', { name: 'Pe tot ecranul' }));
    await screen.findByRole('dialog', { name: 'Codul QR pentru elevi' });
    detail.test.status = 'evaluating';
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Codul QR pentru elevi' })).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 2, name: 'În clasă' })).toHaveFocus();
    vi.useRealTimers();
  });

  it('shows no switch once the grading started, and offers to open the uploads again', async () => {
    renderAdmin(`${PAGE}#grading`, switchApi({ status: 'evaluating', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }));
    expect(
      await screen.findByText('Elevii nu mai pot trimite. 2 elevi nu au trimis. Redeschide dacă mai vrei lucrările lor. Notele date nu se schimbă.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Dacă redeschizi acum, lucrările care nu sunt gata așteaptă din nou/)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redeschide încărcarea' })).toBeInTheDocument();
  });

  it('says only that everyone sent once the uploads closed after the whole class sent', async () => {
    const all = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 })];
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 1 }],
      students: {},
      tests: [fakeTest({ status: 'done', uploadToken: FAKE_TOKEN, files: FILES, evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, all)],
    });
    renderAdmin(`${PAGE}#in-class`, api);
    expect(await screen.findByText('Au trimis toți elevii.')).toBeInTheDocument();
    expect(screen.queryByText(/Elevii nu mai pot trimite/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dacă redeschizi acum/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redeschide încărcarea' })).toBeInTheDocument();
  });

  it('keeps the focus on the switch and names it with the word it shows', async () => {
    renderAdmin(`${PAGE}#in-class`, switchApi());
    const toggle = await screen.findByRole('switch', { name: /^Încărcarea lucrărilor:\s*Deschisă$/ });
    await userEvent.click(toggle);
    expect(await screen.findByRole('switch', { name: /^Încărcarea lucrărilor:\s*Închisă$/ })).toHaveFocus();
  });

  it('says on a closed test with no paper yet that the papers come after a reopen, and why a half-sent paper waits', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, uploadsClosedAt: '2026-10-06T08:05:00.000Z' }, notSent())],
    });
    const view = renderAdmin(`${PAGE}#in-class`, api);
    expect(await screen.findByText('Încărcarea e închisă. Lucrările apar aici după ce o redeschizi și elevii trimit pozele.')).toBeInTheDocument();
    view.unmount();
    renderAdmin(`${PAGE}#in-class`, switchApi({ uploadsClosedAt: '2026-10-06T08:05:00.000Z' }));
    const stan = (await screen.findByRole('rowheader', { name: 'Stan Eva' })).closest('tr')!;
    expect(within(stan).getByText(/iar încărcarea e închisă/)).toBeInTheDocument();
  });

  it('makes the teacher link once when both of its buttons are pressed at once', async () => {
    const api = switchApi();
    let answer: (token: string) => void = () => undefined;
    api.createMultiUploadLink.mockImplementationOnce(() => new Promise<string>((resolve) => (answer = resolve)));
    renderAdmin(`${PAGE}#in-class`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Copiază linkul tău' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Arată codul QR' })[1]!);
    await act(async () => answer(FAKE_MULTI_TOKEN));
    expect(await screen.findByRole('dialog', { name: 'Linkul tău pentru mai multe lucrări' })).toBeInTheDocument();
    expect(api.createMultiUploadLink).toHaveBeenCalledTimes(1);
  });

  it('says why the switch was refused', async () => {
    const api = switchApi();
    api.setUploadsClosed.mockRejectedValueOnce(new ApiError(409, 'closed', 'Corectarea a pornit, așa că încărcarea e deja închisă. O poți redeschide.'));
    renderAdmin(`${PAGE}#in-class`, api);
    await userEvent.click(await screen.findByRole('switch', { name: /^Încărcarea lucrărilor/ }));
    expect(await screen.findByText('Corectarea a pornit, așa că încărcarea e deja închisă. O poți redeschide.')).toBeInTheDocument();
  });
});
