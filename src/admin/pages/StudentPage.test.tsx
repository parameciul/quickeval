import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StudentHistory } from '../../../shared/api.ts';
import { createFakeApi } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

const history: StudentHistory = {
  student: { id: 10, fullName: 'Pop Ion' },
  classes: [
    { id: 2, name: '7E2', schoolYear: 2027, active: true },
    { id: 1, name: '6E2', schoolYear: 2026, active: false },
  ],
  results: [
    {
      submissionId: 8,
      testCode: '7E2-27T1',
      testTitle: 'Funcții',
      className: '7E2',
      schoolYear: 2027,
      date: '2027-10-05T07:00:00.000Z',
      grade: 9.25,
      flagCount: 0,
    },
    {
      submissionId: 5,
      testCode: '6E2-26T1',
      testTitle: 'Fracții',
      className: '6E2',
      schoolYear: 2026,
      date: '2026-10-06T07:15:00.000Z',
      grade: 7.5,
      flagCount: 2,
    },
  ],
};

const apiWith = (histories: StudentHistory[] = [history]) => createFakeApi({ classes: [], students: {}, histories });

describe('StudentPage', () => {
  it('shows the student, the classes, and every graded test with a link to its result', async () => {
    const api = apiWith();
    renderAdmin('/elevi/10', api);
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(api.getStudentHistory).toHaveBeenCalledWith(10);
    expect(screen.getByRole('link', { name: 'Clasa 7E2, 2027-2028' })).toHaveAttribute('href', '/clase/2');
    const left = screen.getByRole('link', { name: 'Clasa 6E2, 2026-2027' });
    expect(left).toHaveAttribute('href', '/clase/1');
    expect(left.parentElement).toHaveTextContent('a plecat');

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['7E2-27T1 · Funcții', '6E2-26T1 · Fracții']);
    const first = rows[1]!;
    expect(within(first).getByRole('link', { name: '6E2-26T1 · Fracții' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/5');
    expect(within(first).getByText('Clasa 6E2, 2026-2027')).toBeInTheDocument();
    expect(within(first).getByText('6 oct. 2026, 10:15')).toBeInTheDocument();
    expect(within(first).getByText('7,5')).toBeInTheDocument();
    expect(within(first).getByText('2')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('9,25')).toBeInTheDocument();
  });

  it('says so when the student has no graded test', async () => {
    renderAdmin('/elevi/10', apiWith([{ ...history, classes: [], results: [] }]));
    expect(await screen.findByText('Elevul nu are încă nicio lucrare corectată.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the not-found page for an id that is not a number', async () => {
    renderAdmin('/elevi/abc', apiWith());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('shows the server message for a student that does not exist', async () => {
    renderAdmin('/elevi/99', apiWith());
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am găsit ce cauți.');
  });
});
