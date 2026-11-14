import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClassReport, TestInfo, UploadRow } from '../../../shared/api.ts';
import { classCsv } from '../../../shared/csv.ts';
import { uploadStatusLabel } from '../../ui/format.ts';
import { createFakeApi, FAKE_MULTI_TOKEN, FAKE_STARTED_AT, FAKE_TOKEN, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import * as share from '../pdf/share.ts';
import { STUDENT_ACCESS_HELP } from './StudentAccessCard.tsx';
import { MULTI_LABEL } from './UploadLink.tsx';

vi.mock('../pdf/share.ts', () => ({ saveFile: vi.fn(), shareFile: vi.fn() }));

const saveFile = vi.mocked(share.saveFile);

// The panel Rezultate of the test page (redesign spec §8, spec 2026-11-14).
const PAGE = '/teste/6E2-26T1#rezultate';

// What the panel says under its heading: what each student gets.
const SENTENCE =
  'După ce rezultatele sunt publicate, fiecare elev are acces la rezultatul lui: nota finală, punctele pe fiecare exercițiu, explicații detaliate pentru fiecare problemă rezolvată corect sau greșit și o sinteză finală cu ce merge bine și recomandări.';

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
    expect(screen.getByText('Când lucrările sunt corectate, le publici de aici; fiecare elev primește linkul lui, cu explicații detaliate pentru fiecare problemă și o sinteză finală cu ce merge bine și recomandări.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Mergi la Corectare' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Corectare' })).toHaveFocus();
    expect(screen.queryByRole('table', { name: 'Linkurile cu rezultatele elevilor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pentru tine' })).not.toBeInTheDocument();
  });

  it('says what each student gets, once, and offers no publish button before anything is graded', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 2 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
    ];
    renderAdmin(PAGE, apiWith({ status: 'evaluating' }, rows));
    expect(await screen.findByText(SENTENCE)).toBeInTheDocument();
    expect(screen.queryByText(/^Linkul arată nota/)).not.toBeInTheDocument();
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
    expect(within(screen.getByRole('region', { name: 'Raportul clasei' })).getByText('Raportul clasei și CSV-ul apar după prima corectare.')).toBeInTheDocument();
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

  it('shows each grade in a chip of its grade colour, with the points to check apart, and nothing in bold', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9.5, total: 95, maxTotal: 100, flagCount: 2 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 4, total: 40, maxTotal: 100 }),
      fakeUpload({ studentId: 12, studentName: 'Marin Dan', submissionId: 7, status: 'graded', fileCount: 1, grade: 2, total: 20, maxTotal: 100 }),
    ];
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    const table = await screen.findByRole('table', { name: 'Linkurile cu rezultatele elevilor' });
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Elev', 'Nota', 'Punctaj', 'Linkul cu rezultatul', 'Stare']);
    expect(within(row('Pop Ion')).getByText('9,5')).toHaveClass('grade-chip', 'points-5');
    expect(within(row('Pop Ion')).getByText('2 de verificat')).toHaveClass('points-pill');
    expect(within(row('Stan Eva')).getByText('4')).toHaveClass('grade-chip', 'points-2');
    expect(within(row('Stan Eva')).queryByText(/de verificat/)).not.toBeInTheDocument();
    expect(within(row('Marin Dan')).getByText('2')).toHaveClass('grade-chip', 'points-1');
    expect(table.querySelector('strong, b')).toBeNull();
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

  it('shows "Raportul clasei" once a paper is graded: the average in its colour, the grades by group, the report, and the CSV', async () => {
    const rows = [...graded(), fakeUpload({ studentId: 13, studentName: 'Vlad Ana', active: false, submissionId: 7, status: 'graded', fileCount: 1, grade: 4 })];
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    const card = await screen.findByRole('region', { name: 'Raportul clasei' });
    expect(within(card).getByText('7')).toHaveClass('report-card-grade', 'points-4');
    expect(within(card).getByText('media testului · 2 din 3 elevi corectați')).toBeInTheDocument();
    // Every graded paper counts in its group, the one of a student who left too.
    const groups = within(card).getByRole('list', { name: 'Notele pe grupe' });
    expect(within(groups).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['1-4,991', '5-6,990', '7-8,991', '9-101']);
    expect(groups.querySelector('.bar-1')).toHaveStyle({ width: '100%' });
    expect(groups.querySelector('.bar-3')).toHaveStyle({ width: '0%' });
    const open = within(card).getByRole('link', { name: 'Deschide raportul' });
    expect(open).toHaveAttribute('href', '/teste/6E2-26T1/raport');
    expect(open).toHaveClass('button');
    expect(open).toHaveTextContent(/^Deschide raportul$/);
    expect(within(card).getByRole('button', { name: 'CSV pentru catalog' })).toHaveClass('text-button', 'is-quiet');
    expect(screen.queryByRole('heading', { name: 'Pentru tine' })).not.toBeInTheDocument();
    expect(screen.queryByText(/^PDF-ul cu rezultatul unui elev/)).not.toBeInTheDocument();
  });

  it('puts "Raportul clasei" before the students in the page, and says when it comes before any grading', async () => {
    const rows = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 2 })];
    renderAdmin(PAGE, apiWith({ status: 'evaluating', resultsOpen: true }, rows));
    const card = await screen.findByRole('region', { name: 'Raportul clasei' });
    expect(within(card).getByText('Raportul clasei și CSV-ul apar după prima corectare.')).toBeInTheDocument();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Linkurile cu rezultatele elevilor' });
    expect(table.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Elevii' })).toBeInTheDocument();
  });

  it('downloads the CSV of the class report', async () => {
    const report: ClassReport = {
      test: { code: '6E2-26T1', title: 'Fracții', classId: 1, className: '6E2', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
      cesExercises: null,
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
          flagCount: 0, ces: false, variant: 'class',
          items: [{ exerciseId: 'I.1', points: 4.5, maxPoints: 4.5, flagged: false }],
        },
      ],
      missing: [{ studentId: 12, studentName: 'Marin Dan', status: 'none', ces: false }],
      analysis: { status: 'none', stale: false, attempts: 0, content: null },
    };
    const api = apiWith({ status: 'done' }, graded(), { '6E2-26T1': report });
    renderAdmin(PAGE, api);
    await userEvent.click(await screen.findByRole('button', { name: 'CSV pentru catalog' }));
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    expect(api.getReport).toHaveBeenCalledWith('6E2-26T1');
    const [blob, fileName] = saveFile.mock.calls[0]!;
    expect(fileName).toBe('6E2-26T1-raport.csv');
    // The BOM stays: Excel reads the diacritics by it.
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(await blob.arrayBuffer())).toBe(classCsv(report, uploadStatusLabel));
  });

  it('says why the CSV could not be made', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done' }, graded()));
    await userEvent.click(await screen.findByRole('button', { name: 'CSV pentru catalog' }));
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

describe('the panel Rezultate, where students find their results', () => {
  const card = () => screen.getByRole('region', { name: 'Rezultatele sunt gata pentru elevi' });

  it('shows no card before the results are published', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done' }, graded()));
    expect(await screen.findByRole('button', { name: 'Publică toate rezultatele' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Rezultatele sunt gata pentru elevi' })).not.toBeInTheDocument();
  });

  it("shows the students' link and the help once published, and no teacher link when there is none", async () => {
    renderAdmin(PAGE, apiWith({ status: 'done' }, graded()));
    await userEvent.click(await screen.findByRole('button', { name: 'Publică toate rezultatele' }));
    expect(await screen.findByRole('region', { name: 'Rezultatele sunt gata pentru elevi' })).toBeInTheDocument();
    expect(within(card()).getByLabelText('Linkul pentru elevi: trimite-l clasei')).toHaveValue(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(within(card()).getByTitle('Codul QR al linkului')).toBeInTheDocument();
    expect(within(card()).getByText(STUDENT_ACCESS_HELP)).toBeInTheDocument();
    expect(within(card()).queryByLabelText(MULTI_LABEL)).not.toBeInTheDocument();

    // Stopping the access takes the card away again.
    await userEvent.click(screen.getByRole('button', { name: 'Oprește accesul la rezultate' }));
    expect(await screen.findByRole('button', { name: 'Publică toate rezultatele' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Rezultatele sunt gata pentru elevi' })).not.toBeInTheDocument();
  });

  it('names the multi-upload link as the teacher’s, with no QR code', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true, multiUploadToken: FAKE_MULTI_TOKEN }, graded()));
    await screen.findByRole('region', { name: 'Rezultatele sunt gata pentru elevi' });
    expect(within(card()).getByLabelText(MULTI_LABEL)).toHaveValue(`${window.location.origin}/u/${FAKE_MULTI_TOKEN}`);
    expect(within(card()).getByText('Nu-l da elevilor: pe acest link ei nu își găsesc rezultatele.')).toBeInTheDocument();
    // One QR code only: the students'.
    expect(within(card()).getAllByTitle('Codul QR al linkului')).toHaveLength(1);
  });

  it('shows the card when one result is published alone', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done', publishedCount: 1 }, graded()));
    expect(await screen.findByRole('region', { name: 'Rezultatele sunt gata pentru elevi' })).toBeInTheDocument();
  });

  it("downloads the students' QR code as a PNG file", async () => {
    const png = new Blob(['png'], { type: 'image/png' });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function (callback: BlobCallback) {
        callback(png);
      });
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true }, graded()));
    await screen.findByRole('region', { name: 'Rezultatele sunt gata pentru elevi' });
    await userEvent.click(within(card()).getByRole('button', { name: 'Descarcă codul QR' }));
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledWith(png, 'cod-qr-elevi-6E2-26T1.png'));
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(within(card()).getByRole('button', { name: 'Descarcă codul QR' })).toBeEnabled();
  });

  it('says so when the QR code cannot be made', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback: BlobCallback) {
      callback(null);
    });
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true }, graded()));
    await screen.findByRole('region', { name: 'Rezultatele sunt gata pentru elevi' });
    await userEvent.click(within(card()).getByRole('button', { name: 'Descarcă codul QR' }));
    expect(await within(card()).findByText('Nu am putut descărca codul QR.')).toBeInTheDocument();
    expect(saveFile).not.toHaveBeenCalled();
  });
});
