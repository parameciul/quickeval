import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../../shared/files.ts';
import { createFakeApi, FAKE_TOKEN, fakeTest, fakeUpload, noCesVariant } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

// The CES variant on the test page (spec: CES variant): its block in
// Pregătire, its print PDF in Tipărire, the CES papers that wait in Corectare,
// and the CES mark in the tables.

const FILES = { test: { name: 'test.pdf', type: PDF_TYPE }, barem: { name: 'barem.pdf', type: PDF_TYPE } };
const uploads = [
  fakeUpload({ studentId: 10, studentName: 'Bursașiu Teodor', submissionId: 5, status: 'submitted', fileCount: 2, ces: true }),
  fakeUpload({ studentId: 11, studentName: 'Ene Ana', submissionId: 6, status: 'submitted', fileCount: 2 }),
];

function apiWith(overrides: Parameters<typeof fakeTest>[0] = {}) {
  return createFakeApi({
    classes: [{ id: 1, name: '9R2', schoolYear: 2026, archived: false, studentCount: 2 }],
    students: {},
    tests: [fakeTest({ code: '9R2-26T1', files: FILES, uploadToken: FAKE_TOKEN, ...overrides }, uploads)],
  });
}

const PAGE = '/teste/9R2-26T1';
const block = async () => within(await screen.findByRole('region', { name: 'Varianta CES' }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Varianta CES in Pregătire', () => {
  it('is not offered while the class has no CES student', async () => {
    renderAdmin(`${PAGE}#pregatire`, apiWith());
    expect(await screen.findByLabelText('Înlocuiește testul')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Varianta CES' })).not.toBeInTheDocument();
  });

  it('uploads the CES test and barem apart from the class files', async () => {
    const api = apiWith({ ces: noCesVariant({ studentCount: 1 }) });
    renderAdmin(`${PAGE}#pregatire`, api);
    const ces = await block();
    expect(ces.getByText(/1 elev cu CES primește acest test, corectat cu baremul lui\./)).toBeInTheDocument();
    const file = new File(['%PDF-1.7'], 'Test adaptat.pdf', { type: PDF_TYPE });
    await userEvent.upload(ces.getByLabelText('Încarcă testul CES'), file);
    expect(api.uploadTestFile).toHaveBeenCalledWith('9R2-26T1', 'test', file, 'ces');
    expect(await ces.findByRole('link', { name: 'Test adaptat.pdf' })).toHaveAttribute('href', '/api/admin/tests/9R2-26T1/ces/files/test');
    // The class test is still the class test.
    expect(screen.getByRole('link', { name: 'test.pdf' })).toHaveAttribute('href', '/api/admin/tests/9R2-26T1/files/test');
    const barem = new File(['%PDF-1.7'], 'Barem adaptat.pdf', { type: PDF_TYPE });
    await userEvent.upload(ces.getByLabelText('Încarcă baremul CES'), barem);
    expect(api.uploadTestFile).toHaveBeenLastCalledWith('9R2-26T1', 'barem', barem, 'ces');
  });

  it('generates the CES barem during the evaluation and checks it', async () => {
    const api = apiWith({ status: 'evaluating', ces: noCesVariant({ studentCount: 1, files: { test: FILES.test, barem: null }, waiting: 1 }) });
    renderAdmin(`${PAGE}#pregatire`, api);
    const ces = await block();
    await userEvent.click(ces.getByRole('button', { name: 'Generează baremul CES' }));
    expect(api.generateBarem).toHaveBeenCalledWith('9R2-26T1', 'ces');
    expect(await ces.findByText('Se generează baremul CES… Durează câteva minute.')).toBeInTheDocument();
  });

  it('checks a generated CES barem with its own files version', async () => {
    const api = apiWith({
      status: 'evaluating',
      ces: noCesVariant({ studentCount: 1, files: FILES, filesVersion: 4, barem: { request: 'none', unchecked: true } }),
    });
    renderAdmin(`${PAGE}#pregatire`, api);
    const ces = await block();
    expect(ces.getByText('Barem CES generat automat, doar pentru notare. Verifică-l și corectează-l în Word dacă e nevoie.')).toBeInTheDocument();
    await userEvent.click(ces.getByRole('button', { name: 'Am verificat baremul CES' }));
    expect(api.confirmBarem).toHaveBeenCalledWith('9R2-26T1', 4, 'ces');
    expect(await screen.findByText('Robotul pornește în aproximativ un minut.')).toBeInTheDocument();
  });

  it('saves the CES barem comments apart', async () => {
    const api = apiWith({ ces: noCesVariant({ studentCount: 1, files: FILES }) });
    renderAdmin(`${PAGE}#pregatire`, api);
    const ces = await block();
    await userEvent.click(ces.getByRole('button', { name: 'Adaugă comentarii' }));
    await userEvent.type(ces.getByLabelText('Comentarii la baremul CES'), 'Fără depunctări pentru scris.');
    await userEvent.click(ces.getByRole('button', { name: 'Salvează comentariile' }));
    expect(api.saveBaremNotes).toHaveBeenCalledWith('9R2-26T1', 'Fără depunctări pentru scris.', 'ces');
  });

  it('warns when the CES barem does not total as much as the class barem', async () => {
    renderAdmin(`${PAGE}#pregatire`, apiWith({ ces: noCesVariant({ studentCount: 1, files: FILES, totalPoints: 90, classTotalPoints: 100 }) }));
    expect((await block()).getByText('Baremul CES are 90 puncte, iar baremul clasei 100. Baremul CES ar trebui să aibă tot atâtea puncte.')).toBeInTheDocument();
  });

  it('removes the variant after asking, and keeps it once a CES paper was graded', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const api = apiWith({ ces: noCesVariant({ studentCount: 1, files: FILES }) });
    renderAdmin(`${PAGE}#pregatire`, api);
    await userEvent.click((await block()).getByRole('button', { name: 'Șterge varianta CES' }));
    expect(window.confirm).toHaveBeenCalledWith('Ștergi varianta CES? Elevii cu CES primesc atunci testul clasei.');
    expect(api.removeCesVariant).toHaveBeenCalledWith('9R2-26T1');
    await waitFor(async () => expect((await block()).queryByRole('link', { name: 'test.pdf' })).not.toBeInTheDocument());
  });

  it('says why a variant with graded CES papers cannot be removed', async () => {
    renderAdmin(`${PAGE}#pregatire`, apiWith({ status: 'done', ces: noCesVariant({ studentCount: 1, files: FILES, papers: 1 }) }));
    const ces = await block();
    expect(ces.getByText('Varianta CES are lucrări trimise la corectare, așa că nu mai poate fi ștearsă. Poți înlocui fișierele ei.')).toBeInTheDocument();
    expect(ces.queryByRole('button', { name: 'Șterge varianta CES' })).not.toBeInTheDocument();
  });

  it('stays while it has files, even with no CES student left', async () => {
    renderAdmin(`${PAGE}#pregatire`, apiWith({ ces: noCesVariant({ files: { test: FILES.test, barem: null } }) }));
    expect((await block()).getByText(/Nu mai e niciun elev cu CES în clasă\./)).toBeInTheDocument();
  });
});

describe('the CES print PDF in Tipărire', () => {
  it('downloads the CES test with the same QR code', async () => {
    renderAdmin(`${PAGE}#tiparire`, apiWith({ print: { status: 'ready', fromWord: false }, ces: noCesVariant({ studentCount: 1, files: FILES, print: { status: 'ready', fromWord: false } }) }));
    expect(await screen.findByRole('link', { name: 'Descarcă testul CES cu cod QR' })).toHaveAttribute('href', '/api/admin/tests/9R2-26T1/ces/print');
    expect(screen.getByRole('link', { name: 'Descarcă testul cu cod QR' })).toHaveAttribute('href', '/api/admin/tests/9R2-26T1/print');
    expect(screen.getByText('Același cod QR ca pe testul clasei: elevii cu CES încarcă pe același link.')).toBeInTheDocument();
  });

  it('tries a failed CES print PDF again', async () => {
    const api = apiWith({ print: { status: 'ready', fromWord: false }, ces: noCesVariant({ studentCount: 1, files: FILES, print: { status: 'failed', fromWord: false } }) });
    renderAdmin(`${PAGE}#tiparire`, api);
    expect(await screen.findByText('Nu am putut pregăti testul CES cu cod QR.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(api.retryPrint).toHaveBeenCalledWith('9R2-26T1', 'ces');
  });
});

describe('the CES papers in Corectare', () => {
  it('says that the CES papers wait for the CES barem, and leads to Pregătire', async () => {
    renderAdmin(`${PAGE}#corectare`, apiWith({ status: 'evaluating', ces: noCesVariant({ studentCount: 1, files: { test: FILES.test, barem: null }, waiting: 1 }) }));
    const notice = (await screen.findByText(/1 lucrare CES așteaptă baremul CES\./)).closest('.warning') as HTMLElement;
    expect(notice).toHaveTextContent('Încarcă sau generează baremul CES la Pregătire. Celelalte lucrări se corectează între timp.');
    await userEvent.click(within(notice).getByRole('link', { name: 'Mergi la varianta CES' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Pregătire' })).toBeInTheDocument();
  });

  it('shows no waiting notice once the CES barem is active', async () => {
    renderAdmin(`${PAGE}#corectare`, apiWith({ status: 'evaluating', ces: noCesVariant({ studentCount: 1, files: FILES, waiting: 1 }) }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Corectare' })).toBeInTheDocument();
    expect(screen.queryByText(/așteaptă baremul CES/)).not.toBeInTheDocument();
  });

  it('accepts a CES list with a problem, apart from the class list', async () => {
    const api = apiWith({ status: 'evaluating', ces: noCesVariant({ studentCount: 1, files: FILES, exerciseList: { status: 'problem', message: 'Punctele fac 95.' } }) });
    renderAdmin(`${PAGE}#corectare`, api);
    const banner = (await screen.findByText('Baremul CES are o problemă.')).closest('.warning') as HTMLElement;
    expect(banner).toHaveTextContent('Punctele fac 95.');
    await userEvent.click(within(banner).getByRole('button', { name: 'Folosește oricum' }));
    expect(api.acceptExerciseList).toHaveBeenCalledWith('9R2-26T1', 'ces');
  });

  it('marks the CES student in the papers table', async () => {
    renderAdmin(`${PAGE}#corectare`, apiWith({ status: 'evaluating', ces: noCesVariant({ studentCount: 1, files: FILES }) }));
    const row = (await screen.findByRole('rowheader', { name: /Bursașiu Teodor/ })).closest('tr')!;
    expect(within(row).getByText('CES')).toHaveAttribute('title', 'Cerințe educaționale speciale');
    expect(within(screen.getByRole('rowheader', { name: /Ene Ana/ })).queryByText('CES')).not.toBeInTheDocument();
  });
});
