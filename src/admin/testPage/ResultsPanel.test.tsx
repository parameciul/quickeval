import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClassReport, TestInfo, UploadRow } from '../../../shared/api.ts';
import { classCsv } from '../../../shared/csv.ts';
import { uploadStatusLabel } from '../../ui/format.ts';
import { createFakeApi, FAKE_STARTED_AT, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import * as share from '../pdf/share.ts';

vi.mock('../pdf/share.ts', () => ({ saveFile: vi.fn(), shareFile: vi.fn() }));

const saveFile = vi.mocked(share.saveFile);

// The panel Rezultate of the test page (redesign spec §8).
const PAGE = '/teste/6E2-26T1#rezultate';

// Pop Ion and Stan Eva sent graded papers; Marin Dan sent none.
const graded = () => [
  fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9, total: 90, maxTotal: 100 }),
  fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8, total: 80, maxTotal: 100 }),
  fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
];

function apiWith(overrides: Partial<TestInfo>, rows: UploadRow[], reports: Record<string, ClassReport> = {}) {
  return createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: rows.length }],
    students: {},
    tests: [fakeTest(overrides, rows)],
    reports,
  });
}

const row = (name: string) => screen.getByRole('rowheader', { name: new RegExp(`^${name}`) }).closest('tr')!;

afterEach(() => {
  vi.restoreAllMocks();
  saveFile.mockReset();
});

describe('the panel Rezultate', () => {
  it('has one line for a draft', async () => {
    renderAdmin(PAGE, apiWith({}, graded()));
    expect(await screen.findByRole('heading', { level: 2, name: 'Rezultate' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Rezultatele se publică după corectare' })).toBeInTheDocument();
    expect(screen.getByText('Când lucrările sunt corectate, le publici de aici; fiecare elev primește linkul lui.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Mergi la Corectare' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Corectare' })).toHaveFocus();
    expect(screen.queryByRole('table', { name: 'Linkurile cu rezultatele elevilor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pentru tine' })).not.toBeInTheDocument();
  });

  it('says what the link shows, and offers no publish button before anything is graded', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 2 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
    ];
    renderAdmin(PAGE, apiWith({ status: 'evaluating' }, rows));
    expect(
      await screen.findByText('Linkul arată nota, punctajul pe fiecare exercițiu și comentariile. Elevul îl vede după ce îl publici.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Rezultatele se publică după corectare' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mergi la Corectare' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publică toate rezultatele' })).not.toBeInTheDocument();
    // A sent paper has its link before the grading; one still on the phone has none.
    expect(within(row('Pop Ion')).getByRole('button', { name: /^Fă linkul:/ })).toBeInTheDocument();
    expect(within(row('Pop Ion')).getByText('Nepublicat')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Publică:/ })).not.toBeInTheDocument();
    expect(within(row('Stan Eva')).getByText('Nu a trimis lucrarea.')).toBeInTheDocument();
    expect(within(row('Marin Dan')).getByText('Nu a trimis lucrarea.')).toBeInTheDocument();
    expect(screen.getByText('0 publicate · 1 nepublicat')).toBeInTheDocument();
    expect(screen.getByText('Raportul clasei și CSV-ul apar după prima corectare.')).toBeInTheDocument();
  });

  it('shows the points and the grade of a graded paper, and dashes for a paper not graded yet', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 7.25, total: 72.5, maxTotal: 100 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'failed', fileCount: 1 }),
    ];
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    await screen.findByRole('table', { name: 'Linkurile cu rezultatele elevilor' });
    expect(within(row('Pop Ion')).getByText('72,5 / 100')).toBeInTheDocument();
    expect(within(row('Pop Ion')).getByText('7,25')).toBeInTheDocument();
    expect(within(row('Stan Eva')).getAllByText('—')).toHaveLength(2);
  });

  it("links each name to the paper's page, and marks a student who left", async () => {
    const rows = [...graded(), fakeUpload({ studentId: 13, studentName: 'Vlad Ana', active: false, submissionId: 7, status: 'graded', grade: 6 })];
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    await screen.findByRole('table', { name: 'Linkurile cu rezultatele elevilor' });
    expect(within(row('Pop Ion')).getByRole('link', { name: 'Pop Ion' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/5');
    expect(within(row('Marin Dan')).queryByRole('link')).not.toBeInTheDocument();
    expect(within(row('Vlad Ana')).getByText('a plecat')).toBeInTheDocument();
  });

  it('publishes every result, and stops every link again', async () => {
    const api = apiWith({ status: 'done' }, graded());
    renderAdmin(PAGE, api);
    expect(await screen.findByText('0 publicate · 2 nepublicate')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Publică toate rezultatele' }));
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', true);
    expect(await screen.findByText('Rezultatele sunt publicate. Elevii le văd pe linkurile lor.')).toBeInTheDocument();
    expect(screen.getByText('toate publicate')).toBeInTheDocument();
    // While all are published, a row cannot be stopped alone.
    expect(within(row('Pop Ion')).getByText('Publicat')).toHaveClass('tag', 'tag-ok');
    expect(screen.queryByRole('button', { name: /^Publică:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Oprește publicarea:/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Oprește accesul la rezultate' }));
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', false);
    expect(await screen.findByRole('button', { name: 'Publică toate rezultatele' })).toBeInTheDocument();
    expect(within(row('Pop Ion')).getByText('Nepublicat')).toBeInTheDocument();
    expect(within(row('Pop Ion')).getByRole('button', { name: /^Publică:/ })).toBeInTheDocument();
  });

  it('publishes one result while the rest stays unpublished, and stops it again', async () => {
    const api = apiWith({ status: 'done' }, graded());
    renderAdmin(PAGE, api);
    await userEvent.click(within(await screen.findByRole('row', { name: /^Pop Ion/ })).getByRole('button', { name: /^Publică:/ }));
    expect(api.setSubmissionResultsOpen).toHaveBeenCalledWith(5, FAKE_STARTED_AT, true);
    expect(await within(row('Pop Ion')).findByRole('button', { name: /^Oprește publicarea:/ })).toBeInTheDocument();
    expect(within(row('Pop Ion')).getByText('Publicat')).toBeInTheDocument();
    expect(within(row('Stan Eva')).getByText('Nepublicat')).toBeInTheDocument();
    expect(screen.getByText('1 publicat · 1 nepublicat')).toBeInTheDocument();

    await userEvent.click(within(row('Pop Ion')).getByRole('button', { name: /^Oprește publicarea:/ }));
    expect(api.setSubmissionResultsOpen).toHaveBeenCalledWith(5, FAKE_STARTED_AT, false);
    expect(await within(row('Pop Ion')).findByRole('button', { name: /^Publică:/ })).toBeInTheDocument();
  });

  it('publishes a paper alone only once it is graded, and still stops one published before a new grading', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9, total: 90, maxTotal: 100 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'failed', fileCount: 1 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan', submissionId: 7, status: 'grading', fileCount: 1, resultsOpen: true }),
    ];
    renderAdmin(PAGE, apiWith({ status: 'evaluating' }, rows));
    await screen.findByRole('table', { name: 'Linkurile cu rezultatele elevilor' });
    expect(within(row('Pop Ion')).getByRole('button', { name: /^Publică:/ })).toBeInTheDocument();
    expect(within(row('Stan Eva')).getByText('Nepublicat')).toBeInTheDocument();
    expect(within(row('Stan Eva')).queryByRole('button', { name: /^Publică:/ })).not.toBeInTheDocument();
    expect(within(row('Marin Dan')).getByText('Publicat')).toBeInTheDocument();
    expect(within(row('Marin Dan')).getByRole('button', { name: /^Oprește publicarea:/ })).toBeInTheDocument();
  });

  it('keeps the stop button while the results are open and nothing is graded, as after grading all again', async () => {
    const rows = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 2 })];
    renderAdmin(PAGE, apiWith({ status: 'evaluating', resultsOpen: true }, rows));
    expect(await screen.findByRole('button', { name: 'Oprește accesul la rezultate' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Rezultatele se publică după corectare' })).not.toBeInTheDocument();
  });

  it('says how many points still wait before the teacher publishes', async () => {
    const rows = graded().map((upload) => (upload.studentId === 10 ? { ...upload, flagCount: 3 } : upload));
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    expect(await screen.findByText('Mai ai 3 puncte de verificat. Dacă publici acum, elevii văd punctajul de acum.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publică toate rezultatele' })).toHaveClass('button');
  });

  it('copies the result link of a paper', async () => {
    const user = userEvent.setup();
    const rows = graded().map((upload) => (upload.studentId === 10 ? { ...upload, resultToken: 'result-token-5' } : upload));
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    await user.click(within(await screen.findByRole('row', { name: /^Pop Ion/ })).getByRole('button', { name: /^Copiază linkul:/ }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/u/rezultat/result-token-5`);
    expect(within(row('Pop Ion')).getByRole('button', { name: 'Copiat!' })).toBeInTheDocument();
  });

  it('makes the link of an older paper first, then copies it', async () => {
    const user = userEvent.setup();
    const api = apiWith({ status: 'done' }, graded());
    renderAdmin(PAGE, api);
    await user.click(within(await screen.findByRole('row', { name: /^Pop Ion/ })).getByRole('button', { name: /^Fă linkul:/ }));
    expect(api.getResultLink).toHaveBeenCalledWith(5, FAKE_STARTED_AT);
    await user.click(await within(row('Pop Ion')).findByRole('button', { name: /^Copiază linkul:/ }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/u/rezultat/result-token-5`);
  });

  it('shows the link in a field when the browser refuses to copy it', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('Refuzat', 'NotAllowedError'));
    const rows = graded().map((upload) => (upload.studentId === 10 ? { ...upload, resultToken: 'result-token-5' } : upload));
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    await user.click(within(await screen.findByRole('row', { name: /^Pop Ion/ })).getByRole('button', { name: /^Copiază linkul:/ }));
    expect(await screen.findByLabelText('Linkul cu rezultatul elevului Pop Ion')).toHaveValue(
      `${window.location.origin}/u/rezultat/result-token-5`,
    );
  });

  it('offers the class report and the CSV once a paper is graded', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done' }, graded()));
    expect(await screen.findByRole('heading', { level: 3, name: 'Pentru tine' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Deschide raportul' })).toHaveAttribute('href', '/teste/6E2-26T1/raport');
    expect(screen.getByText('Media testului 8,5 · rezultatele pe exerciții · analiza clasei')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descarcă CSV' })).toBeInTheDocument();
    expect(screen.getByText('PDF-ul cu rezultatul unui elev este pe pagina lucrării lui: apasă pe numele lui în tabel.')).toBeInTheDocument();
  });

  it('downloads the CSV of the class report', async () => {
    const report: ClassReport = {
      test: { code: '6E2-26T1', title: 'Fracții', classId: 1, className: '6E2', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
      exercises: [{ id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 4.5 }],
      rows: [
        {
          submissionId: 5,
          studentId: 10,
          studentName: 'Pop Ion',
          active: true,
          total: 9,
          maxTotal: 10,
          grade: 9,
          flagCount: 0,
          items: [{ exerciseId: 'I.1', points: 4.5, maxPoints: 4.5, flagged: false }],
        },
      ],
      missing: [{ studentId: 12, studentName: 'Marin Dan', status: 'none' }],
      analysis: { status: 'none', stale: false, attempts: 0, content: null },
    };
    const api = apiWith({ status: 'done' }, graded(), { '6E2-26T1': report });
    renderAdmin(PAGE, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Descarcă CSV' }));
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    expect(api.getReport).toHaveBeenCalledWith('6E2-26T1');
    const [blob, fileName] = saveFile.mock.calls[0]!;
    expect(fileName).toBe('6E2-26T1-raport.csv');
    // The BOM stays: Excel reads the diacritics by it.
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(await blob.arrayBuffer())).toBe(classCsv(report, uploadStatusLabel));
  });

  it('says why the CSV could not be made', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done' }, graded()));
    await userEvent.click(await screen.findByRole('button', { name: 'Descarcă CSV' }));
    expect(await screen.findByText('Nu am găsit ce cauți.')).toBeInTheDocument();
    expect(saveFile).not.toHaveBeenCalled();
  });
});

describe('the panel Rezultate, small details', () => {
  it('names each row button with the student, so the buttons differ', async () => {
    const rows = graded().map((upload) => (upload.studentId === 10 || upload.studentId === 11 ? { ...upload, resultToken: `t${upload.studentId}` } : upload));
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    await screen.findByRole('table', { name: 'Linkurile cu rezultatele elevilor' });
    for (const name of ['Pop Ion', 'Stan Eva']) {
      expect(screen.getByRole('button', { name: `Publică: ${name}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Copiază linkul: ${name}` })).toBeInTheDocument();
    }
  });

  it('has no papers table: the links table takes its place', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done' }, graded()));
    await screen.findByRole('table', { name: 'Linkurile cu rezultatele elevilor' });
    expect(screen.queryByRole('table', { name: 'Încărcările elevilor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Încărcări/ })).not.toBeInTheDocument();
  });

  it('shows the points and the grade only for a paper that is graded now', async () => {
    const rows = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'grading', fileCount: 2, grade: 7, total: 70, maxTotal: 100 })];
    renderAdmin(PAGE, apiWith({ status: 'evaluating' }, rows));
    await screen.findByRole('table', { name: 'Linkurile cu rezultatele elevilor' });
    expect(within(row('Pop Ion')).getAllByText('—')).toHaveLength(2);
    expect(within(row('Pop Ion')).queryByText('7')).not.toBeInTheDocument();
  });

  it('does not say "toate publicate" next to "Publică toate rezultatele"', async () => {
    const rows = graded().filter((upload) => upload.submissionId !== null);
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    await userEvent.click(await screen.findByRole('button', { name: 'Publică: Pop Ion' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Publică: Stan Eva' }));
    expect(await screen.findByText('toate publicate pe rând')).toBeInTheDocument();
    expect(screen.queryByText('toate publicate')).not.toBeInTheDocument();
  });

  it('says it when the browser refuses to copy, and selects the link in the field', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('Refuzat', 'NotAllowedError'));
    const rows = graded().map((upload) => (upload.studentId === 10 ? { ...upload, resultToken: 'result-token-5' } : upload));
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    await user.click(await screen.findByRole('button', { name: 'Copiază linkul: Pop Ion' }));
    const field = await screen.findByLabelText('Linkul cu rezultatul elevului Pop Ion');
    expect(screen.getByText('Nu am putut copia linkul. Copiază-l de aici.')).toBeInTheDocument();
    expect(field).toHaveFocus();
    expect((field as HTMLInputElement).selectionEnd).toBe((field as HTMLInputElement).value.length);
  });
});
