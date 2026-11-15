import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TestInfo } from '../../../shared/api.ts';
import { PDF_TYPE } from '../../../shared/files.ts';
import { createFakeApi, FAKE_TOKEN, fakeTest, fakeUpload, noCesVariant } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { printPdf, type PrintOutcome } from './printPdf.ts';

vi.mock('./printPdf.ts', () => ({ printPdf: vi.fn() }));

const TEST_FILE = { name: 'Test.pdf', type: PDF_TYPE };
const students = (count: number) => Array.from({ length: count }, (_, index) => fakeUpload({ studentId: index + 1, studentName: `Elev ${index + 1}` }));

function openApi(overrides: Partial<TestInfo> = {}, studentCount = 0) {
  return createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount }],
    students: {},
    tests: [fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, files: { test: TEST_FILE, barem: null }, ...overrides }, students(studentCount))],
  });
}

const card = (name = 'Testul cu cod QR') => screen.findByRole('region', { name });

afterEach(() => {
  vi.mocked(printPdf).mockReset();
});

describe('PrintTest', () => {
  it('asks for the test file first', async () => {
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ files: { test: null, barem: null } }));
    expect(within(await card()).getByText('Încarcă testul ca să primești varianta cu cod QR.')).toBeInTheDocument();
  });

  it('says the PDF is being made', async () => {
    renderAdmin('/teste/6E2-26T1#tiparire', openApi());
    expect(within(await card()).getByText('Se pregătește testul cu cod QR…')).toHaveAttribute('role', 'status');
  });

  it('offers to print and to download when ready, with how many copies', async () => {
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: false } }, 23));
    const ready = within(await card());
    expect(ready.getByRole('button', { name: 'Tipărește' })).toHaveClass('button');
    const link = ready.getByRole('link', { name: 'Descarcă PDF' });
    expect(link).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/print');
    expect(link).toHaveAttribute('download');
    expect(ready.getByText('Codul QR apare în colțul fiecărei pagini.')).toBeInTheDocument();
    expect(ready.getByText('Tipărește 23 de copii, câte una pentru fiecare elev.')).toBeInTheDocument();
  });

  it('says one copy for one student, and nothing for a class with no student', async () => {
    const one = renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: false } }, 1));
    expect(within(await card()).getByText('Tipărește 1 copie, câte una pentru fiecare elev.')).toBeInTheDocument();
    one.unmount();
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: false } }, 0));
    expect(within(await card()).queryByText(/^Tipărește \d/)).not.toBeInTheDocument();
  });

  it('opens the print window on the PDF, and says it is getting ready meanwhile', async () => {
    let finish: (outcome: PrintOutcome) => void = () => undefined;
    vi.mocked(printPdf).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: false } }));
    await userEvent.click(within(await card()).getByRole('button', { name: 'Tipărește' }));
    expect(printPdf).toHaveBeenCalledWith('/api/admin/tests/6E2-26T1/print');
    expect(screen.getByRole('button', { name: 'Se pregătește…' })).toBeDisabled();
    finish('printed');
    expect(await screen.findByRole('button', { name: 'Tipărește' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says when the PDF could not be opened for printing', async () => {
    vi.mocked(printPdf).mockResolvedValue('failed');
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: false } }));
    await userEvent.click(within(await card()).getByRole('button', { name: 'Tipărește' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am putut deschide testul pentru tipărit. Încearcă din nou sau descarcă PDF-ul.');
    vi.mocked(printPdf).mockResolvedValue('tab');
    await userEvent.click(screen.getByRole('button', { name: 'Tipărește' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('warns about a PDF made from Word', async () => {
    const word = /PDF-ul a fost făcut din fișierul Word/;
    const { unmount } = renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: true } }));
    expect(await screen.findByText(word)).toHaveTextContent('Pentru o copie exactă, încarcă testul ca PDF.');
    unmount();
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: false } }));
    await screen.findByRole('button', { name: 'Tipărește' });
    expect(screen.queryByText(word)).not.toBeInTheDocument();
  });

  it('retries a failed print', async () => {
    const api = openApi({ print: { status: 'failed', fromWord: false } });
    renderAdmin('/teste/6E2-26T1#tiparire', api);
    expect(await screen.findByText('Nu am putut pregăti testul cu cod QR.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(api.retryPrint).toHaveBeenCalledWith('6E2-26T1', 'class');
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Încearcă din nou' })).not.toBeInTheDocument());
  });

  it('shows the block in the panel Tipărire, and not with the files of Pregătire', async () => {
    renderAdmin('/teste/6E2-26T1#tiparire', openApi());
    const panel = await screen.findByRole('region', { name: 'Tipărire' });
    expect(within(panel).getByRole('region', { name: 'Testul cu cod QR' })).toBeInTheDocument();
    const stages = screen.getByRole('navigation', { name: 'Etapele testului' });
    await userEvent.click(within(stages).getByRole('link', { name: /^Pregătire / }));
    expect(await screen.findByRole('link', { name: 'Test.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Testul cu cod QR' })).not.toBeInTheDocument();
  });

  it('turns a spinner while the PDF is being made, and not after', async () => {
    const { unmount } = renderAdmin('/teste/6E2-26T1#tiparire', openApi());
    const status = await screen.findByRole('status');
    expect(status.querySelector('.spinner')).not.toBeNull();
    unmount();
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: false } }));
    await screen.findByRole('button', { name: 'Tipărește' });
    expect(document.querySelector('.spinner')).toBeNull();
  });

  it('prints the CES test apart, for the CES students, with quiet buttons', async () => {
    const api = openApi(
      {
        status: 'draft',
        print: { status: 'ready', fromWord: false },
        ces: noCesVariant({ studentCount: 2, files: { test: TEST_FILE, barem: null }, print: { status: 'ready', fromWord: false } }),
      },
      23,
    );
    vi.mocked(printPdf).mockResolvedValue('printed');
    renderAdmin('/teste/6E2-26T1#tiparire', api);
    const ces = within(await card('Testul CES cu cod QR'));
    expect(within(await card()).getByText('Tipărește 21 de copii, pentru elevii fără CES.')).toBeInTheDocument();
    expect(ces.getByText('Tipărește 2 copii, pentru elevii cu CES.')).toBeInTheDocument();
    expect(ces.getByRole('link', { name: 'Descarcă PDF' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/ces/print');
    expect(ces.getByRole('button', { name: 'Tipărește' })).toHaveClass('button-quiet');
    // The line of a draft is said once, on the class test.
    expect(within(await card()).getByText(/Poți tipări testul de acum/)).toBeInTheDocument();
    expect(ces.queryByText(/Poți tipări testul de acum/)).not.toBeInTheDocument();
    await userEvent.click(ces.getByRole('button', { name: 'Tipărește' }));
    expect(printPdf).toHaveBeenCalledWith('/api/admin/tests/6E2-26T1/ces/print');
  });

  it('counts every student for the class test while the CES students have no CES test', async () => {
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ print: { status: 'ready', fromWord: false }, ces: noCesVariant({ studentCount: 2 }) }, 23));
    expect(within(await card()).getByText('Tipărește 23 de copii, câte una pentru fiecare elev.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Testul CES cu cod QR' })).not.toBeInTheDocument();
  });

  it('keeps the PDFs to print again after the test was given', async () => {
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ status: 'done', print: { status: 'ready', fromWord: false } }));
    expect(await screen.findByText('Testul s-a dat în clasă.')).toBeInTheDocument();
    const given = within(await card());
    expect(given.getByRole('button', { name: 'Tipărește' })).toBeInTheDocument();
    expect(given.getByRole('link', { name: 'Descarcă PDF' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/print');
    expect(given.queryByText(/Poți tipări testul de acum/)).not.toBeInTheDocument();
  });

  it('says only that the test was given when no PDF was made before', async () => {
    renderAdmin('/teste/6E2-26T1#tiparire', openApi({ status: 'evaluating' }));
    expect(await screen.findByText('Testul s-a dat în clasă.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Testul cu cod QR' })).not.toBeInTheDocument();
    expect(screen.queryByText('Se pregătește testul cu cod QR…')).not.toBeInTheDocument();
  });
});
