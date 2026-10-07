import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
