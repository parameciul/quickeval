import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createFakeApi, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

// Direct jumps between class pages, as a link from one class to another would do.
function Jumps() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/clase/1')}>
        Mergi la clasa 1
      </button>
      <button type="button" onClick={() => navigate('/clase/2')}>
        Mergi la clasa 2
      </button>
    </>
  );
}

const oneClass = () =>
  createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
    students: {
      1: [
        { id: 10, fullName: 'Pop Ion', active: true, canDelete: true },
        { id: 11, fullName: 'Ionescu Ana', active: false, canDelete: true },
      ],
    },
  });

// A class with three students (one left) and two tests: T1 is done, with grades; T2 is open.
const gradedClass = () => {
  const students = [
    { id: 10, fullName: 'Pop Ion', active: true, canDelete: false },
    { id: 11, fullName: 'Ionescu Ana', active: false, canDelete: false },
    { id: 12, fullName: 'Albu Dan', active: true, canDelete: false },
  ];
  const t2 = fakeTest({ code: '6E2-26T2', title: 'Geometrie', status: 'open', startedAt: '2026-10-20T07:00:00.000Z' }, [
    fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 504, status: 'uploading' }),
    fakeUpload({ studentId: 12, studentName: 'Albu Dan', submissionId: 505, status: 'submitted' }),
    fakeUpload({ studentId: 11, studentName: 'Ionescu Ana', active: false }),
  ]);
  const t1 = fakeTest({ code: '6E2-26T1', title: 'Fracții', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' }, [
    fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 501, status: 'graded', grade: 9 }),
    fakeUpload({ studentId: 12, studentName: 'Albu Dan', submissionId: 502, status: 'graded', grade: 6, flagCount: 2 }),
    fakeUpload({ studentId: 11, studentName: 'Ionescu Ana', active: false, submissionId: 503, status: 'graded', grade: 5 }),
  ]);
  return createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
    students: { 1: students },
    tests: [t2, t1],
  });
};

describe('ClassPage', () => {
  it('shows the class name and year', async () => {
    renderAdmin('/clase/1', oneClass());
    expect(await screen.findByRole('heading', { name: 'Clasa 6E2 · 2026-2027' })).toBeInTheDocument();
  });

  it('links to the students page', async () => {
    renderAdmin('/clase/1', oneClass());
    expect(await screen.findByRole('link', { name: 'Elevii clasei' })).toHaveAttribute('href', '/clase/1/elevi');
  });

  it('no longer lists or adds students itself', async () => {
    renderAdmin('/clase/1', oneClass());
    await screen.findByRole('heading', { name: 'Clasa 6E2 · 2026-2027' });
    expect(screen.queryByRole('heading', { name: /^Elevi \(/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Numele elevilor, câte unul pe rând')).not.toBeInTheDocument();
  });

  it('names each test in the table and offers a new one for the class', async () => {
    const api = oneClass();
    await api.createTest({ classId: 1, title: 'Fracții' });
    renderAdmin('/clase/1', api);
    expect(await screen.findByRole('link', { name: '6E2-26T1 · Fracții' })).toHaveAttribute('href', '/teste/6E2-26T1');
    expect(screen.getByRole('link', { name: 'Test nou pentru această clasă' })).toHaveAttribute('href', '/teste/nou?clasa=1');
  });

  it('offers no new test for an archived class', async () => {
    const api = oneClass();
    await api.updateClass(1, { archived: true });
    renderAdmin('/clase/1', api);
    expect(await screen.findByText('Clasa nu are încă teste.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Test nou pentru această clasă' })).not.toBeInTheDocument();
  });

  it('renames the class', async () => {
    const api = oneClass();
    renderAdmin('/clase/1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redenumește clasa' }));
    const input = screen.getByLabelText('Nume nou');
    await userEvent.clear(input);
    await userEvent.type(input, '6E3');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.updateClass).toHaveBeenCalledWith(1, { name: '6E3' });
    expect(await screen.findByRole('heading', { name: 'Clasa 6E3 · 2026-2027' })).toBeInTheDocument();
  });

  it.each(['abc', '1e3', '01'])('shows the not-found page for the class id %j', async (id) => {
    renderAdmin(`/clase/${id}`, oneClass());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('starts with a closed rename form when it moves straight to another class', async () => {
    const api = createFakeApi({
      classes: [
        { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
        { id: 2, name: '7E2', schoolYear: 2026, archived: false, studentCount: 0 },
      ],
      students: {},
    });
    // Class 2 is opened first, so later its page shows at once, without a loading step.
    renderAdmin('/clase/2', api, <Jumps />);
    await screen.findByRole('heading', { name: 'Clasa 7E2 · 2026-2027' });
    await userEvent.click(screen.getByRole('button', { name: 'Mergi la clasa 1' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Redenumește clasa' }));
    await userEvent.type(screen.getByLabelText('Nume nou'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Mergi la clasa 2' }));
    expect(await screen.findByRole('heading', { name: 'Clasa 7E2 · 2026-2027' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nume nou')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redenumește clasa' })).toBeInTheDocument();
  });

  it('shows the server message for a class that does not exist', async () => {
    renderAdmin('/clase/999', oneClass());
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am găsit ce cauți.');
  });
});

describe('ClassPage grade table', () => {
  const tableOf = async () => within(await screen.findByRole('table', { name: 'Notele elevilor la teste' }));

  it('shows one column per test, newest first', async () => {
    renderAdmin('/clase/1', gradedClass());
    const table = await tableOf();
    const headers = table.getAllByRole('columnheader');
    expect(headers).toHaveLength(3);
    expect(headers[0]).toHaveTextContent('Elev');
    expect(within(headers[1]!).getByText('T2')).toBeInTheDocument();
    expect(within(headers[1]!).getByRole('link', { name: '6E2-26T2 · Geometrie' })).toHaveAttribute('href', '/teste/6E2-26T2');
    expect(within(headers[2]!).getByText('T1')).toBeInTheDocument();
    expect(within(headers[2]!).getByRole('link', { name: '6E2-26T1 · Fracții' })).toHaveAttribute('href', '/teste/6E2-26T1');
  });

  it('shows the number of students in the heading', async () => {
    renderAdmin('/clase/1', gradedClass());
    expect(await screen.findByRole('heading', { name: 'Note (2 elevi)' })).toBeInTheDocument();
  });

  it('links a grade to the result of the student', async () => {
    renderAdmin('/clase/1', gradedClass());
    const table = await tableOf();
    expect(table.getByRole('link', { name: '9' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/501');
  });

  it('marks a grade with items to check', async () => {
    renderAdmin('/clase/1', gradedClass());
    const table = await tableOf();
    const link = table.getByRole('link', { name: '6 (de verificat)' });
    expect(link).toHaveAttribute('href', '/teste/6E2-26T1/elevi/502');
    expect(link.closest('td')).toHaveClass('flagged-cell');
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

  it('keeps a column for an open test, with its status', async () => {
    renderAdmin('/clase/1', gradedClass());
    const table = await tableOf();
    const header = within(table.getAllByRole('columnheader')[1]!);
    expect(header.getByText('Deschis')).toBeInTheDocument();
    expect(header.queryByText('20.10')).not.toBeInTheDocument();
  });

  it('shows the date of a finished test', async () => {
    renderAdmin('/clase/1', gradedClass());
    const table = await tableOf();
    expect(within(table.getAllByRole('columnheader')[2]!).getByText('06.10')).toBeInTheDocument();
  });

  it('links the report from a test with graded work', async () => {
    renderAdmin('/clase/1', gradedClass());
    const table = await tableOf();
    const headers = table.getAllByRole('columnheader');
    expect(within(headers[2]!).getByRole('link', { name: 'raport' })).toHaveAttribute('href', '/teste/6E2-26T1/raport');
    expect(within(headers[1]!).queryByRole('link', { name: 'raport' })).not.toBeInTheDocument();
  });

  it('lists students who left after the others, marked', async () => {
    renderAdmin('/clase/1', gradedClass());
    const table = await tableOf();
    const names = table.getAllByRole('rowheader').map((cell) => cell.textContent);
    expect(names).toEqual(['Albu Dan', 'Pop Ion', 'Ionescu Ana a plecat']);
    const leftRow = table.getByRole('link', { name: 'Ionescu Ana' }).closest('tr')!;
    expect(leftRow).toHaveClass('is-muted');
    expect(within(leftRow).getByText('a plecat')).toHaveClass('tag');
    expect(table.getByRole('link', { name: 'Ionescu Ana' })).toHaveAttribute('href', '/elevi/11');
  });

  it('hides archived tests until asked', async () => {
    const api = gradedClass();
    await api.setTestArchived('6E2-26T1', true);
    renderAdmin('/clase/1', api);
    const table = await tableOf();
    expect(table.getAllByRole('columnheader')).toHaveLength(2);
    expect(table.queryByRole('link', { name: '6E2-26T1 · Fracții' })).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Arată și testele arhivate (1)' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(table.getByRole('link', { name: '6E2-26T1 · Fracții' })).toBeInTheDocument();
    expect(table.getByText('Arhivat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ascunde testele arhivate' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Ascunde testele arhivate' }));
    expect(table.queryByRole('link', { name: '6E2-26T1 · Fracții' })).not.toBeInTheDocument();
  });

  it('offers no toggle when no test is archived', async () => {
    renderAdmin('/clase/1', gradedClass());
    await tableOf();
    expect(screen.queryByRole('button', { name: /testele arhivate/ })).not.toBeInTheDocument();
  });

  it('says so when the class has students but no tests', async () => {
    renderAdmin('/clase/1', oneClass());
    expect(await screen.findByText('Clasa nu are încă teste.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('offers to add students when the class has none', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
      students: {},
      tests: [fakeTest({ code: '6E2-26T1', status: 'done' })],
    });
    renderAdmin('/clase/1', api);
    expect(await screen.findByText('Clasa nu are încă elevi.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Adaugă elevi' })).toHaveAttribute('href', '/clase/1/elevi');
  });
});
