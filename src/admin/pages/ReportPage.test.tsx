import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ClassReport } from '../../../shared/api.ts';
import { createFakeApi, fakeSettings, fakeTest } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { currentPart } from './ReportPage.tsx';

const ANALYSIS = {
  overview: 'Clasa a lucrat bine la fracții.',
  strengths: ['Fracții echivalente'],
  weaknesses: [],
  commonMistakes: ['Semnul la mutarea termenilor'],
  recommendations: ['Mai multe ecuații'],
};

function report(overrides: Partial<ClassReport> = {}): ClassReport {
  return {
    test: { code: '6E2-26T1', title: 'Fracții', classId: 1, className: '6E2', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
    cesExercises: null,
    exercises: [
      { id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 4.5 },
      { id: 'II.1', label: 'Subiectul II, exercițiul 1', maxPoints: 4.5 },
    ],
    rows: [
      {
        submissionId: 5,
        studentId: 10,
        studentName: 'Avram Dan', active: true,
        total: 10,
        maxTotal: 10,
        grade: 10,
        flagCount: 0, ces: false, variant: 'class',
        items: [
          { exerciseId: 'I.1', points: 4.5, maxPoints: 4.5, flagged: false },
          { exerciseId: 'II.1', points: 4.5, maxPoints: 4.5, flagged: false },
        ],
      },
      {
        submissionId: 6,
        studentId: 11,
        studentName: 'Pop Ion', active: true,
        total: 5.5,
        maxTotal: 10,
        grade: 5.5,
        flagCount: 2, ces: false, variant: 'class',
        items: [
          { exerciseId: 'I.1', points: 4.5, maxPoints: 4.5, flagged: false },
          { exerciseId: 'II.1', points: 0, maxPoints: 4.5, flagged: true },
        ],
      },
    ],
    missing: [{ studentId: 12, studentName: 'Stan Eva', status: 'none', ces: false }],
    analysis: { status: 'ready', stale: false, attempts: 0, content: ANALYSIS },
    ...overrides,
  };
}

const apiWith = (value: ClassReport = report()) =>
  createFakeApi({
    classes: [],
    students: {},
    tests: [fakeTest({ status: 'done', gradedCount: 2 })],
    reports: { '6E2-26T1': value },
  });

describe('ReportPage with CES papers', () => {
  const cesRow = {
    ...report().rows[0]!,
    submissionId: 7,
    studentId: 13,
    studentName: 'Bursașiu Teodor',
    ces: true,
    variant: 'ces' as const,
    total: 9,
    grade: 9,
    items: [{ exerciseId: 'C1', points: 8, maxPoints: 9, flagged: false }],
  };

  it('shows the CES papers in a table of their own, with the mark, when their exercises differ', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith(report({ cesExercises: [{ id: 'C1', label: 'Exercițiul CES 1', maxPoints: 9 }], rows: [...report().rows, cesRow] })));
    const results = within(await screen.findByRole('region', { name: 'Rezultatele elevilor' }));
    const tables = results.getAllByRole('table');
    expect(tables).toHaveLength(2);
    expect(within(tables[0]!).queryByText('Bursașiu Teodor')).not.toBeInTheDocument();
    expect(results.getByRole('heading', { level: 3, name: 'Varianta CES' })).toBeInTheDocument();
    const ces = within(tables[1]!);
    expect(ces.getByRole('columnheader', { name: /C1/ })).toBeInTheDocument();
    const row = ces.getByRole('rowheader', { name: /Bursașiu Teodor/ });
    expect(within(row).getByText('CES')).toBeInTheDocument();
    const exercises = within(screen.getByRole('region', { name: 'Pe exerciții' }));
    expect(exercises.getAllByRole('table')).toHaveLength(2);
    expect(exercises.getByRole('rowheader', { name: 'Exercițiul CES 1' })).toBeInTheDocument();
  });

  it('keeps one table, with the mark, when the CES papers share the class columns', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith(report({ rows: [...report().rows, { ...cesRow, items: report().rows[0]!.items }] })));
    const results = within(await screen.findByRole('region', { name: 'Rezultatele elevilor' }));
    expect(results.getAllByRole('table')).toHaveLength(1);
    expect(results.queryByRole('heading', { name: 'Varianta CES' })).not.toBeInTheDocument();
    expect(within(results.getByRole('rowheader', { name: /Bursașiu Teodor/ })).getByText('CES')).toBeInTheDocument();
  });
});

describe('ReportPage', () => {
  it('names the test, its class and its date, and leads back to the test', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    expect(await screen.findByRole('heading', { level: 1, name: 'Raportul clasei' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Fracții' })).toHaveAttribute('href', '/teste/6E2-26T1');
    const line = screen.getByText(/^Fracții ·/);
    expect(line).toHaveTextContent('Fracții · Clasa 6E2 · 6 octombrie 2026');
    expect(within(line).getByRole('link', { name: 'Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
  });

  it('lists the parts of the report with their counts, the first one marked', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    const parts = within(await screen.findByRole('navigation', { name: 'Părțile raportului' }));
    const links = parts.getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Pe scurt', '#pe-scurt'],
      ['Rezultatele elevilor3', '#rezultate'],
      ['Pe exerciții2', '#exercitii'],
      ['Analiza clasei', '#analiza'],
    ]);
    expect(links[0]).toHaveAttribute('aria-current', 'true');
    for (const id of ['pe-scurt', 'rezultate', 'exercitii', 'analiza']) expect(document.getElementById(id)).not.toBeNull();
  });

  it('shows the numbers of the class in "Pe scurt"', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    const tiles = within(await screen.findByRole('region', { name: 'Pe scurt' }));
    expect(tiles.getByText('Media testului').nextSibling).toHaveTextContent('7,75');
    expect(tiles.getByText('Mediana').nextSibling).toHaveTextContent('7,75');
    expect(tiles.getByText('Cea mai mică notă').nextSibling).toHaveTextContent('5,5');
    expect(tiles.getByText('Cea mai mare notă').nextSibling).toHaveTextContent('10');
    expect(tiles.getByText('Corectate').nextSibling).toHaveTextContent('2 din 3 elevi de verificat 2');
  });

  it('shows a row per student, the items to check marked, and the students with no paper', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    const results = within(await screen.findByRole('region', { name: 'Rezultatele elevilor' }));
    expect(results.getByText('2 din 3 elevi')).toBeInTheDocument();
    const table = results.getByRole('table', { name: 'Punctajele elevilor pe exerciții' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['Avram Dan', 'Pop Ion', 'Stan Eva']);
    expect(within(rows[1]!).getByRole('link', { name: 'Pop Ion' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/6');
    const flagged = within(rows[1]!).getByText('(de verificat)').closest('td')!;
    expect(flagged).toHaveClass('flagged-cell');
    expect(within(rows[0]!).queryByText('(de verificat)')).not.toBeInTheDocument();
    expect(within(rows[2]!).getByRole('cell')).toHaveTextContent('Nu a trimis lucrarea.');
    expect(within(rows[2]!).getByRole('cell')).toHaveAttribute('colspan', '4');
    expect(screen.queryByRole('region', { name: 'Fără rezultat' })).not.toBeInTheDocument();
  });

  it('says why a student with a paper has no result yet', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith(report({ missing: [{ studentId: 12, studentName: 'Stan Eva', status: 'submitted', ces: false }] })));
    const table = await screen.findByRole('table', { name: 'Punctajele elevilor pe exerciții' });
    const row = within(table).getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!;
    expect(within(row).getByRole('cell')).toHaveTextContent('Trimis');
  });

  it('puts the points of each exercise first, with its maximum, then the total and the grade', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    const table = await screen.findByRole('table', { name: 'Punctajele elevilor pe exerciții' });
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Elev',
      'I.14,5p',
      'II.14,5p',
      'Total',
      'Nota',
    ]);
    const row = within(table).getAllByRole('row')[2]!;
    const cells = within(row).getAllByRole('cell');
    expect(cells).toHaveLength(4);
    expect(cells[2]).toHaveTextContent('5,5 / 10');
    expect(cells[3]).toHaveTextContent('5,5');
    expect(cells[3]).toHaveTextContent('de verificat 2');
  });

  it('has no Model column, even when the Model setting is on', async () => {
    const api = createFakeApi({
      classes: [],
      students: {},
      tests: [{ ...fakeTest({ status: 'done', gradedCount: 2 }), showModel: true }],
      reports: { '6E2-26T1': report() },
      settings: fakeSettings({ showModelColumn: true }),
    });
    renderAdmin('/teste/6E2-26T1/raport', api);
    const table = await screen.findByRole('table', { name: 'Punctajele elevilor pe exerciții' });
    expect(within(table).queryByRole('columnheader', { name: 'Model' })).not.toBeInTheDocument();
    expect(screen.queryByText(/claude-/)).not.toBeInTheDocument();
  });

  it('has the buttons for the PDF, the CSV, and sharing, only when something is graded', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    expect(await screen.findByRole('button', { name: 'Descarcă PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descarcă CSV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trimite' })).toBeInTheDocument();
  });

  it('has no buttons for a class with nothing graded', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith(report({ rows: [] })));
    expect(await screen.findByText('Nicio lucrare nu este corectată încă', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descarcă PDF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descarcă CSV' })).not.toBeInTheDocument();
  });

  it('shows the grade groups and the statistics of each exercise', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    const groups = await screen.findByRole('list', { name: 'Notele pe grupe' });
    const counts = within(groups)
      .getAllByRole('listitem')
      .map((item) => [item.firstChild!.textContent, item.lastChild!.textContent]);
    expect(counts).toEqual([
      ['1-4,99', '0'],
      ['5-6,99', '1'],
      ['7-8,99', '0'],
      ['9-10', '1'],
    ]);
    const exercises = within(screen.getByRole('region', { name: 'Pe exerciții' }));
    expect(exercises.getByText('2 exerciții')).toBeInTheDocument();
    const second = exercises.getAllByRole('row')[2]!;
    expect(within(second).getByRole('rowheader')).toHaveTextContent('Subiectul II, exercițiul 1');
    expect(within(second).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['2,25 din 4,5', '50%', '1', '0', '1']);
  });

  it('shows the analysis', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    expect(await screen.findByText('Clasa a lucrat bine la fracții.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Ce a mers bine' })).toHaveTextContent('Fracții echivalente');
    expect(screen.getByRole('region', { name: 'Greșeli frecvente' })).toHaveTextContent('Semnul la mutarea termenilor');
    // An empty list has no heading.
    expect(screen.queryByRole('region', { name: 'Ce a mers mai greu' })).not.toBeInTheDocument();
    expect(screen.queryByText('Analiza poate fi depășită', { exact: false })).not.toBeInTheDocument();
  });

  it('says that an analysis may be out of date, and asks for a new one', async () => {
    const api = apiWith(report({ analysis: { status: 'ready', stale: true, attempts: 0, content: ANALYSIS } }));
    renderAdmin('/teste/6E2-26T1/raport', api);
    expect(await screen.findByText('Analiza poate fi depășită', { exact: false })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Regenerează' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Regenerează' }));
    expect(api.regenerateAnalysis).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByText('Nu am putut porni robotul.', { exact: false })).toBeInTheDocument();
  });

  it('says when the robot writes the analysis, and when it could not', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith(report({ analysis: { status: 'requested', stale: false, attempts: 0, content: null } })));
    expect(await screen.findByText('Robotul scrie analiza clasei.', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerează' })).not.toBeInTheDocument();
  });

  it('says that the last attempt failed and keeps the Regenerează button, when an attempt failed and the analysis is still requested', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith(report({ analysis: { status: 'requested', stale: false, attempts: 1, content: null } })));
    expect(
      await screen.findByText('Ultima încercare a eșuat. Robotul va încerca din nou la următoarea rulare.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Robotul scrie analiza clasei.', { exact: false })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerează' })).toBeInTheDocument();
  });

  it('says that the analysis waits for the next evaluation of a reopened test, with no buttons', async () => {
    const reopened = report({
      test: { code: '6E2-26T1', title: 'Fracții', classId: 1, className: '6E2', status: 'open', startedAt: '2026-10-06T07:15:00.000Z' },
      analysis: { status: 'requested', stale: false, attempts: 0, content: null },
    });
    renderAdmin('/teste/6E2-26T1/raport', apiWith(reopened));
    expect(await screen.findByText('Analiza se scrie după ce testul este corectat din nou.')).toBeInTheDocument();
    expect(screen.queryByText('Robotul scrie analiza clasei.', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerează' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fă analiza clasei' })).not.toBeInTheDocument();
  });

  it('marks the last part whose top passed the upper third, and the last part at the end of the page', () => {
    const at = (top: number, height = 400) => ({ top, height }) as DOMRect;
    // A screen 900px tall: the line is at 300px.
    expect(currentPart([at(-500), at(250), at(700), at(1400)], 900, false)).toBe('rezultate');
    expect(currentPart([at(-500), at(-100), at(299), at(1400)], 900, false)).toBe('exercitii');
    expect(currentPart([at(100), at(600), at(1200), at(1800)], 900, false)).toBe('pe-scurt');
    // A short last part at the end of the page never reaches the line.
    expect(currentPart([at(-900), at(-600), at(-200), at(500, 120)], 900, true)).toBe('analiza');
    // Not laid out (no height): nothing passed.
    expect(currentPart([at(0, 0), at(0, 0), at(0, 0), at(0, 0)], 900, true)).toBe('pe-scurt');
  });

  it('offers the first analysis of a test graded before analyses existed', async () => {
    const api = apiWith(report({ analysis: { status: 'none', stale: false, attempts: 0, content: null } }));
    renderAdmin('/teste/6E2-26T1/raport', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Fă analiza clasei' }));
    expect(api.regenerateAnalysis).toHaveBeenCalledWith('6E2-26T1');
  });

  it('offers a new try after a failed analysis', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith(report({ analysis: { status: 'failed', stale: false, attempts: 0, content: null } })));
    expect(await screen.findByText('Robotul nu a putut scrie analiza clasei.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerează' })).toBeInTheDocument();
  });

  it('keeps the table of a wide test in a scrolling box, one column for each exercise', async () => {
    const exercises = Array.from({ length: 40 }, (_, index) => ({ id: `E${index + 1}`, label: `Exercițiul ${index + 1}`, maxPoints: 1 }));
    const wide = report({
      exercises,
      rows: [
        {
          submissionId: 5,
          studentId: 10,
          studentName: 'Avram Dan', active: true,
          total: 40,
          maxTotal: 40,
          grade: 10,
          flagCount: 0, ces: false, variant: 'class',
          items: exercises.map((exercise) => ({ exerciseId: exercise.id, points: 1, maxPoints: 1, flagged: false })),
        },
      ],
      missing: [],
    });
    renderAdmin('/teste/6E2-26T1/raport', apiWith(wide));
    const table = await screen.findByRole('table', { name: 'Punctajele elevilor pe exerciții' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(43);
    expect(table.parentElement).toHaveClass('table-wrap');
  });

  it('says that nothing is graded yet, without tables', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith(report({ rows: [], analysis: { status: 'none', stale: false, attempts: 0, content: null } })));
    expect(await screen.findByText('Nicio lucrare nu este corectată încă', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fă analiza clasei' })).not.toBeInTheDocument();
  });

  it('shows the not-found page for a bad code and an error for an unknown test', async () => {
    renderAdmin('/teste/nu-este-cod/raport', apiWith());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });
});
