import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { TestDetail } from '../../../shared/api.ts';
import { createFakeApi, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';

// A class with two tests (T1 older, T2 newer) and three students (one left).
const classData = (extra: TestDetail[] = []) => {
  const students = [
    { id: 10, fullName: 'Pop Ion', active: true, canDelete: false },
    { id: 11, fullName: 'Ionescu Ana', active: false, canDelete: false },
    { id: 12, fullName: 'Albu Dan', active: true, canDelete: false },
  ];
  const t2 = fakeTest(
    {
      code: '6E2-26T2',
      title: 'Geometrie',
      status: 'open',
      startedAt: '2026-10-20T07:00:00.000Z',
      files: {
        test: { name: 'test.pdf', type: 'application/pdf' },
        barem: { name: 'barem.pdf', type: 'application/pdf' },
      },
    },
    [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 504, status: 'uploading' }),
      fakeUpload({ studentId: 12, studentName: 'Albu Dan', submissionId: 505, status: 'submitted' }),
      fakeUpload({ studentId: 11, studentName: 'Ionescu Ana', active: false }),
    ],
  );
  const t1 = fakeTest(
    { code: '6E2-26T1', title: 'Fracții', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
    [
      fakeUpload({
        studentId: 10,
        studentName: 'Pop Ion',
        submissionId: 501,
        status: 'graded',
        grade: 9,
        total: 9,
        maxTotal: 10,
        resultsOpen: true,
      }),
      fakeUpload({
        studentId: 12,
        studentName: 'Albu Dan',
        submissionId: 502,
        status: 'graded',
        grade: 6,
        total: 6,
        maxTotal: 10,
        flagCount: 2,
      }),
      fakeUpload({
        studentId: 11,
        studentName: 'Ionescu Ana',
        active: false,
        submissionId: 503,
        status: 'graded',
        grade: 5,
        total: 5,
        maxTotal: 10,
        resultToken: 'token-ana',
      }),
    ],
  );
  return {
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
    students: { 1: students },
    tests: [t2, t1, ...extra],
  };
};

const gradedClass = () => createFakeApi(classData());

// The "Elevi" tab: its list of students, and the chosen student on the right.
const openStudents = async () => {
  await userEvent.click(await screen.findByRole('tab', { name: /^Elevi/ }));
  return within(await screen.findByRole('list', { name: 'Elevii clasei' }));
};
const detail = async () => within(await screen.findByRole('region', { name: /^(Pop Ion|Albu Dan|Ionescu Ana)/ }));

describe('ClassPage', () => {
  it('shows the class name, the facts and the new-test link', async () => {
    const api = gradedClass();
    renderAdmin('/clase/1', api);
    expect(await screen.findByRole('heading', { level: 1, name: 'Clasa 6E2' })).toBeInTheDocument();
    expect(await screen.findByText(/3 elevi · 2 teste · anul școlar 2026-2027/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Test nou pentru această clasă' })).toHaveAttribute(
      'href',
      '/teste/nou?clasa=1',
    );
  });

  it('says "1 test" for one test', async () => {
    const data = classData();
    renderAdmin('/clase/1', createFakeApi({ ...data, tests: [data.tests[0]!] }));
    expect(await screen.findByText(/3 elevi · 1 test · anul școlar/)).toBeInTheDocument();
  });

  it('shows the two tabs, "Elevi" with its count', async () => {
    renderAdmin('/clase/1', gradedClass());
    expect(await screen.findByRole('tab', { name: 'Note și teste' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('tab', { name: 'Elevi 3' })).toHaveAttribute('aria-selected', 'false');
  });

  it('offers no new test for an archived class', async () => {
    const api = gradedClass();
    await api.updateClass(1, { archived: true });
    renderAdmin('/clase/1', api);
    expect(await screen.findByText('Arhivată')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Test nou pentru această clasă' })).not.toBeInTheDocument();
  });

  it('shows the not-found page for a bad class id', async () => {
    renderAdmin('/clase/abc', gradedClass());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('marks a class whose test waits in the "Schimbă clasa" menu, and the current class', async () => {
    const data = classData();
    const waiting = fakeTest(
      {
        code: '9R2-26T1',
        title: 'Logaritmi',
        status: 'done',
        classId: 2,
        className: '9R2',
        startedAt: '2026-10-09T07:00:00.000Z',
      },
      [
        fakeUpload({
          studentId: 20,
          studentName: 'Radu Ema',
          status: 'graded',
          grade: 9,
          total: 9,
          maxTotal: 10,
          flagCount: 1,
        }),
      ],
    );
    renderAdmin(
      '/clase/1',
      createFakeApi({
        classes: [...data.classes, { id: 2, name: '9R2', schoolYear: 2026, archived: false, studentCount: 1 }],
        students: { ...data.students, 2: [{ id: 20, fullName: 'Radu Ema', active: true, canDelete: false }] },
        tests: [...data.tests, waiting],
      }),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Schimbă clasa' }));
    const other = await screen.findByRole('link', { name: /Clasa 9R2/ });
    expect(within(other).getByRole('img', { name: 'te așteaptă' })).toBeInTheDocument();
    expect(other).toHaveTextContent('1 elev');
    const current = screen.getByRole('link', { name: /Clasa 6E2/ });
    expect(current).toHaveAttribute('aria-current', 'page');
  });

  it('lists the archived classes last in "Schimbă clasa", under "Arhivate"', async () => {
    const data = classData();
    renderAdmin(
      '/clase/1',
      createFakeApi({
        ...data,
        classes: [...data.classes, { id: 2, name: '9R2', schoolYear: 2026, archived: true, studentCount: 0 }],
      }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Schimbă clasa' }));
    const group = within(await screen.findByRole('group', { name: 'Arhivate' }));
    const archived = group.getByRole('link', { name: /Clasa 9R2/ });
    expect(archived).toHaveAttribute('href', '/clase/2');
    expect(archived).toHaveClass('is-muted');
    expect(group.queryByRole('link', { name: /Clasa 6E2/ })).not.toBeInTheDocument();
  });

  it('shows no "Arhivate" group when no class is archived', async () => {
    renderAdmin('/clase/1', gradedClass());
    await userEvent.click(await screen.findByRole('button', { name: 'Schimbă clasa' }));
    await screen.findByRole('link', { name: /Clasa 6E2/ });
    expect(screen.queryByRole('group', { name: 'Arhivate' })).not.toBeInTheDocument();
  });

  it('opens "Schimbă clasa" at "Arhivate" when a link asks for it', async () => {
    const data = classData();
    renderAdmin(
      { pathname: '/clase/1', state: { archived: true } },
      createFakeApi({
        ...data,
        classes: [...data.classes, { id: 2, name: '9R2', schoolYear: 2026, archived: true, studentCount: 0 }],
      }),
    );
    expect(await screen.findByRole('group', { name: 'Arhivate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schimbă clasa' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('takes an archived class out of the archive from its menu', async () => {
    const api = gradedClass();
    await api.updateClass(1, { archived: true });
    renderAdmin('/clase/1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Mai multe pentru Clasa 6E2' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Scoate din arhivă' }));
    expect(api.updateClass).toHaveBeenLastCalledWith(1, { archived: false });
    expect(await screen.findByRole('link', { name: 'Test nou pentru această clasă' })).toBeInTheDocument();
  });

  it('closes the small menus when a class is picked, on Esc and on a click outside', async () => {
    const data = classData();
    renderAdmin(
      '/clase/1',
      createFakeApi({
        classes: [...data.classes, { id: 2, name: '9R2', schoolYear: 2026, archived: false, studentCount: 0 }],
        students: { ...data.students, 2: [{ id: 20, fullName: 'Radu Ema', active: true, canDelete: false }] },
      }),
      <LocationProbe />,
    );

    const switcher = await screen.findByRole('button', { name: 'Schimbă clasa' });
    await userEvent.click(switcher);
    await userEvent.click(await screen.findByRole('link', { name: /Clasa 9R2/ }));
    await expectLocation('/clase/2');
    expect(screen.queryByRole('link', { name: /Clasa 9R2/ })).not.toBeInTheDocument();

    const reopened = await screen.findByRole('button', { name: 'Schimbă clasa' });
    await userEvent.click(reopened);
    expect(await screen.findByRole('link', { name: /Clasa 6E2/ })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('link', { name: /Clasa 6E2/ })).not.toBeInTheDocument();
    expect(reopened).toHaveFocus();

    await userEvent.click(reopened);
    expect(await screen.findByRole('link', { name: /Clasa 6E2/ })).toBeInTheDocument();
    await userEvent.click(document.body);
    expect(screen.queryByRole('link', { name: /Clasa 6E2/ })).not.toBeInTheDocument();
  });

  it('closes the "⋯" menu on Esc and gives the focus back to its button', async () => {
    renderAdmin('/clase/1', gradedClass());

    const more = await screen.findByRole('button', { name: 'Mai multe pentru Clasa 6E2' });
    await userEvent.click(more);
    expect(await screen.findByRole('menuitem', { name: 'Redenumește clasa' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem', { name: 'Redenumește clasa' })).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it('renames the class in a dialog from its menu', async () => {
    const api = gradedClass();
    renderAdmin('/clase/1', api);
    const more = await screen.findByRole('button', { name: 'Mai multe pentru Clasa 6E2' });

    await userEvent.click(more);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Redenumește clasa' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Redenumește clasa' }));
    const field = dialog.getByLabelText('Numele clasei');
    expect(field).toHaveFocus();
    await userEvent.clear(field);
    await userEvent.type(field, '7A1');
    await userEvent.click(dialog.getByRole('button', { name: 'Salvează' }));

    expect(api.updateClass).toHaveBeenCalledWith(1, { name: '7A1' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('heading', { level: 1, name: 'Clasa 7A1' })).toBeInTheDocument();
  });

  it('closes a dialog on Esc and on ×, and gives the focus back', async () => {
    renderAdmin('/clase/1', gradedClass());
    const more = await screen.findByRole('button', { name: 'Mai multe pentru Clasa 6E2' });
    await userEvent.click(more);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Redenumește clasa' }));
    await screen.findByRole('dialog', { name: 'Redenumește clasa' });
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The menu item that opened it closed with its menu: the focus goes to ⋯.
    expect(more).toHaveFocus();

    await userEvent.click(more);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Redenumește clasa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Redenumește clasa' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Închide' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('makes a new class with its students in one step, from "Schimbă clasa"', async () => {
    const api = gradedClass();
    renderAdmin('/clase/1', api, <LocationProbe />);
    await userEvent.click(await screen.findByRole('button', { name: 'Schimbă clasa' }));
    await userEvent.click(await screen.findByRole('button', { name: '+ Clasă nouă' }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Clasă nouă' }));
    await userEvent.type(dialog.getByLabelText('Numele clasei'), '7B');
    await userEvent.type(dialog.getByLabelText('Elevii, câte unul pe rând'), 'Pop Ana{Enter}Radu Ion');
    await userEvent.click(dialog.getByRole('button', { name: 'Adaugă clasa' }));

    expect(api.createClass).toHaveBeenCalledWith({ name: '7B', schoolYear: 2026 });
    const created = await (api.createClass as unknown as { mock: { results: { value: Promise<{ id: number }> }[] } }).mock
      .results[0]!.value;
    expect(api.addStudents).toHaveBeenCalledWith(created.id, ['Pop Ana', 'Radu Ion']);
    await expectLocation(`/clase/${created.id}`);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('makes a new class with no students', async () => {
    const api = gradedClass();
    renderAdmin('/clase/1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Schimbă clasa' }));
    await userEvent.click(await screen.findByRole('button', { name: '+ Clasă nouă' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Clasă nouă' }));
    await userEvent.type(dialog.getByLabelText('Numele clasei'), '7B');
    await userEvent.click(dialog.getByRole('button', { name: 'Adaugă clasa' }));
    expect(api.createClass).toHaveBeenCalledWith({ name: '7B', schoolYear: 2026 });
    expect(api.addStudents).not.toHaveBeenCalled();
  });

  it('opens "Clasă nouă" when a link asks for it', async () => {
    renderAdmin({ pathname: '/clase/1', state: { newClass: true } }, gradedClass());
    expect(await screen.findByRole('dialog', { name: 'Clasă nouă' })).toBeInTheDocument();
  });
});

describe('ClassPage, an archived class', () => {
  const archivedClass = async (data = classData()) => {
    const api = createFakeApi(data);
    await api.updateClass(1, { archived: true });
    return api;
  };

  it('says it is archived in a strip and in the facts, and offers no new test', async () => {
    renderAdmin('/clase/1', await archivedClass());
    expect(await screen.findByText('Clasă arhivată.')).toBeInTheDocument();
    expect(
      screen.getByText('Notele și testele rămân aici. Nu poți face un test nou și nu poți adăuga elevi.', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText(/3 elevi · 2 teste · anul școlar 2026-2027/).textContent).toMatch(/^Arhivată 3 elevi/);
    expect(screen.queryByRole('link', { name: 'Test nou pentru această clasă' })).not.toBeInTheDocument();
  });

  it('takes the class out of the archive from its strip', async () => {
    const api = await archivedClass();
    renderAdmin('/clase/1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Scoate din arhivă' }));
    expect(api.updateClass).toHaveBeenLastCalledWith(1, { archived: false });
    expect(await screen.findByRole('link', { name: 'Test nou pentru această clasă' })).toBeInTheDocument();
    expect(screen.queryByText('Clasă arhivată.')).not.toBeInTheDocument();
    expect(screen.queryByText('Arhivată')).not.toBeInTheDocument();
  });

  it('lists "Scoate din arhivă" first in ⋯, then "Redenumește clasa"', async () => {
    renderAdmin('/clase/1', await archivedClass());
    await userEvent.click(await screen.findByRole('button', { name: 'Mai multe pentru Clasa 6E2' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Scoate din arhivă',
      'Redenumește clasa',
    ]);
  });

  it('gives each test with a graded paper its report as the one step, and nothing to publish', async () => {
    renderAdmin('/clase/1', await archivedClass());
    const list = within(await screen.findByRole('complementary', { name: 'Testele clasei' }));
    const items = list.getAllByRole('listitem');
    // T2 (newest, nothing graded) has no step; T1 leads to its report.
    expect(within(items[0]!).queryByRole('link', { name: 'Raportul clasei' })).not.toBeInTheDocument();
    expect(within(items[0]!).queryByRole('button')).not.toBeInTheDocument();
    expect(within(items[1]!).getByRole('link', { name: 'Raportul clasei' })).toHaveAttribute('href', '/teste/6E2-26T1/raport');
    // Nothing waits on the teacher in an archived class: no orange stage.
    expect(screen.getByRole('complementary', { name: 'Testele clasei' }).querySelectorAll('.is-waiting')).toHaveLength(0);
    const heads = screen.getByRole('table', { name: 'Notele elevilor la teste' }).querySelectorAll('.grade-head-note.is-waiting');
    expect(heads).toHaveLength(0);
    expect(list.queryByRole('button', { name: /Publică/ })).not.toBeInTheDocument();
  });

  it('shows the students read only, with the link to all their grades', async () => {
    renderAdmin('/clase/1', await archivedClass());
    await openStudents();
    const chosen = await detail();
    expect(chosen.getByRole('link', { name: 'Toate notele elevului, din toate clasele' })).toBeInTheDocument();
    expect(chosen.queryByRole('button', { name: 'Redenumește' })).not.toBeInTheDocument();
    expect(chosen.queryByRole('button', { name: 'A plecat din clasă' })).not.toBeInTheDocument();
    expect(chosen.queryByRole('button', { name: 'Șterge' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Adaugă elevi' })).not.toBeInTheDocument();
  });

  it('offers no "Adaugă elevi" when the archived class has no students', async () => {
    renderAdmin('/clase/1', await archivedClass({ ...classData(), students: { 1: [] } }));
    expect(await screen.findByText('Clasa nu are elevi.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adaugă elevi/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /^Elevi/ }));
    expect(await screen.findByText('Clasa nu are elevi.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adaugă elevi/ })).not.toBeInTheDocument();
  });
});

describe('ClassPage grade table', () => {
  const tableOf = async () => within(await screen.findByRole('table', { name: 'Notele elevilor la teste' }));

  it('shows one column per test, the oldest test on the left, with its date and state', async () => {
    renderAdmin('/clase/1', gradedClass());
    const table = await tableOf();
    const headers = table.getAllByRole('columnheader');
    expect(headers).toHaveLength(3);
    expect(within(headers[1]!).getByRole('link', { name: 'Fracții' })).toHaveAttribute('href', '/teste/6E2-26T1');
    expect(headers[1]).toHaveTextContent('06.10 · de verificat');
    expect(within(headers[1]!).getByText('06.10 · de verificat')).toHaveClass('is-waiting');
    expect(within(headers[2]!).getByRole('link', { name: 'Geometrie' })).toHaveAttribute('href', '/teste/6E2-26T2');
  });

  it('opens the student page from a name, which leads back to this class', async () => {
    const histories = [
      {
        student: { id: 10, fullName: 'Pop Ion' },
        classes: [
          { id: 3, name: '7E2', schoolYear: 2027, active: true },
          { id: 1, name: '6E2', schoolYear: 2026, active: true },
        ],
        tests: [],
        grades: [],
      },
    ];
    renderAdmin('/clase/1', createFakeApi({ ...classData(), histories }));
    const table = within(await screen.findByRole('table', { name: 'Notele elevilor la teste' }));
    await userEvent.click(table.getByRole('link', { name: 'Pop Ion' }));
    expect(await screen.findByRole('link', { name: '← Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
  });

  it('links a grade to the result of the student', async () => {
    renderAdmin('/clase/1', gradedClass());
    const table = await tableOf();
    expect(table.getByRole('link', { name: '9' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/501');
  });

  it('marks a grade with points to check with an orange dot, and no other grade', async () => {
    renderAdmin('/clase/1', gradedClass());
    const table = await tableOf();
    const dot = table.getByRole('img', { name: '2 puncte de verificat' });
    expect(dot.closest('td')).toHaveClass('grade-flag');
    expect(dot.closest('td')).toHaveTextContent('6');
    expect(table.getByRole('link', { name: '9' }).closest('td')).not.toHaveClass('grade-flag');
    expect(table.getAllByRole('img', { name: /de verificat/ })).toHaveLength(1);
  });

  it('shows a status for an upload that is not graded, and a dash for none', async () => {
    renderAdmin('/clase/1', gradedClass());
    const table = await tableOf();
    const popRow = within(table.getByRole('link', { name: 'Pop Ion' }).closest('tr')!);
    expect(popRow.getByRole('link', { name: 'Încarcă…' })).toHaveAttribute('href', '/teste/6E2-26T2/elevi/504');
    const albuRow = within(table.getByRole('link', { name: 'Albu Dan' }).closest('tr')!);
    expect(albuRow.getByText('Trimis')).toBeInTheDocument();
    const leftRow = within(table.getByRole('link', { name: 'Ionescu Ana' }).closest('tr')!);
    expect(leftRow.getByTitle('Nu a trimis lucrarea')).toHaveTextContent('—');
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

  it('says what to do when the class has no students, and leads to "Elevi"', async () => {
    renderAdmin('/clase/1', createFakeApi({ ...classData(), students: { 1: [] } }));
    expect(await screen.findByText('Clasa nu are încă elevi.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Adaugă elevi' }));
    expect(screen.getByRole('tab', { name: 'Elevi 0' })).toHaveAttribute('aria-selected', 'true');
  });

  it('says so when the class has no tests', async () => {
    renderAdmin('/clase/1', createFakeApi({ ...classData(), tests: [] }));
    expect(await screen.findByText(/Clasa nu are încă teste\. Notele apar aici/)).toBeInTheDocument();
  });
});

describe('ClassPage "Elevi" tab', () => {
  it('lists the students with a search, the first one chosen', async () => {
    renderAdmin('/clase/1', gradedClass());
    const list = await openStudents();
    const names = list.getAllByRole('button').map((button) => button.textContent);
    expect(names).toEqual(['Albu Dan', 'Pop Ion', 'Ionescu Ana']);
    expect(list.getByRole('button', { name: /Albu Dan/ })).toHaveAttribute('aria-current', 'true');
    expect(await screen.findByRole('heading', { level: 2, name: 'Albu Dan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Adaugă elevi' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Arată și testele arhivate/ })).not.toBeInTheDocument();
  });

  it('finds a student by a part of the name, without diacritics', async () => {
    const data = classData();
    renderAdmin(
      '/clase/1',
      createFakeApi({
        ...data,
        students: { 1: [...data.students[1]!, { id: 13, fullName: 'Ștefănescu Ioana', active: true, canDelete: true }] },
      }),
    );
    await openStudents();
    const openList = async () => within(await screen.findByRole('list', { name: 'Elevii clasei' }));
    await userEvent.type(screen.getByLabelText('Caută un elev'), 'stef');
    expect((await openList()).getAllByRole('button').map((button) => button.textContent)).toEqual(['Ștefănescu Ioana']);
    await userEvent.clear(screen.getByLabelText('Caută un elev'));
    await userEvent.type(screen.getByLabelText('Caută un elev'), 'zzz');
    expect(screen.getByText('Nu s-a găsit niciun elev.')).toBeInTheDocument();
  });

  it('marks a student whose test has points to check', async () => {
    renderAdmin('/clase/1', gradedClass());
    const list = await openStudents();
    expect(within(list.getByRole('button', { name: /Albu Dan/ })).getByRole('img', { name: 'puncte de verificat' })).toBeInTheDocument();
    expect(within(list.getByRole('button', { name: 'Pop Ion' })).queryByRole('img')).toBeNull();
  });

  it('shows the chosen student with each test, its date, points, grade and result', async () => {
    renderAdmin('/clase/1', gradedClass());
    const list = await openStudents();
    await userEvent.click(list.getByRole('button', { name: 'Ionescu Ana' }));
    const student = await detail();
    expect(student.getByRole('heading', { name: /Ionescu Ana/ })).toHaveTextContent('a plecat din clasă');
    expect(student.getByText('Clasa 6E2 · 1 lucrare în 2026-2027')).toBeInTheDocument();
    const rows = student.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByRole('link', { name: 'Geometrie' })).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Nu a trimis lucrarea.')).toBeInTheDocument();
    expect(within(rows[1]!).getByRole('link', { name: 'Fracții' })).toBeInTheDocument();
    expect(within(rows[1]!).getByText('5 / 10')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Nepublicat')).toBeInTheDocument();
    expect(within(rows[1]!).getByRole('button', { name: 'Copiază linkul' })).toBeInTheDocument();
    expect(student.getByRole('link', { name: 'Toate notele elevului, din toate clasele' })).toHaveAttribute(
      'href',
      '/elevi/11',
    );
  });

  it('shows a published result, and an upload still in progress', async () => {
    renderAdmin('/clase/1', gradedClass());
    const list = await openStudents();
    await userEvent.click(list.getByRole('button', { name: 'Pop Ion' }));
    const student = await detail();
    expect(student.getByText('Publicat')).toBeInTheDocument();
    expect(student.getByText('Încarcă…')).toBeInTheDocument();
    // The upload still under way is not a paper yet.
    expect(student.getByText('Clasa 6E2 · 1 lucrare în 2026-2027')).toBeInTheDocument();
  });

  it('shows every result as published when the whole test is published', async () => {
    const data = classData();
    const [t2, t1] = data.tests;
    renderAdmin('/clase/1', createFakeApi({ ...data, tests: [t2!, { ...t1!, test: { ...t1!.test, resultsOpen: true } }] }));
    const list = await openStudents();
    await userEvent.click(list.getByRole('button', { name: 'Ionescu Ana' }));
    const student = await detail();
    expect(student.getByText('Publicat')).toBeInTheDocument();
    expect(student.queryByText('Nepublicat')).not.toBeInTheDocument();
    // A published result keeps its link to copy, as in the design.
    expect(student.getByRole('button', { name: 'Copiază linkul' })).toBeInTheDocument();
  });

  it('says a result waits for the check, and links each paper', async () => {
    renderAdmin('/clase/1', gradedClass());
    await openStudents();
    const student = await detail();
    expect(student.getByText('După verificare')).toBeInTheDocument();
    expect(student.getByText('2 puncte de verificat')).toBeInTheDocument();
    expect(student.getByText('Trimis')).toBeInTheDocument();
    const papers = student.getAllByRole('link', { name: 'Lucrarea' }).map((link) => link.getAttribute('href'));
    expect(papers).toEqual(['/teste/6E2-26T2/elevi/505', '/teste/6E2-26T1/elevi/502']);
  });

  it('marks a student as gone from the class', async () => {
    const api = gradedClass();
    renderAdmin('/clase/1', api);
    await openStudents();
    await userEvent.click((await detail()).getByRole('button', { name: 'A plecat din clasă' }));
    expect(api.setStudentActive).toHaveBeenCalledWith(1, 12, false);
  });

  it('renames the chosen student in a dialog', async () => {
    const api = gradedClass();
    renderAdmin('/clase/1', api);
    await openStudents();
    await userEvent.click((await detail()).getByRole('button', { name: 'Redenumește' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Redenumește Albu Dan' }));
    const field = dialog.getByLabelText('Numele elevului');
    await userEvent.clear(field);
    await userEvent.type(field, 'Albu Dana');
    await userEvent.click(dialog.getByRole('button', { name: 'Salvează' }));
    expect(api.renameStudent).toHaveBeenCalledWith(12, 'Albu Dana');
  });

  it('adds students in a dialog, and warns of a name already in the class', async () => {
    const api = gradedClass();
    renderAdmin('/clase/1', api);
    await openStudents();
    await userEvent.click(screen.getByRole('button', { name: '+ Adaugă elevi' }));
    const box = await screen.findByRole('dialog', { name: 'Adaugă elevi în Clasa 6E2' });
    const dialog = within(box);
    const field = dialog.getByLabelText('Numele elevilor, câte unul pe rând');
    expect(field).toHaveFocus();

    await userEvent.type(field, 'Pop Ion');
    expect(dialog.getByRole('alert')).toHaveTextContent('Sunt deja în clasă: Pop Ion.');
    expect(dialog.getByRole('button', { name: 'Adaugă 1 elev' })).toBeDisabled();

    await userEvent.clear(field);
    await userEvent.type(field, 'Nou Ana{Enter}Nou Dan');
    await userEvent.click(dialog.getByRole('button', { name: 'Adaugă 2 elevi' }));
    expect(api.addStudents).toHaveBeenCalledWith(1, ['Nou Ana', 'Nou Dan']);
    await waitFor(() => expect(box).not.toBeInTheDocument());
  });

  it('offers to add students when the class has none', async () => {
    renderAdmin('/clase/1', createFakeApi({ ...classData(), students: { 1: [] } }));
    await userEvent.click(await screen.findByRole('tab', { name: 'Elevi 0' }));
    expect(screen.getByText(/Clasa nu are încă elevi/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '+ Adaugă elevi' }));
    expect(await screen.findByRole('dialog', { name: 'Adaugă elevi în Clasa 6E2' })).toBeInTheDocument();
  });
});

describe('ClassPage "Testele clasei"', () => {
  const aside = async () => within(await screen.findByRole('complementary', { name: 'Testele clasei' }));

  it('lists the tests newest first, with their date, papers, stage and next step', async () => {
    renderAdmin('/clase/1', gradedClass());
    const list = await aside();
    expect(list.getByText('2 în 2026-2027')).toBeInTheDocument();
    const items = list.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    const [newest, oldest] = items;

    expect(within(newest!).getByRole('link', { name: 'Geometrie' })).toHaveAttribute('href', '/teste/6E2-26T2');
    expect(within(newest!).getByText('20.10')).toBeInTheDocument();
    expect(within(newest!).getByText(/1 din 2 trimise/)).toBeInTheDocument();
    expect(within(newest!).getByText(/^În clasă/)).toBeInTheDocument();
    expect(within(newest!).getByRole('link', { name: 'Pornește corectarea' })).toHaveAttribute(
      'href',
      '/teste/6E2-26T2#corectare',
    );

    expect(within(oldest!).getByRole('link', { name: 'Fracții' })).toHaveAttribute('href', '/teste/6E2-26T1');
    expect(within(oldest!).getByText('06.10')).toBeInTheDocument();
    expect(within(oldest!).getByText(/^Verificare/)).toHaveClass('is-waiting');
    const check = within(oldest!).getByRole('link', { name: 'Verifică 2 puncte' });
    expect(check).toHaveAttribute('href', '/teste/6E2-26T1/verificare');
    expect(check).toHaveClass('button');
  });

  it('keeps the archived tests behind their toggle, in both the table and the list', async () => {
    const archived = fakeTest({
      code: '6E2-26T0',
      title: 'Teză',
      status: 'done',
      startedAt: '2026-09-20T07:00:00.000Z',
      archived: true,
    });
    renderAdmin('/clase/1', createFakeApi(classData([archived])));
    // The facts count only the tests that are not archived.
    expect(await screen.findByText(/3 elevi · 2 teste · anul școlar/)).toBeInTheDocument();

    const headers = () => screen.getByRole('table', { name: 'Notele elevilor la teste' }).querySelectorAll('thead th');
    await screen.findByRole('table', { name: 'Notele elevilor la teste' });
    expect(headers()).toHaveLength(3);
    expect((await aside()).queryByRole('link', { name: 'Teză' })).not.toBeInTheDocument();

    await userEvent.click((await aside()).getByRole('button', { name: 'Arată și testele arhivate (1)' }));

    expect(headers()).toHaveLength(4);
    expect((await aside()).getByRole('link', { name: 'Teză' })).toBeInTheDocument();
    expect((await aside()).getByRole('button', { name: 'Arată și testele arhivate (1)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
