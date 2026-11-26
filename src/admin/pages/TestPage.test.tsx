import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api.ts';
import { PDF_TYPE } from '../../../shared/files.ts';
import { robotStartMessage } from '../../ui/format.ts';
import { createFakeApi, FAKE_MULTI_TOKEN, FAKE_TOKEN, fakeTeacher, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
import { uploads, notSent, apiWith, PAGE, openStage, sheet, fact, openActions, chooseAction, actionNames, chooseInRow } from './testPageTestKit.tsx';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('TestPage', () => {
  it('shows the path, the title, its students and its start, and the code and state in Fișa testului', async () => {
    renderAdmin(PAGE, apiWith({ status: 'open', uploadToken: FAKE_TOKEN, startedAt: '2026-10-06T07:15:00.000Z' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Fracții' })).toBeInTheDocument();
    const path = screen.getByRole('navigation', { name: 'Unde ești' });
    expect(within(path).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Teste', 'Clasa 6E2', 'Fracții']);
    expect(within(path).getByRole('link', { name: 'Teste' })).toHaveAttribute('href', '/');
    expect(within(path).getByRole('link', { name: 'Clasa 6E2' })).toHaveAttribute('href', '/classes/1');
    expect(within(path).getByText('Fracții')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: /^←/ })).not.toBeInTheDocument();
    expect(screen.getByText('3 elevi · început 6 oct. 2026, 10:15')).toBeInTheDocument();
    expect(within(sheet()).getByText('6E2-26T1')).toBeInTheDocument();
    expect(within(sheet()).getByText('Deschis')).toBeInTheDocument();
  });

  it('reads the code in any letter case and refuses something else', async () => {
    renderAdmin('/tests/6e2-26t1', apiWith());
    expect(await screen.findByRole('heading', { level: 1, name: 'Fracții' })).toBeInTheDocument();
  });

  it('shows the not-found page for a path that is not a test code', async () => {
    renderAdmin('/tests/abc', apiWith());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('starts a draft test, and its link stays in În clasă', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}#in-class`, api);
    const panel = await screen.findByRole('region', { name: 'În clasă' });
    expect(within(panel).getByText('Testul nu a început')).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { level: 3, name: 'Cum vor trimite elevii lucrarea' })).toBeInTheDocument();
    expect(within(panel).getByText('Pentru un elev fără foaie. Linkul merge după ce începi testul.')).toBeInTheDocument();
    // No address on the page: a copy and a QR code in a window.
    expect(within(panel).queryByText(`${window.location.origin}/u/${FAKE_TOKEN}`)).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Copiază linkul tău' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Începe testul' }));
    expect(api.startTest).toHaveBeenCalledWith('6E2-26T1');
    expect(await within(panel).findByText('Încărcarea e deschisă.')).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { level: 3, name: 'Cum trimit elevii lucrarea' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Copiază linkul' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Copiază linkul tău' })).toBeInTheDocument();
    expect(within(panel).getAllByRole('button', { name: 'Arată codul QR' })).toHaveLength(2);
    expect(within(sheet()).queryByRole('button', { name: 'Copiază linkul' })).not.toBeInTheDocument();
  });

  it('shows the students link only while the test is a draft or open', async () => {
    for (const status of ['draft', 'open'] as const) {
      const view = renderAdmin(`${PAGE}#in-class`, apiWith({ status }));
      expect(await screen.findByRole('button', { name: 'Copiază linkul' })).toBeInTheDocument();
      view.unmount();
    }
    for (const status of ['evaluating', 'done'] as const) {
      const view = renderAdmin(`${PAGE}#in-class`, apiWith({ status }));
      await screen.findByRole('region', { name: 'În clasă' });
      expect(screen.queryByRole('button', { name: 'Copiază linkul' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Arată codul QR' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Redeschide încărcarea' })).toBeInTheDocument();
      view.unmount();
    }
  });

  it('shows no students link in a draft made before tests got their link', async () => {
    renderAdmin(`${PAGE}#in-class`, apiWith({ uploadToken: null }));
    await screen.findByRole('region', { name: 'În clasă' });
    expect(screen.queryByRole('button', { name: 'Copiază linkul' })).not.toBeInTheDocument();
  });

  it('shows the print block on a draft and an open test, and once the uploads closed only a PDF made before', async () => {
    const { unmount } = renderAdmin(`${PAGE}#print`, apiWith());
    await screen.findByRole('heading', { level: 2, name: 'Tipărire' });
    expect(screen.getByRole('region', { name: 'Testul cu cod QR' })).toBeInTheDocument();
    unmount();
    const open = renderAdmin(`${PAGE}#print`, apiWith({ status: 'open' }));
    await screen.findByRole('heading', { level: 2, name: 'Tipărire' });
    expect(screen.getByRole('region', { name: 'Testul cu cod QR' })).toBeInTheDocument();
    open.unmount();
    renderAdmin(`${PAGE}#print`, apiWith({ status: 'evaluating' }));
    expect(await screen.findByText('Testul s-a dat în clasă')).toHaveClass('now-title', 'is-done');
    expect(screen.queryByRole('region', { name: 'Testul cu cod QR' })).not.toBeInTheDocument();
  });

  it('lets the teacher download the test with the QR code before she starts it', async () => {
    renderAdmin(
      `${PAGE}#print`,
      apiWith({ files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null }, print: { status: 'ready', fromWord: false } }),
    );
    expect(await screen.findByRole('link', { name: 'Descarcă PDF' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/print');
    expect(screen.getByRole('button', { name: 'Tipărește' })).toBeInTheDocument();
    expect(screen.getByText('Poți tipări testul de acum. Elevii încarcă lucrările după ce începi testul.')).toBeInTheDocument();
    expect(within(sheet()).queryByRole('link')).not.toBeInTheDocument();
    await openStage('În clasă');
    expect(screen.getByText(/Începe testul în ziua testului/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Începe testul' })).toBeInTheDocument();
  });

  it('starts no robot at Start when the print PDF is made already', async () => {
    const api = apiWith({ files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null }, print: { status: 'ready', fromWord: false } });
    renderAdmin(`${PAGE}#in-class`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Începe testul' }));
    expect(await screen.findByText('Deschis')).toBeInTheDocument();
    expect(screen.queryByText(robotStartMessage('dispatched'))).not.toBeInTheDocument();
  });

  it('says the robot started after Start test when the print PDF still waits', async () => {
    renderAdmin(`${PAGE}#in-class`, apiWith({ files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null } }));
    await userEvent.click(await screen.findByRole('button', { name: 'Începe testul' }));
    expect(await screen.findByText(robotStartMessage('dispatched'))).toBeInTheDocument();
  });

  it('gives an old draft its link with its test file, so its QR test is made without another click', async () => {
    const api = apiWith({ uploadToken: null });
    renderAdmin(`${PAGE}#print`, api);
    expect(await screen.findByText('Încarcă testul ca să primești varianta cu cod QR.')).toBeInTheDocument();
    await openStage('Pregătire');
    const file = new File(['%PDF-1.7'], 'Test.pdf', { type: PDF_TYPE });
    await userEvent.upload(screen.getByLabelText(/^Fișierul testului/), file);
    expect(await screen.findByRole('link', { name: 'Test.pdf' })).toBeInTheDocument();
    await openStage('Tipărire');
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pregătește testul cu cod QR' })).not.toBeInTheDocument();
  });

  it('says the robot started after Start test of a draft made before tests got their link', async () => {
    renderAdmin(`${PAGE}#in-class`, apiWith({ uploadToken: null, files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null } }));
    await userEvent.click(await screen.findByRole('button', { name: 'Începe testul' }));
    expect(await screen.findByText(robotStartMessage('dispatched'))).toBeInTheDocument();
  });

  it('prepares the test with the QR code of a draft made before tests got their link', async () => {
    const api = apiWith({ uploadToken: null, files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null } });
    renderAdmin(`${PAGE}#print`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Pregătește testul cu cod QR' }));
    expect(api.retryPrint).toHaveBeenCalledWith('6E2-26T1', 'class');
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toBeInTheDocument();
    expect(screen.getByText(robotStartMessage('dispatched'))).toBeInTheDocument();
  });

  it('copies the link', async () => {
    const user = userEvent.setup();
    renderAdmin(`${PAGE}#in-class`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    await user.click(await screen.findByRole('button', { name: 'Copiază linkul' }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(screen.getByRole('status')).toHaveTextContent('Copiat!');
  });

  it('shows the QR code on the whole screen and closes it with Escape', async () => {
    renderAdmin(`${PAGE}#in-class`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    const show = (await screen.findAllByRole('button', { name: 'Arată codul QR' }))[0]!;
    await userEvent.click(show);
    const window_ = screen.getByRole('dialog', { name: 'Linkul testului pentru elevi' });
    expect(within(window_).getByText(`${window.location.origin}/u/${FAKE_TOKEN}`)).toBeInTheDocument();
    expect(within(window_).getByTitle('Codul QR al linkului')).toBeInTheDocument();
    await userEvent.click(within(window_).getByRole('button', { name: 'Pe tot ecranul' }));
    const dialog = screen.getByRole('dialog', { name: 'Codul QR pentru elevi' });
    expect(within(dialog).getByText(`${window.location.origin}/u/${FAKE_TOKEN}`)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Închide' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(show).toHaveFocus();
  });

  it('uploads the test file and links to it', async () => {
    const api = apiWith();
    renderAdmin(PAGE, api);
    const file = new File(['%PDF-1.7'], 'Test.pdf', { type: PDF_TYPE });
    await userEvent.upload(await screen.findByLabelText(/^Fișierul testului/), file);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'test', file, 'class');
    expect(await screen.findByRole('link', { name: 'Test.pdf' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/files/test');
    expect(screen.getByLabelText('Înlocuiește testul')).toBeInTheDocument();
    expect(within(sheet()).queryByRole('link')).not.toBeInTheDocument();
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
    renderAdmin(`${PAGE}#prepare`, apiWith({ status: 'evaluating' }));
    expect(await screen.findByLabelText(/^Fișierul baremului/)).toBeDisabled();
    expect(screen.getByLabelText('Indicații suplimentare pentru corectare')).toBeDisabled();
  });

  it('says no paper came yet while the test is open and nothing was uploaded, with the QR code on the whole screen', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, submittedCount: 0, studentCount: 3 }, notSent())],
    });
    renderAdmin(`${PAGE}#in-class`, api);
    expect(await screen.findByRole('heading', { level: 3, name: 'Nicio lucrare trimisă încă' })).toBeInTheDocument();
    expect(
      screen.getByText('Elevii scanează codul QR de pe test și trimit pozele. Lucrările apar aici pe măsură ce vin.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Încărcările elevilor' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Oprește testul' })).toBeInTheDocument();
    const show = within(screen.getByRole('region', { name: 'În clasă' })).getAllByRole('button', { name: 'Arată codul QR' })[0]!;
    await userEvent.click(show);
    const window_ = await screen.findByRole('dialog', { name: 'Linkul testului pentru elevi' });
    await userEvent.keyboard('{Escape}');
    expect(window_).not.toBeInTheDocument();
    expect(show).toHaveFocus();
    await userEvent.click(show);
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Linkul testului pentru elevi' })).getByRole('button', { name: 'Pe tot ecranul' }));
    const dialog = await screen.findByRole('dialog', { name: 'Codul QR pentru elevi' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Închide' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(show).toHaveFocus();
  });

  it('keeps the QR code on the whole screen when the first paper arrives', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const detail = fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, studentCount: 3 }, notSent());
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [detail],
    });
    renderAdmin(`${PAGE}#in-class`, api);
    await screen.findByRole('heading', { name: 'Nicio lucrare trimisă încă' });
    const show = screen.getAllByRole('button', { name: 'Arată codul QR' })[0]!;
    await userEvent.click(show);
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Linkul testului pentru elevi' })).getByRole('button', { name: 'Pe tot ecranul' }));
    expect(await screen.findByRole('dialog', { name: 'Codul QR pentru elevi' })).toBeInTheDocument();
    detail.uploads[1] = fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1 });
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(await screen.findByRole('table', { name: 'Încărcările elevilor' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Codul QR pentru elevi' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Închide' }));
    expect(show).toHaveFocus();
    vi.useRealTimers();
  });


  it('copies the teacher link, made on its first copy, and shows its QR code', async () => {
    const user = userEvent.setup();
    const api = apiWith({ status: 'open', uploadToken: FAKE_TOKEN });
    renderAdmin(`${PAGE}#in-class`, api);
    await user.click(await screen.findByRole('button', { name: 'Copiază linkul tău' }));
    expect(api.createMultiUploadLink).toHaveBeenCalledWith('6E2-26T1');
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/u/${FAKE_MULTI_TOKEN}`);
    expect(await screen.findByText('Linkul tău a fost creat și copiat.')).toBeInTheDocument();
    const qr = screen.getAllByRole('button', { name: 'Arată codul QR' })[1]!;
    await user.click(qr);
    const window_ = await screen.findByRole('dialog', { name: 'Linkul tău pentru mai multe lucrări' });
    expect(within(window_).getByText(`${window.location.origin}/u/${FAKE_MULTI_TOKEN}`)).toBeInTheDocument();
    expect(within(window_).queryByRole('button', { name: 'Pe tot ecranul' })).not.toBeInTheDocument();
    expect(api.createMultiUploadLink).toHaveBeenCalledTimes(1);
  });
  it('lists a student who started an upload with no file yet, so the teacher can reset it', async () => {
    const rows = [notSent()[0]!, fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 0 }), notSent()[2]!];
    renderAdmin(
      `${PAGE}#in-class`,
      createFakeApi({
        classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
        students: {},
        tests: [fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, studentCount: 3 }, rows)],
      }),
    );
    expect(await screen.findByRole('rowheader', { name: 'Stan Eva' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nicio lucrare trimisă încă' })).not.toBeInTheDocument();
  });

  it('lists the papers as soon as one student uploaded a file, and once the uploads are closed', async () => {
    const one = [notSent()[0]!, uploads[1]!, notSent()[2]!];
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, submittedCount: 0, studentCount: 3 }, one)],
    });
    const first = renderAdmin(`${PAGE}#in-class`, api);
    expect(await screen.findByRole('table', { name: 'Încărcările elevilor' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nicio lucrare trimisă încă' })).not.toBeInTheDocument();
    first.unmount();
    renderAdmin(
      `${PAGE}#in-class`,
      createFakeApi({
        classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
        students: {},
        tests: [fakeTest({ status: 'done', submittedCount: 0, studentCount: 3 }, notSent())],
      }),
    );
    expect(await screen.findByRole('table', { name: 'Încărcările elevilor' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nicio lucrare trimisă încă' })).not.toBeInTheDocument();
  });

  it('shows no papers label in Corectare before the test starts', async () => {
    renderAdmin(`${PAGE}#grading`, apiWith({ status: 'draft' }));
    const papers = await screen.findByRole('region', { name: 'Elevii' });
    expect(papers.querySelector('.stage-section-meta')).toBeNull();
  });

  it('lists the uploads of the students', async () => {
    renderAdmin(`${PAGE}#in-class`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN, submittedCount: 1, studentCount: 3 }));
    const papers = await screen.findByRole('region', { name: 'Elevii' });
    expect(within(papers).getByText('1 așteaptă corectarea · 1 încarcă acum · 1 încă nu a trimis', { selector: '.tag' })).not.toHaveClass('tag-ok');
    // "Lucrările" of Fișa testului waits for the uploads to close.
    expect(within(sheet()).queryByText('Lucrările')).not.toBeInTheDocument();
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    expect(within(pop).getByText('Trimis')).toBeInTheDocument();
    expect(within(pop).getByText('Fără confirmare')).toBeInTheDocument();
    expect(within(pop).getByText('6 oct. 2026, 10:40')).toBeInTheDocument();
    // The name opens the paper; there is no other link to it.
    expect(within(pop).getByRole('link', { name: 'Pop Ion' })).toHaveAttribute('href', '/tests/6E2-26T1/papers/5');
    expect(within(pop).queryByRole('link', { name: 'Vezi lucrarea' })).not.toBeInTheDocument();
    const marin = screen.getByRole('rowheader', { name: 'Marin Dan' }).closest('tr')!;
    // A student with no paper has a plain name.
    expect(within(marin).queryByRole('link')).not.toBeInTheDocument();
    expect(within(marin).getByText('Nu a trimis')).toBeInTheDocument();
    expect(within(marin).queryByRole('button', { name: 'Mai multe pentru Marin Dan' })).not.toBeInTheDocument();
  });

  it('names a held-back paper and an upload with no file as the papers bar does, once the uploads are closed', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 2, startedAt: '2026-10-06T07:25:00.000Z' }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan', submissionId: 7, status: 'uploading', fileCount: 0, startedAt: '2026-10-06T07:26:00.000Z' }),
    ];
    renderAdmin(`${PAGE}#grading`, createFakeApi({ classes: [], students: {}, tests: [fakeTest({ status: 'done' }, rows)] }));
    const stan = (await screen.findByRole('rowheader', { name: 'Stan Eva' })).closest('tr')!;
    expect(within(stan).getByText('Așteaptă corectarea')).toBeInTheDocument();
    expect(within(stan).getByText('Lucrarea nu a fost trimisă la corectare. Redeschide încărcarea și pornește evaluarea pentru ea.')).toBeInTheDocument();
    expect(within(stan).queryByText('Deschis, cu fișiere')).not.toBeInTheDocument();
    const marin = screen.getByRole('rowheader', { name: 'Marin Dan' }).closest('tr')!;
    expect(within(marin).getByText('Nu a participat')).toBeInTheDocument();
    expect(within(marin).queryByText(/Elevul a ales numele/)).not.toBeInTheDocument();
  });

  it('tells a demo account with no paper left why a held-back paper waits', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 2, startedAt: '2026-10-06T07:25:00.000Z' }),
    ];
    const me = fakeTeacher({ role: 'teacher', demo: true, testsEvaluated: 1, papersGraded: 35 });
    renderAdmin(`${PAGE}#grading`, createFakeApi({ classes: [], students: {}, me, tests: [fakeTest({ status: 'done' }, rows)] }));
    const stan = (await screen.findByRole('rowheader', { name: 'Stan Eva' })).closest('tr')!;
    expect(await within(stan).findByText('Lucrarea nu a fost trimisă la corectare: contul demo nu mai are lucrări de corectat. Cere unui administrator un cont complet.')).toBeInTheDocument();
    expect(within(stan).queryByText(/Redeschide încărcarea/)).not.toBeInTheDocument();
  });

  it('names where the papers are beside "Elevii" and in Fișa testului, with no bar over the table', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 2 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
    ];
    renderAdmin(`${PAGE}#grading`, createFakeApi({ classes: [], students: {}, tests: [fakeTest({ status: 'done', studentCount: 3 }, rows)] }));
    const papers = await screen.findByRole('region', { name: 'Elevii' });
    // The students who did not take part are named by the table and Fișa testului, not by the label.
    expect(within(papers).getByText('1 corectată · 1 așteaptă corectarea', { selector: '.tag' })).toBeInTheDocument();
    expect(within(papers).queryByText('toate corectate')).not.toBeInTheDocument();
    expect(within(papers).queryByRole('link', { name: 'Verifică' })).not.toBeInTheDocument();
    expect(document.querySelector('.papers-bar')).toBeNull();
    const facts = within(sheet()).getByText('Lucrările').nextElementSibling!;
    expect([...facts.querySelectorAll('dt')].map((dt) => `${dt.textContent} ${dt.nextElementSibling!.textContent}`)).toEqual([
      'Corectate 1',
      'Așteaptă corectarea 1',
      'Nu au participat 1',
    ]);
  });

  it('says that a student who sent nothing did not take part once the uploads are closed', async () => {
    renderAdmin(`${PAGE}#grading`, apiWith({ status: 'evaluating', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }));
    const marin = (await screen.findByRole('rowheader', { name: 'Marin Dan' })).closest('tr')!;
    expect(within(marin).getByText('Nu a participat')).toBeInTheDocument();
    expect(within(marin).queryByText('Nu a trimis')).not.toBeInTheDocument();
  });

  it('puts checkboxes in the table of Corectare only, while the test is open', async () => {
    const { unmount } = renderAdmin(`${PAGE}#grading`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    const openTable = await screen.findByRole('table', { name: 'Încărcările elevilor' });
    expect(openTable).toHaveClass('uploads', 'is-selectable');
    await openStage('În clasă');
    expect(screen.getByRole('table', { name: 'Încărcările elevilor' })).not.toHaveClass('is-selectable');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    unmount();
    renderAdmin(`${PAGE}#grading`, apiWith({ status: 'done' }));
    const doneTable = await screen.findByRole('table', { name: 'Încărcările elevilor' });
    expect(doneTable).toHaveClass('uploads');
    expect(doneTable).not.toHaveClass('is-selectable');
  });

  it('labels the upload cells with the column names for narrow screens', async () => {
    renderAdmin(`${PAGE}#grading`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    const labels = within(pop)
      .getAllByRole('cell')
      .map((cell) => cell.getAttribute('data-label'));
    expect(labels).toEqual([null, 'Nota', 'Stare', 'Fișiere', 'Ora', 'De verificat', null]);
  });

  it('shows the grades of Corectare in chips of their colour, the points to check in an orange label in words, and nothing in bold', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9, flagCount: 2 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 6.5 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
    ];
    renderAdmin(`${PAGE}#grading`, createFakeApi({ classes: [], students: {}, tests: [fakeTest({ status: 'done' }, rows)] }));
    const table = await screen.findByRole('table', { name: 'Încărcările elevilor' });
    const pop = within(table).getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    expect(within(pop).getByText('9')).toHaveClass('grade-chip', 'points-5');
    // In words, as in Rezultate: a low grade's orange-brown chip and this orange label are both pills.
    expect(pop.querySelector('[data-label="De verificat"] .points-pill')).toHaveTextContent(/^2 de verificat$/);
    const stan = within(table).getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!;
    expect(within(stan).getByText('6,5')).toHaveClass('grade-chip', 'points-3');
    expect(stan.querySelector('[data-label="De verificat"]')).toHaveTextContent('—');
    const marin = within(table).getByRole('rowheader', { name: 'Marin Dan' }).closest('tr')!;
    expect(marin.querySelector('[data-label="Nota"]')).toHaveTextContent('—');
    expect(table.querySelector('strong, b')).toBeNull();
  });

  it('has no Model column unless the setting is on', async () => {
    renderAdmin(`${PAGE}#in-class`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    await screen.findByRole('rowheader', { name: 'Pop Ion' });
    expect(screen.queryByRole('columnheader', { name: 'Model' })).not.toBeInTheDocument();
  });

  it('shows the model and effort of each grading in the row menu when the setting is on', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9, model: 'claude-opus-5-5', effort: 'medium' }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 2, grade: 7, model: 'sonnet', effort: null }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
    ];
    const detail = fakeTest({ status: 'done' }, rows);
    // A done test opens on Rezultate, which has no papers table.
    renderAdmin(`${PAGE}#grading`, createFakeApi({ classes: [], students: {}, tests: [{ ...detail, showModel: true }] }));
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    expect(screen.queryByRole('columnheader', { name: 'Model' })).not.toBeInTheDocument();
    expect(within(pop).queryByText('claude-opus-5-5 · medium')).not.toBeInTheDocument();
    await userEvent.click(within(pop).getByRole('button', { name: 'Mai multe pentru Pop Ion' }));
    expect(within(screen.getByRole('menu')).getByText('Model: claude-opus-5-5 · medium')).toBeInTheDocument();
    expect(screen.getByRole('menu')).toHaveAccessibleDescription('Model: claude-opus-5-5 · medium');
    await userEvent.keyboard('{Escape}');
    const stan = screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!;
    await userEvent.click(within(stan).getByRole('button', { name: 'Mai multe pentru Stan Eva' }));
    expect(within(screen.getByRole('menu')).getByText('Model: sonnet')).toBeInTheDocument();
  });

  it('leaves the model out of the row menu when the setting is off', async () => {
    const rows = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9, model: 'claude-opus-5-5', effort: 'medium' })];
    renderAdmin(`${PAGE}#grading`, createFakeApi({ classes: [], students: {}, tests: [fakeTest({ status: 'done' }, rows)] }));
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    await userEvent.click(within(pop).getByRole('button', { name: 'Mai multe pentru Pop Ion' }));
    expect(within(screen.getByRole('menu')).queryByText(/Model:/)).not.toBeInTheDocument();
  });

  it('sorts the papers by a column, and keeps the order for the next visit', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 6 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 9 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
    ];
    const { unmount } = renderAdmin(`${PAGE}#grading`, createFakeApi({ classes: [], students: {}, tests: [fakeTest({ status: 'done' }, rows)] }));
    const papers = await screen.findByRole('table', { name: 'Încărcările elevilor' });
    const order = () => within(papers).getAllByRole('rowheader').map((cell) => cell.textContent);
    expect(order()).toEqual(['Marin Dan', 'Pop Ion', 'Stan Eva']);
    expect(within(papers).getByRole('columnheader', { name: 'Elev' })).toHaveAttribute('aria-sort', 'ascending');

    await userEvent.click(within(papers).getByRole('button', { name: 'Nota' }));
    expect(order()).toEqual(['Stan Eva', 'Pop Ion', 'Marin Dan']);
    expect(within(papers).getByRole('columnheader', { name: 'Nota' })).toHaveAttribute('aria-sort', 'descending');
    expect(within(papers).getByRole('columnheader', { name: 'Elev' })).not.toHaveAttribute('aria-sort');
    await userEvent.click(within(papers).getByRole('button', { name: 'Nota' }));
    // The student with no grade stays last.
    expect(order()).toEqual(['Pop Ion', 'Stan Eva', 'Marin Dan']);
    expect(localStorage.getItem('quickeval:papersSort')).toBe('grade-asc');

    unmount();
    renderAdmin(`${PAGE}#grading`, createFakeApi({ classes: [], students: {}, tests: [fakeTest({ status: 'done' }, rows)] }));
    const again = await screen.findByRole('table', { name: 'Încărcările elevilor' });
    expect(within(again).getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual(['Pop Ion', 'Stan Eva', 'Marin Dan']);
  });

  it('sorts the students of Rezultate and links each name with a paper', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 6, total: 50, maxTotal: 90 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 9, total: 80, maxTotal: 90, resultsOpen: true }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
    ];
    renderAdmin(`${PAGE}#results`, createFakeApi({ classes: [], students: {}, tests: [fakeTest({ status: 'done' }, rows)] }));
    const links = await screen.findByRole('table', { name: 'Linkurile cu rezultatele elevilor' });
    const order = () => within(links).getAllByRole('rowheader').map((cell) => cell.textContent);
    expect(order()).toEqual(['Marin Dan', 'Pop Ion', 'Stan Eva']);
    expect(within(links).getByRole('link', { name: 'Stan Eva' })).toHaveAttribute('href', '/tests/6E2-26T1/papers/6');
    expect(within(links).queryByRole('link', { name: 'Marin Dan' })).not.toBeInTheDocument();
    await userEvent.click(within(links).getByRole('button', { name: 'Punctaj' }));
    expect(order()).toEqual(['Stan Eva', 'Pop Ion', 'Marin Dan']);
    await userEvent.click(within(links).getByRole('button', { name: 'Stare' }));
    expect(order()).toEqual(['Stan Eva', 'Pop Ion', 'Marin Dan']);
    // The papers table keeps its own order.
    expect(localStorage.getItem('quickeval:resultsSort')).toBe('published-desc');
    expect(localStorage.getItem('quickeval:papersSort')).toBeNull();
  });

  it('keeps the result links and the publish buttons out of the papers table', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9, resultsOpen: true }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
    ];
    renderAdmin(`${PAGE}#grading`, createFakeApi({ classes: [], students: {}, tests: [fakeTest({ status: 'done' }, rows)] }));
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    expect(within(pop).getByText('Publicat')).toBeInTheDocument();
    expect(within(pop).getByRole('link', { name: 'Pop Ion' })).toBeInTheDocument();
    for (const name of ['Link rezultat', 'Copiază linkul', 'Publică', 'Oprește publicarea']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('marks only the selectable rows for the narrow-screen layout', async () => {
    renderAdmin(`${PAGE}#grading`, apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    expect(pop).toHaveClass('has-select');
    const stan = screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!;
    expect(stan).toHaveClass('has-select');
    const marin = screen.getByRole('rowheader', { name: 'Marin Dan' }).closest('tr')!;
    expect(marin).not.toHaveClass('has-select');
  });

  it('unlocks an open upload with files only after the teacher confirms', async () => {
    const api = apiWith({ status: 'open', uploadToken: FAKE_TOKEN });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAdmin(`${PAGE}#in-class`, api);
    const stan = (await screen.findByRole('rowheader', { name: 'Stan Eva' })).closest('tr')!;
    expect(within(stan).getByText('Deschis, cu fișiere')).toBeInTheDocument();
    expect(within(stan).queryByRole('button', { name: 'Mai multe pentru Stan Eva' })).not.toBeInTheDocument();
    await userEvent.click(within(stan).getByRole('button', { name: 'Șterge și deblochează' }));
    expect(api.resetSubmission).not.toHaveBeenCalled();
    await userEvent.click(within(stan).getByRole('button', { name: 'Șterge și deblochează' }));
    expect(confirm).toHaveBeenLastCalledWith('Ștergi cele 1 fișiere ale elevului Stan Eva și deblochezi numele? Elevul poate începe de la capăt.');
    expect(api.resetSubmission).toHaveBeenCalledWith(6, '2026-10-06T07:25:00.000Z');
    expect(await within(stan).findByText('Nu a trimis')).toBeInTheDocument();
  });

  it('shows an open upload with no files as such, with a plain Deblochează button', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [
        fakeTest({ status: 'open', uploadToken: FAKE_TOKEN }, [
          fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 0, startedAt: '2026-10-06T07:25:00.000Z' }),
        ]),
      ],
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#in-class`, api);
    const stan = (await screen.findByRole('rowheader', { name: 'Stan Eva' })).closest('tr')!;
    expect(within(stan).getByText('Deschis, fără fișiere')).toBeInTheDocument();
    await userEvent.click(within(stan).getByRole('button', { name: 'Deblochează' }));
    expect(confirm).toHaveBeenCalledWith('Deblochezi numele Stan Eva? Elevul poate alege din nou numele. Nu se pierde nimic.');
    expect(api.resetSubmission).toHaveBeenCalledWith(6, '2026-10-06T07:25:00.000Z');
  });

  it('keeps Resetează under ⋯ for a sent upload, and no Deblochează button', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [
        fakeTest({ status: 'open', uploadToken: FAKE_TOKEN }, [
          fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'submitted', fileCount: 1, startedAt: '2026-10-06T07:25:00.000Z' }),
        ]),
      ],
    });
    renderAdmin(`${PAGE}#in-class`, api);
    const stan = (await screen.findByRole('rowheader', { name: 'Stan Eva' })).closest('tr')!;
    expect(within(stan).queryByRole('button', { name: /deblochează/i })).not.toBeInTheDocument();
    await userEvent.click(within(stan).getByRole('button', { name: 'Mai multe pentru Stan Eva' }));
    expect(within(stan).getByRole('menuitem', { name: 'Resetează' })).toBeInTheDocument();
  });

  it('keeps a row\'s rarer actions under ⋯, which Esc closes with the focus back on it', async () => {
    // Its own rows: the shared rows above were already reset by the test before.
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [
        fakeTest({ status: 'open', uploadToken: FAKE_TOKEN }, [
          fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'submitted', fileCount: 1, startedAt: '2026-10-06T07:25:00.000Z' }),
        ]),
      ],
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin(`${PAGE}#in-class`, api);
    const stan = (await screen.findByRole('rowheader', { name: 'Stan Eva' })).closest('tr')!;
    // Only the name's link to the paper and ⋯ show on the row.
    expect(within(stan).getByRole('link', { name: 'Stan Eva' })).toBeInTheDocument();
    expect(within(stan).queryByRole('button', { name: 'Resetează' })).not.toBeInTheDocument();
    const more = within(stan).getByRole('button', { name: 'Mai multe pentru Stan Eva' });
    expect(more).toHaveAttribute('aria-haspopup', 'menu');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const menu = within(stan).getByRole('menu');
    expect(more).toHaveAttribute('aria-controls', menu.id);
    await userEvent.keyboard('{Escape}');
    expect(within(stan).queryByRole('menu')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
    // The menu is fixed to the screen: a scroll (of the table too) closes it.
    await userEvent.click(more);
    fireEvent.scroll(stan.closest('.table-wrap')!);
    expect(within(stan).queryByRole('menu')).not.toBeInTheDocument();
    // An item closes the menu and gives the focus back to ⋯ before it asks.
    await userEvent.click(more);
    await userEvent.click(within(stan).getByRole('menuitem', { name: 'Resetează' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(within(stan).queryByRole('menu')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
    expect(api.resetSubmission).not.toHaveBeenCalled();
  });

  it('keeps the page when a refresh fails, and says why', async () => {
    // Its own rows: the shared rows above were already reset by the test before.
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [
        fakeTest({ status: 'open', uploadToken: FAKE_TOKEN }, [
          fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'submitted', fileCount: 1, startedAt: '2026-10-06T07:25:00.000Z' }),
        ]),
      ],
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#in-class`, api);
    const stan = (await screen.findByRole('rowheader', { name: 'Stan Eva' })).closest('tr')!;
    vi.mocked(api.getTest).mockRejectedValue(new ApiError(503, 'unavailable', 'Serverul nu răspunde. Încearcă din nou.'));
    await chooseInRow(stan, 'Stan Eva', 'Resetează');
    expect(await screen.findByText('Serverul nu răspunde. Încearcă din nou.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Fracții' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'În clasă' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiază linkul' })).toBeInTheDocument();
  });

  it('reopens the uploads of a closed test', async () => {
    const api = apiWith({ status: 'done' });
    renderAdmin(`${PAGE}#in-class`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redeschide încărcarea' }));
    expect(api.reopenTest).toHaveBeenCalledWith('6E2-26T1');
  });

  it('holds the actions of the test in "Acțiuni" at the top of the page, each with what it does', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done', files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null }, print: { status: 'ready', fromWord: false } }));
    const menu = await openActions();
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual(['Redenumește testul', 'Alege materia', 'Arhivează testul', 'Șterge testul']);
    expect(within(menu).getByRole('menuitem', { name: 'Redenumește testul' })).toHaveAccessibleDescription('Schimbi titlul testului.');
    expect(within(menu).getByRole('menuitem', { name: 'Alege materia' })).toHaveAccessibleDescription(
      'Altfel, materia se stabilește la corectare, din test.',
    );
    expect(within(menu).getByRole('menuitem', { name: 'Arhivează testul' })).toHaveAccessibleDescription(
      'Testul nu mai apare în lista clasei și în Teste. Îl găsești cu „Arată și testele arhivate”.',
    );
    expect(within(menu).getByRole('menuitem', { name: 'Șterge testul' })).toHaveAccessibleDescription(
      'Se șterg și toate lucrările încărcate de elevi. Codurile QR de pe testele tipărite nu mai funcționează.',
    );
    expect(within(sheet()).queryByRole('button')).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acțiuni' })).toHaveFocus();
  });

  it('archives a finished test and offers to take it out of the archive', async () => {
    const api = apiWith({ status: 'done' });
    renderAdmin(PAGE, api);
    await screen.findByRole('region', { name: 'Fișa testului' });
    expect(screen.queryByText('Arhivat')).not.toBeInTheDocument();
    await chooseAction('Arhivează testul');
    // Nothing published: no question.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.setTestArchived).toHaveBeenCalledWith('6E2-26T1', true);
    expect(await within(sheet()).findByText('Arhivat')).toHaveClass('tag');
    expect(await actionNames()).toEqual(['Redenumește testul', 'Alege materia', 'Scoate din arhivă', 'Șterge testul']);

    await chooseAction('Scoate din arhivă');
    expect(api.setTestArchived).toHaveBeenLastCalledWith('6E2-26T1', false);
    await waitFor(() => expect(screen.queryByText('Arhivat')).not.toBeInTheDocument());
    expect(await actionNames()).toContain('Arhivează testul');
  });

  it('asks before an archive that closes open results, and changes nothing on "Renunță"', async () => {
    const api = apiWith({ status: 'done', resultsOpen: true });
    renderAdmin(PAGE, api);
    await chooseAction('Arhivează testul');
    const dialog = screen.getByRole('dialog', { name: 'Arhivezi testul?' });
    expect(within(dialog).getByText('Elevii nu își vor mai putea vedea rezultatele. Le poți publica din nou oricând.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Renunță' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.setTestArchived).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Acțiuni' })).toHaveFocus();

    await chooseAction('Arhivează testul');
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Arhivezi testul?' })).getByRole('button', { name: 'Arhivează' }));
    expect(api.setTestArchived).toHaveBeenCalledWith('6E2-26T1', true);
    expect(await within(sheet()).findByText('Arhivat')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks also when the results are published for some students only', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done', publishedCount: 1 }));
    await chooseAction('Arhivează testul');
    expect(screen.getByRole('dialog', { name: 'Arhivezi testul?' })).toBeInTheDocument();
  });

  it('offers no archive while the test is not finished', async () => {
    for (const status of ['draft', 'open', 'evaluating'] as const) {
      const view = renderAdmin(PAGE, apiWith({ status }));
      expect(await actionNames()).toEqual(['Redenumește testul', 'Alege materia', 'Șterge testul']);
      view.unmount();
    }
  });

  it('says why the archive was refused', async () => {
    const api = apiWith({ status: 'done' });
    vi.mocked(api.setTestArchived).mockRejectedValueOnce(new ApiError(409, 'not_done', 'Poți arhiva un test după ce s-a terminat corectarea.'));
    renderAdmin(PAGE, api);
    await chooseAction('Arhivează testul');
    expect(await screen.findByText('Poți arhiva un test după ce s-a terminat corectarea.')).toBeInTheDocument();
  });

  it('renames the test in a dialog', async () => {
    const api = apiWith();
    renderAdmin(PAGE, api);
    await chooseAction('Redenumește testul');
    const dialog = screen.getByRole('dialog', { name: 'Redenumește testul' });
    const input = within(dialog).getByLabelText('Titlu nou');
    expect(input).toHaveValue('Fracții');
    expect(input).toHaveFocus();
    await userEvent.clear(input);
    await userEvent.type(input, 'Teză');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvează' }));
    expect(api.renameTest).toHaveBeenCalledWith('6E2-26T1', 'Teză');
    expect(await screen.findByRole('heading', { level: 1, name: 'Teză' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acțiuni' })).toHaveFocus();
  });

  it('keeps the title when the rename dialog is closed', async () => {
    const api = apiWith();
    renderAdmin(PAGE, api);
    await chooseAction('Redenumește testul');
    await userEvent.type(screen.getByLabelText('Titlu nou'), ' nou');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.renameTest).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: 'Fracții' })).toBeInTheDocument();
  });

  it('deletes the test after the teacher confirms and goes to the test list', async () => {
    const api = apiWith();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(PAGE, api, <LocationProbe />);
    await chooseAction('Șterge testul');
    expect(api.deleteTest).toHaveBeenCalledWith('6E2-26T1');
    await expectLocation(/^\/$/);
  });

  it('says why the delete was refused', async () => {
    const api = apiWith();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.deleteTest).mockRejectedValueOnce(new ApiError(503, 'unavailable', 'Serverul nu răspunde. Încearcă din nou.'));
    renderAdmin(PAGE, api);
    await chooseAction('Șterge testul');
    expect(await screen.findByText('Serverul nu răspunde. Încearcă din nou.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Fracții' })).toBeInTheDocument();
  });

  it('warns before deleting a test whose QR code may be printed already', async () => {
    const api = apiWith({ files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: null }, print: { status: 'ready', fromWord: false } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin(PAGE, api);
    await chooseAction('Șterge testul');
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
    renderAdmin(`${PAGE}#in-class`, api);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Arată codul QR' }))[1]!);
    expect(api.createMultiUploadLink).toHaveBeenCalledWith('6E2-26T1');
    const window_ = await screen.findByRole('dialog', { name: 'Linkul tău pentru mai multe lucrări' });
    expect(within(window_).getByText(`${window.location.origin}/u/${FAKE_MULTI_TOKEN}`)).toBeInTheDocument();
  });

  it('shows both upload links when the multi-upload link already exists', async () => {
    const api = apiWith({ status: 'open', uploadToken: FAKE_TOKEN, multiUploadToken: FAKE_MULTI_TOKEN });
    renderAdmin(`${PAGE}#in-class`, api);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Arată codul QR' }))[1]!);
    const window_ = await screen.findByRole('dialog', { name: 'Linkul tău pentru mai multe lucrări' });
    expect(within(window_).getByText(`${window.location.origin}/u/${FAKE_MULTI_TOKEN}`)).toBeInTheDocument();
    expect(api.createMultiUploadLink).not.toHaveBeenCalled();
  });

  it('shows in Fișa testului the state, who sent a paper, the average in its grade colour, and the facts', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
      fakeUpload({ studentId: 13, studentName: 'Ene Ana' }),
    ];
    const test = fakeTest(
      {
        status: 'done',
        startedAt: '2026-10-06T07:15:00.000Z',
        files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: { name: 'Barem.pdf', type: PDF_TYPE } },
        print: { status: 'ready', fromWord: false },
        subject: { value: 'fizica', name: '', by: 'robot' },
      },
      rows,
    );
    renderAdmin(PAGE, createFakeApi({ classes: [], students: {}, tests: [test] }));
    const card = await screen.findByRole('region', { name: 'Fișa testului' });
    expect(within(card).getByText('Corectat')).toHaveClass('status', 'status-done');
    expect(fact('Au trimis')).toHaveTextContent('2 din 4');
    expect(fact('Au trimis')!.querySelector('.sheet-bar > span')).toHaveStyle({ width: '50%' });
    expect(fact('Media testului')).toHaveTextContent('8,5');
    expect(fact('Media testului')).toHaveClass('points-4');
    expect(fact('Clasa')).toHaveTextContent('Clasa 6E2 · 4 elevi');
    expect(fact('Codul')).toHaveTextContent('6E2-26T1');
    expect(fact('Materia')).toHaveTextContent('Fizică');
    expect(fact('Început')).toHaveTextContent('6 oct. 2026, 10:15');
    expect(within(card).getAllByText(/./, { selector: 'dt' }).map((term) => term.textContent)).toEqual([
      'Au trimis',
      'Media testului',
      // "Lucrările": where the papers are, once the uploads closed.
      'Corectate',
      'Nu au participat',
      'Clasa',
      'Codul',
      'Materia',
      'Început',
    ]);
    expect(within(card).getByText('Lucrările', { selector: 'h3' })).toBeInTheDocument();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
    expect(within(card).queryByText('Arhivat')).not.toBeInTheDocument();
  });

  it('shows in Fișa testului the students and the barem of a draft, and no start yet', async () => {
    renderAdmin(PAGE, apiWith());
    const card = await screen.findByRole('region', { name: 'Fișa testului' });
    expect(within(card).getByText('Ciornă')).toBeInTheDocument();
    expect(fact('Elevi')).toHaveTextContent('3');
    expect(fact('Baremul')).toHaveTextContent('lipsește');
    expect(within(card).queryByText('Au trimis')).not.toBeInTheDocument();
    expect(within(card).queryByText('Început')).not.toBeInTheDocument();
    expect(fact('Materia')).toHaveTextContent('Se stabilește la corectare');
    expect(screen.getByText(/3 elevi · ciornă/)).toBeInTheDocument();
  });

  it('shows in Fișa testului who sent a paper and who is sending one now, while the test is open', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 3 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan', submissionId: 7, status: 'uploading', fileCount: 0 }),
      fakeUpload({ studentId: 13, studentName: 'Ene Ana' }),
    ];
    const test = fakeTest({ status: 'open', startedAt: '2026-10-06T07:15:00.000Z' }, rows);
    renderAdmin(PAGE, createFakeApi({ classes: [], students: {}, tests: [test] }));
    await screen.findByRole('region', { name: 'Fișa testului' });
    // Pop Ion sent, Stan Eva sends a file now; Marin Dan started with no file yet.
    expect(fact('Au trimis')).toHaveTextContent('1 din 4');
    expect(fact('Încarcă acum')).toHaveTextContent('1');
    expect(within(sheet()).queryByText('Media testului')).not.toBeInTheDocument();
  });

  it('counts the graded papers in Fișa testului until the test has an average', async () => {
    // The fake API makes the average from the graded papers: none is graded yet.
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'grading', fileCount: 2 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'submitted', fileCount: 1 }),
    ];
    const test = fakeTest({ status: 'evaluating', startedAt: '2026-10-06T07:15:00.000Z' }, rows);
    renderAdmin(PAGE, createFakeApi({ classes: [], students: {}, tests: [test] }));
    await screen.findByRole('region', { name: 'Fișa testului' });
    expect(fact('Corectate')).toHaveTextContent('0 din 2');
    expect(within(sheet()).queryByText('Media testului')).not.toBeInTheDocument();
  });

  it('shows no part of a bar when no student is in the class', async () => {
    const test = fakeTest({ status: 'open', startedAt: '2026-10-06T07:15:00.000Z' }, []);
    renderAdmin(PAGE, createFakeApi({ classes: [], students: {}, tests: [test] }));
    await screen.findByRole('region', { name: 'Fișa testului' });
    expect(fact('Au trimis')).toHaveTextContent('0 din 0');
    expect(fact('Au trimis')!.querySelector('.sheet-bar > span')).toHaveStyle({ width: '0%' });
  });
});
