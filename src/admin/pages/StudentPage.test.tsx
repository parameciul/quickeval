import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ClassGrade, StudentHistory } from '../../../shared/api.ts';
import { createFakeApi } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

const paper = (overrides: Partial<ClassGrade>): ClassGrade => ({
  studentId: 10,
  testCode: '7E2-27T1',
  submissionId: 1,
  status: 'graded',
  grade: 8,
  flagCount: 0,
  total: 80,
  maxTotal: 100,
  resultsOpen: false,
  resultToken: null,
  startedAt: '2027-10-05T08:00:00.000Z',
  ...overrides,
});

// Pop Ion is in 7E2 now (2027-2028) and was in 6E2 (2026-2027).
const history: StudentHistory = {
  student: { id: 10, fullName: 'Pop Ion' },
  classes: [
    { id: 2, name: '7E2', schoolYear: 2027, active: true },
    { id: 1, name: '6E2', schoolYear: 2026, active: false },
  ],
  tests: [
    { classId: 2, code: '7E2-27T3', title: 'Ecuații', startedAt: '2027-11-03T08:00:00.000Z' },
    { classId: 2, code: '7E2-27T2', title: 'Logaritmi', startedAt: '2027-10-06T08:00:00.000Z' },
    { classId: 2, code: '7E2-27T1', title: 'Test inițial', startedAt: '2027-09-15T08:00:00.000Z' },
    { classId: 1, code: '6E2-26T2', title: 'Funcții', startedAt: '2026-11-10T08:00:00.000Z' },
    { classId: 1, code: '6E2-26T1', title: 'Fracții', startedAt: '2026-10-06T07:15:00.000Z' },
  ],
  grades: [
    paper({ testCode: '7E2-27T3', submissionId: 31, grade: 7.64, total: 76.4, flagCount: 1 }),
    paper({ testCode: '7E2-27T2', submissionId: 21, grade: 8.2, total: 82, resultsOpen: true, resultToken: 'tok-21' }),
    paper({ testCode: '6E2-26T2', submissionId: 12, status: 'submitted', grade: null, total: null, maxTotal: null }),
    paper({ testCode: '6E2-26T1', submissionId: 11, grade: 7.5, total: 75 }),
  ],
};

const apiWith = (histories: StudentHistory[] = [history]) => createFakeApi({ classes: [], students: {}, histories });
const card = (name: RegExp) => within(screen.getByRole('region', { name }));
const rowOf = (region: ReturnType<typeof card>, test: string) => region.getByRole('rowheader', { name: new RegExp(`^${test}`) }).closest('tr')!;

describe('StudentPage', () => {
  it('shows the name, the class now and the earlier ones, each a link', async () => {
    const api = apiWith();
    renderAdmin('/elevi/10', api);
    expect(await screen.findByRole('heading', { level: 1, name: 'Pop Ion' })).toBeInTheDocument();
    expect(api.getStudentHistory).toHaveBeenCalledWith(10);
    const line = screen.getByText(/înainte în/);
    expect(line).toHaveTextContent('Clasa 7E2 în 2027-2028 · înainte în Clasa 6E2 a plecat (2026-2027)');
    expect(within(line).getByRole('link', { name: 'Clasa 7E2' })).toHaveAttribute('href', '/clase/2');
    expect(within(line).getByRole('link', { name: 'Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
  });

  it('shows one card per school year and class, newest first, a row per test', async () => {
    renderAdmin('/elevi/10', apiWith());
    await screen.findByRole('heading', { level: 1, name: 'Pop Ion' });
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      '2027-2028 · Clasa 7E2',
      '2026-2027 · Clasa 6E2',
    ]);
    const now = card(/^2027-2028/);
    expect(now.getAllByRole('rowheader').map((cell) => within(cell).getByRole('link').textContent)).toEqual([
      'Ecuații',
      'Logaritmi',
      'Test inițial',
    ]);
    expect(now.getByRole('link', { name: 'Ecuații' })).toHaveAttribute('href', '/teste/7E2-27T3');
    expect(within(rowOf(now, 'Ecuații')).getByText('3 noiembrie 2027')).toBeInTheDocument();
  });

  it('shows the points, the grade as the grades table draws it, the result and the paper', async () => {
    renderAdmin('/elevi/10', apiWith());
    await screen.findByRole('heading', { level: 1, name: 'Pop Ion' });
    const now = card(/^2027-2028/);

    // Points wait: orange with a dot, and the result waits for the check.
    const waiting = within(rowOf(now, 'Ecuații'));
    expect(waiting.getByText('76,4 / 100')).toBeInTheDocument();
    expect(waiting.getByRole('img', { name: '1 punct de verificat' }).closest('td')).toHaveClass('grade-flag');
    expect(waiting.getByRole('link', { name: /7,64/ })).toHaveAttribute('href', '/teste/7E2-27T3/elevi/31');
    expect(waiting.getByText('După verificare')).toBeInTheDocument();
    expect(waiting.getByRole('link', { name: 'Lucrarea' })).toHaveAttribute('href', '/teste/7E2-27T3/elevi/31');

    const published = within(rowOf(now, 'Logaritmi'));
    expect(published.getByText('Publicat')).toBeInTheDocument();
    expect(published.getByRole('button', { name: /Copiază linkul/ })).toBeInTheDocument();

    // No paper: "—" and "Nu a trimis lucrarea.", no paper link.
    const none = within(rowOf(now, 'Test inițial'));
    expect(none.getByTitle('Nu a trimis lucrarea')).toHaveTextContent('—');
    expect(none.getByText('Nu a trimis lucrarea.')).toBeInTheDocument();
    expect(none.queryByRole('link', { name: 'Lucrarea' })).not.toBeInTheDocument();

    const before = card(/^2026-2027/);
    expect(within(rowOf(before, 'Fracții')).getByText('Nepublicat')).toBeInTheDocument();
    // Sent, not graded yet: its state, as in the grades table.
    expect(within(rowOf(before, 'Funcții')).getAllByText('Trimis').length).toBeGreaterThan(0);
  });

  it('puts the legend of the grades table under each card', async () => {
    renderAdmin('/elevi/10', apiWith());
    await screen.findByRole('heading', { level: 1, name: 'Pop Ion' });
    expect(card(/^2027-2028/).getByText(/Nota se poate schimba după verificare/)).toHaveTextContent(
      'Nota se poate schimba după verificare. „—”: elevul nu a trimis lucrarea.',
    );
    expect(card(/^2026-2027/).getByText(/Nota se poate schimba după verificare/)).toBeInTheDocument();
  });

  it('leads back to the class the teacher came from, else to the class the student is in now', async () => {
    renderAdmin({ pathname: '/elevi/10', state: { fromClass: 1 } }, apiWith());
    expect(await screen.findByRole('link', { name: '← Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
  });

  it('leads back to the class the student is in now when no class is named', async () => {
    renderAdmin('/elevi/10', apiWith());
    expect(await screen.findByRole('link', { name: '← Clasa 7E2' })).toHaveAttribute('href', '/clase/2');
  });

  it('says so in a class with no started test', async () => {
    renderAdmin('/elevi/10', apiWith([{ ...history, tests: history.tests.filter((test) => test.classId === 1) }]));
    await screen.findByRole('heading', { level: 1, name: 'Pop Ion' });
    expect(card(/^2027-2028/).getByText('Niciun test început în această clasă.')).toBeInTheDocument();
  });

  it('renames the student in a dialog', async () => {
    const api = apiWith();
    renderAdmin('/elevi/10', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redenumește' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Redenumește Pop Ion' }));
    const field = dialog.getByLabelText('Numele elevului');
    await userEvent.clear(field);
    await userEvent.type(field, 'Pop Ioan');
    await userEvent.click(dialog.getByRole('button', { name: /Salvează/ }));
    expect(api.renameStudent).toHaveBeenCalledWith(10, 'Pop Ioan');
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
