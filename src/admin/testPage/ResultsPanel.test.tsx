import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClassReport, TestInfo, UploadRow } from '../../../shared/api.ts';
import { classCsv } from '../../../shared/csv.ts';
import { uploadStatusLabel } from '../../ui/format.ts';
import { createFakeApi, FAKE_MULTI_TOKEN, FAKE_STARTED_AT, FAKE_TOKEN, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { ApiError } from '../api.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import * as share from '../pdf/share.ts';

vi.mock('../pdf/share.ts', () => ({ saveFile: vi.fn(), shareFile: vi.fn() }));

const saveFile = vi.mocked(share.saveFile);

// The panel Rezultate of the test page (redesign spec §8, spec 2026-11-14).
const PAGE = '/tests/6E2-26T1#results';

// What the panel says under its heading: what each student gets.
const SENTENCE = 'Publici rezultatele. Fiecare elev vede pe linkul lui nota, punctele pe exerciții și explicațiile.';

// The switch on the band of the "Acum" box, which publishes every result.
const resultsSwitch = () => screen.getByRole('switch', { name: /^Rezultatele elevilor/ });

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
  it('says on a draft what the results wait for, and keeps the students and the report in their place', async () => {
    const nobody = graded().map(({ studentId, studentName }) => fakeUpload({ studentId, studentName }));
    renderAdmin(PAGE, apiWith({}, nobody));
    expect(await screen.findByRole('heading', { level: 2, name: 'Rezultate' })).toBeInTheDocument();
    expect(screen.getByText('Acum · nimic de publicat')).toBeInTheDocument();
    expect(screen.getByText('Rezultatele se publică după corectare')).toHaveClass('now-title');
    const needs = screen.getByRole('list', { name: 'Ce așteaptă etapa' });
    expect(within(needs).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Testul început urmează: nu încă: îl începi în ziua testuluiMergi la În clasă',
      'Lucrări corectate urmează: 0 din 3 elevi',
    ]);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Linkurile cu rezultatele elevilor' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Raportul clasei' })).getByText('Raportul clasei și CSV-ul apar după prima corectare.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Mergi la În clasă: Testul început' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'În clasă' })).toHaveFocus();
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
    expect(screen.getByText('Rezultatele se publică după corectare')).toHaveClass('now-title');
    expect(screen.getByText('0 din 3 elevi')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mergi la Corectare: Lucrări corectate' })).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    // A sent paper has its link before the grading; one still on the phone has none.
    expect(within(row('Pop Ion')).getByRole('button', { name: /^Fă linkul:/ })).toBeInTheDocument();
    expect(within(row('Pop Ion')).queryByRole('link', { name: /^Deschide rezultatul/ })).not.toBeInTheDocument();
    expect(within(row('Stan Eva')).queryByRole('link', { name: /^Deschide rezultatul/ })).not.toBeInTheDocument();
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
    expect(within(row('Pop Ion')).getByRole('link', { name: 'Pop Ion' })).toHaveAttribute('href', '/tests/6E2-26T1/papers/5');
    expect(within(row('Marin Dan')).queryByRole('link')).not.toBeInTheDocument();
    expect(within(row('Vlad Ana')).getByText('a plecat')).toBeInTheDocument();
  });

  it('publishes every result, and stops every link again', async () => {
    const api = apiWith({ status: 'done' }, graded());
    renderAdmin(PAGE, api);
    // The count is a label: grey while some wait, green once all are published.
    const count = await screen.findByText('0 publicate · 2 nepublicate');
    expect(count).toHaveClass('tag');
    expect(count).not.toHaveClass('tag-ok');
    expect(resultsSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(resultsSwitch()).toHaveTextContent('Nepublicate');
    await userEvent.click(resultsSwitch());
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', true);
    expect(await screen.findByText('2 elevi își pot vedea rezultatul')).toBeInTheDocument();
    expect(resultsSwitch()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('toate publicate')).toHaveClass('tag', 'tag-ok');
    // While all are published, a row cannot be stopped alone.
    expect(within(row('Pop Ion')).getByText('Publicat')).toHaveClass('tag', 'tag-ok');
    expect(screen.queryByRole('button', { name: /^Publică:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Oprește publicarea:/ })).not.toBeInTheDocument();

    await userEvent.click(resultsSwitch());
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', false);
    expect(await screen.findByText('2 rezultate gata de publicat')).toBeInTheDocument();
    expect(resultsSwitch()).toHaveAttribute('aria-checked', 'false');
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

  it('keeps the switch on while the results are open and nothing is graded, as after grading all again', async () => {
    const rows = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 2 })];
    renderAdmin(PAGE, apiWith({ status: 'evaluating', resultsOpen: true }, rows));
    expect(await screen.findByRole('switch', { name: /^Rezultatele elevilor/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Rezultatele sunt publicate.')).toBeInTheDocument();
    expect(screen.queryByText('Rezultatele se publică după corectare')).not.toBeInTheDocument();
  });

  it('says how many points still wait before the teacher publishes, with a link to Verificare', async () => {
    const rows = graded().map((upload) => (upload.studentId === 10 ? { ...upload, flagCount: 3 } : upload));
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    const link = await screen.findByRole('link', { name: 'Verificare' });
    expect(link.closest('p')).toHaveTextContent('Mai ai 3 puncte de verificat la etapa Verificare. Dacă publici acum, elevii văd punctajul de acum.');
    expect(link.closest('p')).toHaveClass('publish-wait');
  });

  it('copies the result link of a paper', async () => {
    const user = userEvent.setup();
    const rows = graded().map((upload) => (upload.studentId === 10 ? { ...upload, resultToken: 'result-token-5' } : upload));
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    await user.click(within(await screen.findByRole('row', { name: /^Pop Ion/ })).getByRole('button', { name: /^Copiază linkul:/ }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/u/result/result-token-5`);
    expect(within(row('Pop Ion')).getByRole('button', { name: 'Copiat!' })).toBeInTheDocument();
  });

  it("shows each paper's short code beside its link, and none for a paper without one", async () => {
    const rows = graded().map((upload) =>
      upload.studentId === 10 ? { ...upload, resultToken: 'result-token-5', resultCode: 'K7M92P' } : upload,
    );
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    const pop = await screen.findByRole('row', { name: /^Pop Ion/ });
    // "Codul" is for screen readers only.
    expect(within(pop).getByText('K7M-92P')).toHaveTextContent('Codul K7M-92P');
    expect(within(pop).getByText('Codul')).toHaveClass('sr-only');
    expect(within(row('Stan Eva')).queryByText(/^[2-9A-Z]{3}-[2-9A-Z]{3}$/)).not.toBeInTheDocument();
    // A student who sent nothing has neither.
    expect(within(row('Marin Dan')).getByText('Nu a trimis lucrarea.')).toBeInTheDocument();
  });

  it('makes the link of an older paper first, then copies it', async () => {
    const user = userEvent.setup();
    const api = apiWith({ status: 'done' }, graded());
    renderAdmin(PAGE, api);
    await user.click(within(await screen.findByRole('row', { name: /^Pop Ion/ })).getByRole('button', { name: /^Fă linkul:/ }));
    expect(api.getResultLink).toHaveBeenCalledWith(5, FAKE_STARTED_AT);
    await user.click(await within(row('Pop Ion')).findByRole('button', { name: /^Copiază linkul:/ }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/u/result/result-token-5`);
    // The link just made opens too.
    expect(within(row('Pop Ion')).getByRole('link', { name: 'Deschide rezultatul: Pop Ion' })).toHaveAttribute(
      'href',
      `${window.location.origin}/u/result/result-token-5`,
    );
  });

  it("opens a student's result page in a new tab, published or not", async () => {
    const rows = graded().map((upload) =>
      upload.studentId === 10 ? { ...upload, resultToken: 't10', resultsOpen: true } : upload.studentId === 11 ? { ...upload, resultToken: 't11' } : upload,
    );
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    await screen.findByRole('table', { name: 'Linkurile cu rezultatele elevilor' });
    for (const [name, token] of [
      ['Pop Ion', 't10'],
      ['Stan Eva', 't11'],
    ]) {
      const open = within(row(name!)).getByRole('link', { name: `Deschide rezultatul: ${name}` });
      expect(open).toHaveTextContent('Deschide');
      expect(open).toHaveAttribute('href', `${window.location.origin}/u/result/${token}`);
      expect(open).toHaveAttribute('target', '_blank');
      // The student's page never learns the teacher's address (Rybbit counts it).
      expect(open).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('shows the link in a field when the browser refuses to copy it', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('Refuzat', 'NotAllowedError'));
    const rows = graded().map((upload) => (upload.studentId === 10 ? { ...upload, resultToken: 'result-token-5' } : upload));
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    await user.click(within(await screen.findByRole('row', { name: /^Pop Ion/ })).getByRole('button', { name: /^Copiază linkul:/ }));
    expect(await screen.findByLabelText('Linkul cu rezultatul elevului Pop Ion')).toHaveValue(
      `${window.location.origin}/u/result/result-token-5`,
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
    expect(open).toHaveAttribute('href', '/tests/6E2-26T1/report');
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
    expect(field).toHaveAccessibleDescription('Nu am putut copia linkul. Copiază-l de aici.');
    expect(field).toHaveFocus();
    expect((field as HTMLInputElement).selectionEnd).toBe((field as HTMLInputElement).value.length);
  });
});

describe('the panel Rezultate, where students find their results', () => {
  const ways = () => within(screen.getByRole('region', { name: /^Cum își (vor )?v(ăd|edea) elevii rezultatul$/ }));

  it('says on an orange band that the results wait, with the points still to check, and how students will see them', async () => {
    const rows = graded().map((upload) => (upload.studentId === 10 ? { ...upload, flagCount: 2 } : upload));
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    const toggle = await screen.findByRole('switch', { name: /^Rezultatele elevilor/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle.closest('.uploads-band')).toHaveClass('is-shut');
    expect(screen.getByText('Rezultatele nu sunt publicate.')).toBeInTheDocument();
    expect(screen.getByText('2 rezultate gata de publicat')).toHaveClass('now-title');
    expect(document.querySelector('.publish-wait')).toHaveTextContent('Mai ai 2 puncte de verificat la etapa Verificare.');
    expect(screen.getByRole('heading', { level: 3, name: 'Cum își vor vedea elevii rezultatul' })).toBeInTheDocument();
    // No QR code and no address on the page: the QR code opens in a window.
    expect(screen.queryByTitle('Codul QR al linkului')).not.toBeInTheDocument();
  });

  it('says what a publish does when no point waits', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done' }, graded()));
    expect(await screen.findByText('Când le publici, fiecare elev își vede rezultatul pe linkul lui.')).toBeInTheDocument();
  });

  it('names the two ways and their cases, as the teacher finds the links and codes in "Elevii"', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true }, graded()));
    expect(await screen.findByRole('heading', { level: 3, name: 'Cum își văd elevii rezultatul' })).toBeInTheDocument();
    const items = ways().getAllByRole('listitem').filter((item) => item.parentElement?.classList.contains('ways'));
    expect(items.map((item) => item.querySelector('.ways-text > strong')?.textContent)).toEqual([
      'Cu linkul sau biletul primit după trimitere',
      'Cu linkul sau codul QR al testului',
    ]);
    expect(within(items[0]!).getByText(/elevii primesc pe telefon linkul rezultatului și biletul cu rezultatul/)).toBeInTheDocument();
    expect(within(items[0]!).getByText(/Linkul fiecărui elev îl ai și tu, în tabelul „Elevii” de mai jos/)).toBeInTheDocument();
    expect(within(items[1]!).getByText('De pe telefonul cu care au trimis:').closest('span')).toHaveTextContent(
      'De pe telefonul cu care au trimis: ajung direct la rezultat. Linkul rezultatului s-a salvat singur pe telefon.',
    );
    expect(within(items[1]!).getByText('De pe alt telefon sau calculator:').closest('span')).toHaveTextContent(
      'De pe alt telefon sau calculator: scriu codul de pe bilet. Codul fiecărui elev îl găsești în tabelul „Elevii” de mai jos.',
    );
    expect(screen.getByText('Dacă oprești rezultatele, linkurile cu rezultate și pozele lor nu se mai deschid până le publici din nou.')).toBeInTheDocument();
  });

  it("copies the test's link for the students", async () => {
    const user = userEvent.setup();
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true }, graded()));
    await screen.findByRole('heading', { level: 3, name: 'Cum își văd elevii rezultatul' });
    await user.click(ways().getByRole('button', { name: 'Copiază linkul' }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(ways().getByRole('status')).toHaveTextContent('Copiat!');
  });

  it('says to show the QR code when the browser refuses to copy', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('Refuzat', 'NotAllowedError'));
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true }, graded()));
    await screen.findByRole('heading', { level: 3, name: 'Cum își văd elevii rezultatul' });
    await user.click(ways().getByRole('button', { name: 'Copiază linkul' }));
    expect(await ways().findByRole('status')).toHaveTextContent('Nu am putut copia. Arată codul QR: linkul e sub el.');
  });

  it('switches at once while the publish saves, and goes back with the error when it fails', async () => {
    const api = apiWith({ status: 'done' }, graded());
    let refuse: (error: unknown) => void = () => undefined;
    api.setResultsOpen.mockImplementationOnce(() => new Promise((_, reject) => (refuse = reject)));
    renderAdmin(PAGE, api);
    const toggle = await screen.findByRole('switch', { name: /^Rezultatele elevilor/ });
    await userEvent.click(toggle);
    // Before any answer: the switch and the band already say "Publicate".
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Rezultatele sunt publicate.')).toBeInTheDocument();
    refuse(new ApiError(409, 'archived', 'Testul este arhivat.'));
    expect(await screen.findByText('Testul este arhivat.')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('says when only some results are published, and publishes them all with the switch', async () => {
    const api = apiWith({ status: 'done', publishedCount: 1 }, graded());
    renderAdmin(PAGE, api);
    expect(await screen.findByText('1 rezultat publicat.')).toBeInTheDocument();
    expect(screen.getByText('1 elev își poate vedea rezultatul')).toHaveClass('now-title');
    expect(resultsSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('heading', { level: 3, name: 'Cum își văd elevii rezultatul' })).toBeInTheDocument();
    await userEvent.click(resultsSwitch());
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', true);
  });

  it('says how many points still wait while only some results are published', async () => {
    const rows = graded().map((upload) => (upload.studentId === 10 ? { ...upload, flagCount: 2 } : upload));
    renderAdmin(PAGE, apiWith({ status: 'done', publishedCount: 1 }, rows));
    await screen.findByText('1 rezultat publicat.');
    expect(document.querySelector('.publish-wait')).toHaveTextContent('Mai ai 2 puncte de verificat la etapa Verificare.');
  });

  it("gives no teacher's multi-upload link in Rezultate", async () => {
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true, multiUploadToken: FAKE_MULTI_TOKEN }, graded()));
    await screen.findByRole('heading', { level: 3, name: 'Cum își văd elevii rezultatul' });
    expect(screen.queryByText(/doar pentru tine/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nu da acest link elevilor/)).not.toBeInTheDocument();
  });

  it('names the second way without its buttons when the test has no link', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true, uploadToken: null }, graded()));
    await screen.findByRole('heading', { level: 3, name: 'Cum își văd elevii rezultatul' });
    expect(ways().getByText('Cu linkul sau codul QR al testului')).toBeInTheDocument();
    expect(ways().queryByRole('button', { name: 'Copiază linkul' })).not.toBeInTheDocument();
    expect(ways().queryByRole('button', { name: 'Arată codul QR' })).not.toBeInTheDocument();
    expect(resultsSwitch()).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the QR code in a window, then on the whole screen, and gives the focus back to its button', async () => {
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true }, graded()));
    await screen.findByRole('heading', { level: 3, name: 'Cum își văd elevii rezultatul' });
    const show = ways().getByRole('button', { name: 'Arată codul QR' });
    await userEvent.click(show);
    const window_ = screen.getByRole('dialog', { name: 'Linkul testului pentru elevi' });
    expect(within(window_).getByText(`${window.location.origin}/u/${FAKE_TOKEN}`)).toBeInTheDocument();
    expect(within(window_).getByTitle('Codul QR al linkului')).toBeInTheDocument();
    await userEvent.click(within(window_).getByRole('button', { name: 'Pe tot ecranul' }));
    const big = screen.getByRole('dialog', { name: 'Codul QR pentru elevi' });
    await userEvent.click(within(big).getByRole('button', { name: 'Închide' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(show).toHaveFocus();
  });

  it("downloads the students' QR code as a PNG file from its window", async () => {
    const png = new Blob(['png'], { type: 'image/png' });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function (callback: BlobCallback) {
        callback(png);
      });
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true }, graded()));
    await screen.findByRole('heading', { level: 3, name: 'Cum își văd elevii rezultatul' });
    await userEvent.click(ways().getByRole('button', { name: 'Arată codul QR' }));
    const window_ = screen.getByRole('dialog', { name: 'Linkul testului pentru elevi' });
    await userEvent.click(within(window_).getByRole('button', { name: 'Descarcă codul QR' }));
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledWith(png, 'cod-qr-elevi-6E2-26T1.png'));
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
  });

  it('says so when the QR code cannot be made', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback: BlobCallback) {
      callback(null);
    });
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true }, graded()));
    await screen.findByRole('heading', { level: 3, name: 'Cum își văd elevii rezultatul' });
    await userEvent.click(ways().getByRole('button', { name: 'Arată codul QR' }));
    const window_ = screen.getByRole('dialog', { name: 'Linkul testului pentru elevi' });
    await userEvent.click(within(window_).getByRole('button', { name: 'Descarcă codul QR' }));
    expect(await within(window_).findByText('Nu am putut descărca codul QR.')).toBeInTheDocument();
    expect(saveFile).not.toHaveBeenCalled();
  });
});

describe('the panel Rezultate in the states the first review found', () => {
  it('says the papers are graded again when the results are open and none is graded now', async () => {
    const rows = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 2 })];
    renderAdmin(PAGE, apiWith({ status: 'evaluating', resultsOpen: true }, rows));
    expect(await screen.findByText('Nicio lucrare nu e corectată acum')).toHaveClass('now-title');
    expect(screen.getByText('Lucrările se corectează din nou. Fiecare elev își vede rezultatul după ce lucrarea lui e corectată.')).toBeInTheDocument();
    expect(screen.queryByText(/0 elevi își pot/)).not.toBeInTheDocument();
  });

  it('gives the focus to the heading when stopping leaves nothing to manage', async () => {
    const rows = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 2 })];
    renderAdmin(PAGE, apiWith({ status: 'evaluating', resultsOpen: true }, rows));
    await userEvent.click(await screen.findByRole('switch', { name: /^Rezultatele elevilor/ }));
    expect(await screen.findByText('Rezultatele se publică după corectare')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Rezultate' })).toHaveFocus();
  });

  it('keeps the students table in step with the switch while it saves, and ignores a second click', async () => {
    const api = apiWith({ status: 'done' }, graded());
    api.setResultsOpen.mockImplementationOnce(() => new Promise(() => undefined));
    renderAdmin(PAGE, api);
    expect(await within(await screen.findByRole('row', { name: /^Pop Ion/ })).findByRole('button', { name: 'Publică: Pop Ion' })).toBeInTheDocument();
    await userEvent.click(resultsSwitch());
    // Before any answer, every sent paper shows as published, as after the save.
    expect(within(row('Pop Ion')).getByText('Publicat')).toBeInTheDocument();
    expect(within(row('Stan Eva')).getByText('Publicat')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Publică:/ })).not.toBeInTheDocument();
    expect(screen.getByText('toate publicate')).toHaveClass('tag-ok');
    await userEvent.click(resultsSwitch());
    expect(api.setResultsOpen).toHaveBeenCalledTimes(1);
  });

  it('says on a draft that the test has not started, not that a student sent nothing', async () => {
    const nobody = graded().map(({ studentId, studentName }) => fakeUpload({ studentId, studentName }));
    renderAdmin(PAGE, apiWith({}, nobody));
    expect(await within(await screen.findByRole('row', { name: /^Pop Ion/ })).findByText('Testul nu a început.')).toBeInTheDocument();
    expect(screen.queryByText('Nu a trimis lucrarea.')).not.toBeInTheDocument();
  });
});

describe('the panel Rezultate after the second review', () => {
  it('does not say the papers are graded again on a done test with none graded', async () => {
    const rows = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'failed', fileCount: 2 })];
    renderAdmin(PAGE, apiWith({ status: 'done', resultsOpen: true }, rows));
    expect(await screen.findByText('Nicio lucrare nu e corectată acum')).toHaveClass('now-title');
    expect(screen.getByText('Când o lucrare e corectată, elevul își vede rezultatul pe linkul lui.')).toBeInTheDocument();
    expect(screen.queryByText(/se corectează din nou/)).not.toBeInTheDocument();
  });

  it('leaves the focus alone when the results stop from elsewhere', async () => {
    const rows = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 2 })];
    const api = apiWith({ status: 'evaluating', resultsOpen: true }, rows);
    const { queryClient } = renderAdmin(PAGE, api);
    await screen.findByRole('switch', { name: /^Rezultatele elevilor/ });
    // Another tab stops them; this page reads the test again.
    await api.setResultsOpen('6E2-26T1', false);
    await queryClient.invalidateQueries({ queryKey: ['test', '6E2-26T1'] });
    expect(await screen.findByText('Rezultatele se publică după corectare')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Rezultate' })).not.toHaveFocus();
  });
});
