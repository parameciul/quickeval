import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ClassReport } from '../../../shared/api.ts';
import { createFakeApi, fakeTest } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { reportRefreshInterval } from './ReportPage.tsx';

const ANALYSIS = {
  overview: 'Clasa a lucrat bine la fracții.',
  strengths: ['Fracții echivalente'],
  weaknesses: [],
  commonMistakes: ['Semnul la mutarea termenilor'],
  recommendations: ['Mai multe ecuații'],
};

function report(overrides: Partial<ClassReport> = {}): ClassReport {
  return {
    test: { code: '6E2-26T1', title: 'Fracții', className: '6E2', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
    exercises: [
      { id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 4.5 },
      { id: 'II.1', label: 'Subiectul II, exercițiul 1', maxPoints: 4.5 },
    ],
    rows: [
      {
        submissionId: 5,
        studentId: 10,
        studentName: 'Avram Dan',
        total: 10,
        maxTotal: 10,
        grade: 10,
        flagCount: 0,
        items: [
          { exerciseId: 'I.1', points: 4.5, maxPoints: 4.5, flagged: false },
          { exerciseId: 'II.1', points: 4.5, maxPoints: 4.5, flagged: false },
        ],
      },
      {
        submissionId: 6,
        studentId: 11,
        studentName: 'Pop Ion',
        total: 5.5,
        maxTotal: 10,
        grade: 5.5,
        flagCount: 2,
        items: [
          { exerciseId: 'I.1', points: 4.5, maxPoints: 4.5, flagged: false },
          { exerciseId: 'II.1', points: 0, maxPoints: 4.5, flagged: true },
        ],
      },
    ],
    missing: [{ studentId: 12, studentName: 'Stan Eva', status: 'none' }],
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

describe('ReportPage', () => {
  it('shows the statistics, the table with the items to check marked, and who has no result', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith());
    expect(await screen.findByRole('heading', { name: 'Raportul clasei' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← 6E2-26T1' })).toHaveAttribute('href', '/teste/6E2-26T1');
    expect(screen.getByText('Corectate 2 din 3 elevi · de verificat 2')).toBeInTheDocument();
    const stats = screen.getByRole('region', { name: 'Statistici' });
    expect(within(stats).getByText('Media').nextSibling).toHaveTextContent('7,75');
    expect(within(stats).getByText('Mediana').nextSibling).toHaveTextContent('7,75');
    expect(within(stats).getByText('Cea mai mică notă').nextSibling).toHaveTextContent('5,5');
    expect(within(stats).getByText('Cea mai mare notă').nextSibling).toHaveTextContent('10');

    const table = screen.getByRole('table', { name: 'Punctajele elevilor pe exerciții' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['Avram Dan', 'Pop Ion']);
    expect(within(rows[1]!).getByRole('link', { name: 'Pop Ion' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/6');
    const flagged = within(rows[1]!).getByText('(de verificat)').closest('td')!;
    expect(flagged).toHaveClass('flagged-cell');
    expect(within(rows[0]!).queryByText('(de verificat)')).not.toBeInTheDocument();
    expect(within(rows[1]!).getByText('5,5 / 10')).toBeInTheDocument();

    const missing = screen.getByRole('region', { name: 'Fără rezultat' });
    expect(within(missing).getByText('Stan Eva')).toBeInTheDocument();
    expect(within(missing).getByText('· Nu a trimis')).toBeInTheDocument();
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
    const groups = await screen.findByRole('table', { name: 'Notele pe grupe' });
    const counts = within(groups)
      .getAllByRole('row')
      .slice(1)
      .map((row) => [within(row).getByRole('rowheader').textContent, within(row).getAllByRole('cell')[0]!.textContent]);
    expect(counts).toEqual([
      ['1-4,99', '0'],
      ['5-6,99', '1'],
      ['7-8,99', '0'],
      ['9-10', '1'],
    ]);
    const exercises = screen.getByRole('table', { name: 'Statistici pe exerciții' });
    const second = within(exercises).getAllByRole('row')[2]!;
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

  it('says that the analysis waits for the next evaluation of a reopened test, with no buttons and no refresh', async () => {
    const reopened = report({
      test: { code: '6E2-26T1', title: 'Fracții', className: '6E2', status: 'open', startedAt: '2026-10-06T07:15:00.000Z' },
      analysis: { status: 'requested', stale: false, attempts: 0, content: null },
    });
    renderAdmin('/teste/6E2-26T1/raport', apiWith(reopened));
    expect(await screen.findByText('Analiza se scrie după ce testul este corectat din nou.')).toBeInTheDocument();
    expect(screen.queryByText('Robotul scrie analiza clasei.', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerează' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fă analiza clasei' })).not.toBeInTheDocument();
    expect(reportRefreshInterval(reopened)).toBe(false);
  });

  it('refreshes every 10 seconds only while the robot can write the analysis', () => {
    const requested = { status: 'requested', stale: false, attempts: 0, content: null } as const;
    const withStatus = (status: ClassReport['test']['status']) =>
      report({ test: { ...report().test, status }, analysis: requested });
    expect(reportRefreshInterval(withStatus('evaluating'))).toBe(10_000);
    expect(reportRefreshInterval(withStatus('done'))).toBe(10_000);
    expect(reportRefreshInterval(withStatus('open'))).toBe(false);
    expect(reportRefreshInterval(undefined)).toBe(false);
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
          studentName: 'Avram Dan',
          total: 40,
          maxTotal: 40,
          grade: 10,
          flagCount: 0,
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
