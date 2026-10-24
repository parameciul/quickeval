import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { ApiError } from '../api.ts';

// Direct jumps between class pages, as a link from one class to another would do.
function Jumps() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/clase/1/elevi')}>
        Mergi la clasa 1
      </button>
      <button type="button" onClick={() => navigate('/clase/2/elevi')}>
        Mergi la clasa 2
      </button>
    </>
  );
}

const oneClass = (students = [
  { id: 10, fullName: 'Pop Ion', active: true, canDelete: true },
  { id: 11, fullName: 'Ionescu Ana', active: false, canDelete: true },
]) =>
  createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
    students: { 1: students },
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ClassStudentsPage', () => {
  it('shows the class and its students, with students who left marked', async () => {
    renderAdmin('/clase/1/elevi', oneClass());
    expect(await screen.findByRole('heading', { name: 'Elevii clasei 6E2 · 2026-2027' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
    expect(screen.getByRole('heading', { name: 'Elevi (1 elev)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pop Ion' })).toHaveAttribute('href', '/elevi/10');
    const left = screen.getByText('Ionescu Ana').closest('li')!;
    expect(within(left).getByText('a plecat')).toBeInTheDocument();
  });

  it('adds pasted names, one per line, without list numbers', async () => {
    const api = oneClass();
    renderAdmin('/clase/1/elevi', api);
    const box = await screen.findByLabelText('Numele elevilor, câte unul pe rând');
    await userEvent.type(box, '1. Marin Dan{Enter}{Enter}2) Stan Eva');
    await userEvent.click(screen.getByRole('button', { name: 'Adaugă 2 elevi' }));
    expect(api.addStudents).toHaveBeenCalledWith(1, ['Marin Dan', 'Stan Eva']);
    expect(await screen.findByText('Marin Dan')).toBeInTheDocument();
    expect(box).toHaveValue('');
  });

  it('marks names already in the class and blocks the add', async () => {
    const api = oneClass();
    renderAdmin('/clase/1/elevi', api);
    await userEvent.type(await screen.findByLabelText('Numele elevilor, câte unul pe rând'), 'POP ION');
    expect(screen.getByRole('alert')).toHaveTextContent('Sunt deja în clasă: POP ION.');
    expect(screen.getByRole('button', { name: 'Adaugă 1 elev' })).toBeDisabled();
    expect(api.addStudents).not.toHaveBeenCalled();
  });

  it('counts a student who left as already in the class', async () => {
    renderAdmin('/clase/1/elevi', oneClass());
    await userEvent.type(await screen.findByLabelText('Numele elevilor, câte unul pe rând'), 'ionescu ana');
    expect(screen.getByRole('alert')).toHaveTextContent('Sunt deja în clasă: ionescu ana.');
  });

  it('marks a name typed twice', async () => {
    const api = oneClass();
    renderAdmin('/clase/1/elevi', api);
    await userEvent.type(await screen.findByLabelText('Numele elevilor, câte unul pe rând'), 'Stan Eva{Enter}Marin Dan{Enter}STAN EVA');
    expect(screen.getByRole('alert')).toHaveTextContent('Apar de două ori: STAN EVA.');
    expect(screen.getByRole('button', { name: 'Adaugă 3 elevi' })).toBeDisabled();
    expect(api.addStudents).not.toHaveBeenCalled();
  });

  it('allows the add again once the duplicate is removed', async () => {
    renderAdmin('/clase/1/elevi', oneClass());
    const box = await screen.findByLabelText('Numele elevilor, câte unul pe rând');
    await userEvent.type(box, 'Pop Ion');
    expect(screen.getByRole('button', { name: 'Adaugă 1 elev' })).toBeDisabled();
    await userEvent.clear(box);
    await userEvent.type(box, 'Stan Eva');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adaugă 1 elev' })).toBeEnabled();
  });

  it('marks a student as left', async () => {
    const api = oneClass();
    renderAdmin('/clase/1/elevi', api);
    const row = (await screen.findByText('Pop Ion')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: /^A plecat/ }));
    expect(api.setStudentActive).toHaveBeenCalledWith(1, 10, false);
    expect(await within(row).findByRole('button', { name: /^Revine în clasă/ })).toBeInTheDocument();
  });

  it('renames a student', async () => {
    const api = oneClass();
    renderAdmin('/clase/1/elevi', api);
    const row = (await screen.findByText('Pop Ion')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: /^Redenumește/ }));
    const input = screen.getByLabelText('Numele elevului');
    await userEvent.clear(input);
    await userEvent.type(input, 'Pop Ioan');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.renameStudent).toHaveBeenCalledWith(10, 'Pop Ioan');
    expect(await screen.findByText('Pop Ioan')).toBeInTheDocument();
  });

  it('deletes a student after a confirm', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const api = oneClass();
    renderAdmin('/clase/1/elevi', api);
    const row = (await screen.findByText('Pop Ion')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: /^Șterge/ }));
    expect(confirm).toHaveBeenCalledWith('Ștergi elevul Pop Ion din clasă? Lucrările neterminate sau eșuate ale elevului se șterg și ele.');
    expect(api.deleteStudent).toHaveBeenCalledWith(1, 10);
    await vi.waitFor(() => expect(screen.queryByText('Pop Ion')).not.toBeInTheDocument());
  });

  it('keeps the student when the confirm is refused', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const api = oneClass();
    renderAdmin('/clase/1/elevi', api);
    const row = (await screen.findByText('Pop Ion')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: /^Șterge/ }));
    expect(api.deleteStudent).not.toHaveBeenCalled();
    expect(screen.getByText('Pop Ion')).toBeInTheDocument();
  });

  it('offers no delete for a student with graded work', async () => {
    renderAdmin(
      '/clase/1/elevi',
      oneClass([
        { id: 10, fullName: 'Pop Ion', active: true, canDelete: false },
        { id: 12, fullName: 'Stan Eva', active: true, canDelete: true },
      ]),
    );
    const kept = (await screen.findByText('Pop Ion')).closest('li')!;
    expect(within(kept).queryByRole('button', { name: /^Șterge/ })).not.toBeInTheDocument();
    const other = screen.getByText('Stan Eva').closest('li')!;
    expect(within(other).getByRole('button', { name: /^Șterge/ })).toBeInTheDocument();
  });

  it('shows a refused delete', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const api = oneClass();
    // The page was loaded before the student's work arrived: it still offers the delete.
    api.deleteStudent.mockRejectedValueOnce(
      new ApiError(409, 'student_has_work', 'Elevul are lucrări trimise sau corectate în această clasă. Îl poți marca „A plecat”.'),
    );
    renderAdmin('/clase/1/elevi', api);
    const row = (await screen.findByText('Pop Ion')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: /^Șterge/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Elevul are lucrări trimise sau corectate în această clasă. Îl poți marca „A plecat”.');
    expect(screen.getByText('Pop Ion')).toBeInTheDocument();
    // The class is read again, so a stale delete button can go away.
    await vi.waitFor(() => expect(api.getClass).toHaveBeenCalledTimes(2));
  });

  it('shows the message of the fake API when the student has graded work', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
      students: { 1: [{ id: 10, fullName: 'Pop Ion', active: true, canDelete: true }] },
      tests: [fakeTest({}, [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded' })])],
    });
    renderAdmin('/clase/1/elevi', api);
    const row = (await screen.findByText('Pop Ion')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: /^Șterge/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Elevul are lucrări trimise sau corectate');
  });

  it.each(['abc', '1e3', '01'])('shows the not-found page for the class id %j', async (id) => {
    renderAdmin(`/clase/${id}/elevi`, oneClass());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('starts with an empty draft when it moves straight to another class', async () => {
    const api = createFakeApi({
      classes: [
        { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
        { id: 2, name: '7E2', schoolYear: 2026, archived: false, studentCount: 0 },
      ],
      students: {},
    });
    // Class 2 is opened first, so later its page shows at once, without a loading step.
    renderAdmin('/clase/2/elevi', api, <Jumps />);
    await screen.findByRole('heading', { name: 'Elevii clasei 7E2 · 2026-2027' });
    await userEvent.click(screen.getByRole('button', { name: 'Mergi la clasa 1' }));
    await userEvent.type(await screen.findByLabelText('Numele elevilor, câte unul pe rând'), 'Pop Ion');
    await userEvent.click(screen.getByRole('button', { name: 'Mergi la clasa 2' }));
    expect(await screen.findByRole('heading', { name: 'Elevii clasei 7E2 · 2026-2027' })).toBeInTheDocument();
    expect(screen.getByLabelText('Numele elevilor, câte unul pe rând')).toHaveValue('');
  });

  it('shows the server message for a class that does not exist', async () => {
    renderAdmin('/clase/999/elevi', oneClass());
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am găsit ce cauți.');
  });
});
