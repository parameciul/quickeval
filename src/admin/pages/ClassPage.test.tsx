import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

// A class with two tests (T1 older, T2 newer) and three students (one left).
const gradedClass = () => {
  const students = [
    { id: 10, fullName: 'Pop Ion', active: true, canDelete: false },
    { id: 11, fullName: 'Ionescu Ana', active: false, canDelete: false },
    { id: 12, fullName: 'Albu Dan', active: true, canDelete: false },
  ];
  const t2 = fakeTest(
    { code: '6E2-26T2', title: 'Geometrie', status: 'open', startedAt: '2026-10-20T07:00:00.000Z' },
    [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 504, status: 'uploading' }),
      fakeUpload({ studentId: 12, studentName: 'Albu Dan', submissionId: 505, status: 'submitted' }),
      fakeUpload({ studentId: 11, studentName: 'Ionescu Ana', active: false }),
    ],
  );
  const t1 = fakeTest(
    { code: '6E2-26T1', title: 'Fracții', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
    [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 501, status: 'graded', grade: 9 }),
      fakeUpload({ studentId: 12, studentName: 'Albu Dan', submissionId: 502, status: 'graded', grade: 6, flagCount: 2 }),
      fakeUpload({ studentId: 11, studentName: 'Ionescu Ana', active: false, submissionId: 503, status: 'graded', grade: 5 }),
    ],
  );
  return createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
    students: { 1: students },
    tests: [t2, t1],
  });
};

describe('ClassPage', () => {
  it('shows the class name, the facts and the new-test link', async () => {
    const api = gradedClass();
    renderAdmin('/clase/1', api);
    expect(await screen.findByText('Clasa 6E2')).toBeInTheDocument();
    expect(await screen.findByText(/3 elevi · 2 teste · anul școlar 2026-2027/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Test nou pentru această clasă' })).toHaveAttribute(
      'href',
      '/teste/nou?clasa=1',
    );
  });

  it('shows the two tabs', async () => {
    renderAdmin('/clase/1', gradedClass());
    expect(await screen.findByRole('tab', { name: 'Note și teste' })).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Elevi' })).toBeInTheDocument();
  });

  it('offers no new test for an archived class', async () => {
    const api = gradedClass();
    await api.updateClass(1, { archived: true });
    renderAdmin('/clase/1', api);
    expect(screen.queryByRole('link', { name: 'Test nou pentru această clasă' })).not.toBeInTheDocument();
  });

  it('shows the not-found page for a bad class id', async () => {
    renderAdmin('/clase/abc', gradedClass());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });
});

describe('ClassPage grade table', () => {
  const tableOf = async () => within(await screen.findByRole('table', { name: 'Notele elevilor la teste' }));

  it('shows one column per test, the oldest test on the left', async () => {
    renderAdmin('/clase/1', gradedClass());
    const table = await tableOf();
    const headers = table.getAllByRole('columnheader');
    expect(headers).toHaveLength(3);
    expect(within(headers[1]!).getByText('T1')).toBeInTheDocument();
    expect(within(headers[2]!).getByText('T2')).toBeInTheDocument();
  });

  it('links a grade to the result of the student', async () => {
    renderAdmin('/clase/1', gradedClass());
    const table = await tableOf();
    expect(table.getByRole('link', { name: '9' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/501');
  });

  it('marks a grade with items to check with an orange dot', async () => {
    renderAdmin('/clase/1', gradedClass());
    const table = await tableOf();
    const link = table.getByRole('link', { name: '6 puncte de verificat' });
    expect(link.closest('td')).toHaveClass('flagged-cell');
    expect(link.closest('td')!.querySelector('.flag-dot')).not.toBeNull();
    expect(table.getByRole('link', { name: '9' }).closest('td')).not.toHaveClass('flagged-cell');
  });

  it('shows a status for an upload that is not graded, and a dash for none', async () => {
    renderAdmin('/clase/1', gradedClass());
    const table = await tableOf();
    const popRow = within(table.getByRole('link', { name: 'Pop Ion' }).closest('tr')!);
    expect(popRow.getByText('Încarcă…')).toBeInTheDocument();
    const albuRow = within(table.getByRole('link', { name: 'Albu Dan' }).closest('tr')!);
    expect(albuRow.getByText('Trimis')).toBeInTheDocument();
    const leftRow = within(table.getByRole('link', { name: 'Ionescu Ana' }).closest('tr')!);
    expect(leftRow.getByText('—')).toBeInTheDocument();
  });

  it('shows the test average in the last row "Media testului"', async () => {
    renderAdmin('/clase/1', gradedClass());
    const table = await tableOf();
    const row = table.getByRole('rowheader', { name: 'Media testului' }).closest('tr')!;
    const cells = within(row).getAllByRole('cell');
    // Oldest first: T1 has 9, 6 and 5 -> 6,67; T2 has none graded -> —.
    expect(cells[0]).toHaveTextContent('6,67');
    expect(cells[1]).toHaveTextContent('—');
  });

  it('lists students who left after the others, marked', async () => {
    renderAdmin('/clase/1', gradedClass());
    const table = await tableOf();
    const names = table.getAllByRole('rowheader').map((cell) => cell.textContent);
    expect(names).toEqual(['Albu Dan', 'Pop Ion', 'Ionescu Ana a plecat', 'Media testului']);
  });
});

describe('ClassPage "Elevi" tab', () => {
  it('shows the students of the class with a search and an add button', async () => {
    renderAdmin('/clase/1', gradedClass());
    await screen.findByRole('tab', { name: 'Elevi' }).then((el) => el.click());
    expect(await screen.findByRole('heading', { name: 'Elevi (3 elevi)' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Caută elev')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Adaugă elevi' })).toBeInTheDocument();
    expect(screen.getByText('Pop Ion')).toBeInTheDocument();
    expect(screen.getByText('Albu Dan')).toBeInTheDocument();
    expect(screen.getByText('Ionescu Ana')).toBeInTheDocument();
  });

  it('marks a student whose test has items to check', async () => {
    renderAdmin('/clase/1', gradedClass());
    await screen.findByRole('tab', { name: 'Elevi' }).then((el) => el.click());
    const albu = screen.getByText('Albu Dan').closest('li')!;
    expect(albu.querySelector('.flag-dot')).not.toBeNull();
    const pop = screen.getByText('Pop Ion').closest('li')!;
    expect(pop.querySelector('.flag-dot')).toBeNull();
  });

  it('shows one student with each test, its date, points, grade and result', async () => {
    renderAdmin('/clase/1', gradedClass());
    await screen.findByRole('tab', { name: 'Elevi' }).then((el) => el.click());
    await screen.findByText('Ionescu Ana').then((el) => el.click());
    expect(await screen.findByText('Geometrie')).toBeInTheDocument();
    expect(screen.getByText('Nu a trimis lucrarea')).toBeInTheDocument();
    expect(screen.getByText('Fracții')).toBeInTheDocument();
    expect(screen.getByText('5 / 10')).toBeInTheDocument();
    expect(screen.getByText('Toate notele elevului, din toate clasele')).toBeInTheDocument();
  });
});
