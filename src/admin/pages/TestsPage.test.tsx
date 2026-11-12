import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api.ts';
import { createFakeApi, fakeTeacher, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';

// A test file, an active barem and the print PDF.
const ready = {
  files: { test: { name: 'test.pdf', type: 'application/pdf' }, barem: { name: 'barem.pdf', type: 'application/pdf' } },
  print: { status: 'ready', fromWord: false },
} as const;
const started = { startedAt: '2026-10-06T07:15:00.000Z' };
const oneClass = [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }];

const findRow = async (title: string) => (await screen.findByRole('link', { name: title })).closest('tr')!;
const rowOf = (title: string) => screen.getByRole('link', { name: title }).closest('tr')!;
const stageText = (row: HTMLElement) => row.querySelector('.stage-text');

const withTests = () =>
  createFakeApi({
    classes: [
      { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 2, name: '6E3', schoolYear: 2026, archived: false, studentCount: 0 },
    ],
    students: {},
    tests: [
      fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'open', ...ready, ...started }, [
        fakeUpload({ studentId: 10, studentName: 'Pop Ion', status: 'graded', submissionId: 5, grade: 9, flagCount: 2 }),
        fakeUpload({ studentId: 11, studentName: 'Stan Eva' }),
      ]),
      fakeTest({ code: '6E2-26T1', title: 'Fracții' }),
      fakeTest({ code: '6E2-27T1', title: 'Anul viitor', schoolYear: 2027 }),
    ],
  });

afterEach(() => {
  vi.useRealTimers();
});

describe('TestsPage', () => {
  it('is the start page and lists the tests of the selected school year', async () => {
    const api = withTests();
    renderAdmin('/', api);
    expect(await screen.findByRole('heading', { level: 1, name: /^Bună (dimineața|ziua|seara), Laura\.$/ })).toBeInTheDocument();
    const row = await findRow('Ecuații');
    expect(within(row).getByText('Clasa 6E2 · început 6 oct.')).toBeInTheDocument();
    expect(stageText(row)).toHaveTextContent('Verificare · 2 puncte nesigure');
    expect(within(row).getByText('1 din 2')).toBeInTheDocument();

    const draft = rowOf('Fracții');
    expect(within(draft).getByText('Clasa 6E2 · ciornă')).toBeInTheDocument();
    expect(stageText(draft)).toHaveTextContent('Pregătire · lipsesc testul și baremul');
    expect(within(draft).getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('Anul viitor')).not.toBeInTheDocument();
    expect(api.listTests).toHaveBeenCalledWith(2026);
    expect(api.listClasses).toHaveBeenCalledWith(2026);
  });

  it("greets the teacher by the first name, with today's date in Romania", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T07:30:00.000Z'));
    renderAdmin('/', withTests());
    expect(await screen.findByRole('heading', { level: 1, name: 'Bună dimineața, Laura.' })).toBeInTheDocument();
    expect(screen.getByText(/^Miercuri, 4 noiembrie/)).toBeInTheDocument();
  });

  it('draws the six stages of each test for the eye only, and says them in words', async () => {
    renderAdmin('/', withTests());
    const row = await findRow('Ecuații');
    const bars = row.querySelector('.stage-bars')!;
    expect(bars).toHaveAttribute('aria-hidden', 'true');
    expect([...bars.children].map((bar) => bar.className)).toEqual(['is-done', 'is-done', 'is-now', 'is-later', 'is-wait', 'is-later']);
    expect(row.querySelector('.papers-progress')).toBeNull();
  });

  it('links each test to its page and offers a new test', async () => {
    renderAdmin('/', withTests());
    expect(await screen.findByRole('link', { name: 'Ecuații' })).toHaveAttribute('href', '/teste/6E2-26T2');
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Test nou' })).toHaveAttribute('href', '/teste/nou');
  });

  it('says so when the year has no tests, for a teacher who has had tests graded', async () => {
    renderAdmin('/', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ testsEvaluated: 3 }) }));
    expect(await screen.findByText('Nu ai niciun test în acest an școlar.')).toBeInTheDocument();
    expect(screen.getByText(/Nimic nu te așteaptă acum\./)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Primii pași' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent('Bun venit');
  });

  it('welcomes a new teacher with the first steps, none done yet', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-07T10:00:00.000Z'));
    renderAdmin('/', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ name: 'Maria Ionescu' }) }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Bun venit, Maria.' })).toBeInTheDocument();
    expect(screen.getByText('Sâmbătă, 7 noiembrie · Trei pași până la primul test corectat.')).toBeInTheDocument();
    const card = await screen.findByRole('region', { name: 'Primii pași' });
    expect(card).toHaveTextContent('0 din 3');
    const steps = within(card).getAllByRole('listitem');
    expect(steps.map((step) => within(step).getByRole('heading', { level: 3 }).textContent)).toEqual([
      'Adaugă o clasă',
      'Fă un test',
      'Tipărește-l cu cod QR',
    ]);
    expect(steps[0]).toHaveTextContent('Numele clasei și elevii, câte unul pe rând. Poți lipi lista din catalog.');
    expect(steps[1]).toHaveTextContent('Încarci testul și baremul. Nu ai barem? Primești o propunere pe care o verifici tu.');
    expect(steps[2]).toHaveTextContent('Elevii scanează codul și trimit pozele lucrării. Fără cont și fără aplicație.');
    expect(within(steps[1]!).getByRole('button', { name: 'Test nou' })).toBeDisabled();
    expect(within(steps[2]!).queryByRole('button')).not.toBeInTheDocument();
    // The card is the page: no filters, no "Test nou" in the head, no line about no tests.
    const page = screen.getByRole('main');
    expect(within(page).queryByRole('group', { name: 'Clasa' })).not.toBeInTheDocument();
    expect(within(page).queryByRole('checkbox', { name: 'Arată și testele arhivate' })).not.toBeInTheDocument();
    expect(within(page).queryByText('Nu ai niciun test în acest an școlar.')).not.toBeInTheDocument();
    expect(within(page).queryAllByRole('link', { name: 'Test nou' })).toHaveLength(0);
    await userEvent.click(within(steps[0]!).getByRole('button', { name: 'Clasă nouă' }));
    expect(await screen.findByRole('dialog', { name: 'Clasă nouă' })).toBeInTheDocument();
  });

  it('ticks the class once there is one, and opens "Test nou" next', async () => {
    renderAdmin('/', createFakeApi({ classes: oneClass, students: {} }));
    const card = await screen.findByRole('region', { name: 'Primii pași' });
    expect(await within(card).findByText('1 din 3')).toBeInTheDocument();
    const [first, second] = within(card).getAllByRole('listitem');
    expect(first).toHaveClass('is-done');
    expect(within(first!).getByRole('heading', { level: 3 })).toHaveAccessibleName('Adaugă o clasă gata');
    expect(within(first!).queryByRole('button')).not.toBeInTheDocument();
    expect(within(second!).getByRole('link', { name: 'Test nou' })).toHaveAttribute('href', '/teste/nou');
  });

  it('counts an archived class as no class for the first step', async () => {
    renderAdmin('/', createFakeApi({ classes: [{ ...oneClass[0]!, archived: true }], students: {} }));
    const card = await screen.findByRole('region', { name: 'Primii pași' });
    expect(await within(card).findByRole('button', { name: 'Clasă nouă' })).toBeInTheDocument();
    expect(card).toHaveTextContent('0 din 3');
  });

  it('shows a new teacher neither the filters nor another greeting while the tests load', async () => {
    const api = createFakeApi({ classes: oneClass, students: {} });
    api.listTests.mockImplementation(() => new Promise(() => {}));
    renderAdmin('/', api);
    await screen.findByRole('navigation', { name: 'Meniu' });
    const page = screen.getByRole('main');
    expect(await within(page).findByText('Se încarcă…')).toBeInTheDocument();
    expect(within(page).queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(within(page).queryByRole('group', { name: 'Clasa' })).not.toBeInTheDocument();
    expect(within(page).queryByRole('link', { name: 'Test nou' })).not.toBeInTheDocument();
  });

  it('shows no first steps once a test exists', async () => {
    renderAdmin('/', createFakeApi({ classes: oneClass, students: {}, tests: [fakeTest({ code: '6E2-26T1', title: 'Fracții' })] }));
    expect(await screen.findByRole('link', { name: 'Fracții' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Primii pași' })).not.toBeInTheDocument();
  });

  it('marks Teste in the menu on test pages', async () => {
    renderAdmin('/teste/6E2-26T2', withTests());
    const menu = await screen.findByRole('navigation', { name: 'Meniu' });
    expect(within(menu).getByRole('link', { name: 'Teste' })).toHaveAttribute('aria-current', 'page');
    expect(within(menu).getByRole('button', { name: 'Clase' })).not.toHaveAttribute('aria-current');
  });
});

const withWaiting = () =>
  createFakeApi({
    classes: [
      { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 2, name: '6E3', schoolYear: 2026, archived: false, studentCount: 0 },
    ],
    students: {},
    tests: [
      fakeTest({ code: '6E2-26T2', title: 'Logaritmi', status: 'done', ...ready, ...started }, [
        fakeUpload({ studentId: 10, studentName: 'Pop Ion', status: 'graded', submissionId: 5, grade: 9 }),
      ]),
      fakeTest({ code: '6E2-26T1', title: 'Ecuații', status: 'done', ...ready, ...started }, [
        fakeUpload({ studentId: 11, studentName: 'Stan Eva', status: 'graded', submissionId: 6, grade: 7, flagCount: 3 }),
      ]),
      fakeTest({ code: '6E3-26T1', title: 'Pătrate', classId: 2, className: '6E3', status: 'open', ...ready, ...started }),
    ],
  });

describe('TestsPage, what waits', () => {
  it('opens the list of what waits in place, for every class, the first button filled', async () => {
    renderAdmin('/?clasa=2', withWaiting());
    const toggle = await screen.findByRole('button', { name: '2 lucruri te așteaptă' });
    expect(screen.getByText(/în 2 teste\.$/)).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'todo-inline');
    expect(document.getElementById('todo-inline')).not.toBeVisible();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('region', { name: 'Ce ai de făcut' });
    expect(list).toHaveAttribute('id', 'todo-inline');
    expect(list).toBeVisible();
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Verificare Decide 3 puncte nesigureEcuații · Clasa 6E2Începe',
      'Rezultate Publică rezultateleLogaritmi · Clasa 6E2Deschide',
    ]);
    const first = within(list).getByRole('link', { name: 'Începe: Ecuații, Clasa 6E2' });
    expect(first).toHaveClass('button');
    expect(first).toHaveAttribute('href', '/teste/6E2-26T1/verificare');
    expect(within(list).getByRole('link', { name: 'Deschide: Logaritmi, Clasa 6E2' })).toHaveClass('button-quiet');

    await userEvent.click(toggle);
    expect(list).not.toBeVisible();
  });

  it('counts one thing in the singular', async () => {
    renderAdmin(
      '/',
      createFakeApi({
        classes: oneClass,
        students: {},
        tests: [fakeTest({ code: '6E2-26T1', title: 'Ecuații', status: 'draft', ...ready, barem: { request: 'none', unchecked: true } })],
      }),
    );
    expect(await screen.findByRole('button', { name: '1 lucru te așteaptă' })).toBeInTheDocument();
    expect(screen.getByText(/în 1 test\.$/)).toBeInTheDocument();
  });

  it('says so when nothing waits, with no button', async () => {
    const file = { name: 'f.pdf', type: 'application/pdf' };
    const ready = fakeTest({ code: '6E2-26T1', title: 'Fracții', files: { test: file, barem: file } });
    renderAdmin('/', createFakeApi({ classes: oneClass, students: {}, tests: [ready] }));
    expect(await screen.findByText(/Nimic nu te așteaptă acum\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /te așteaptă/ })).not.toBeInTheDocument();
  });

  it('gives each test one next step, the first thing in "De făcut" filled', async () => {
    renderAdmin(
      '/',
      createFakeApi({
        classes: oneClass,
        students: {},
        tests: [
          fakeTest({ code: '6E2-26T3', title: 'Simulare', status: 'evaluating', ...ready, ...started }),
          fakeTest({ code: '6E2-26T2', title: 'Mulțimi', status: 'open', ...ready, ...started }),
          fakeTest({ code: '6E2-26T1', title: 'Ecuații', status: 'done', ...ready, ...started }, [
            fakeUpload({ studentId: 11, studentName: 'Stan Eva', status: 'graded', submissionId: 6, grade: 7, flagCount: 3 }),
          ]),
        ],
      }),
    );
    const check = await screen.findByRole('link', { name: 'Verifică 3 puncte: Ecuații, Clasa 6E2' });
    expect(check).toHaveClass('button');
    expect(check).toHaveAttribute('href', '/teste/6E2-26T1/verificare');
    expect(screen.getByRole('link', { name: 'Pornește corectarea: Mulțimi, Clasa 6E2' })).toHaveClass('button-quiet');
    expect(within(rowOf('Simulare')).getByText('Nimic de făcut acum')).toBeInTheDocument();
  });

  it('puts the tests in work first and the finished ones under "Terminate"', async () => {
    renderAdmin(
      '/',
      createFakeApi({
        classes: oneClass,
        students: {},
        tests: [
          fakeTest({ code: '6E2-26T3', title: 'Logaritmi', status: 'done', resultsOpen: true, ...ready, ...started }, [
            fakeUpload({ studentId: 10, studentName: 'Pop Ion', status: 'graded', submissionId: 5, grade: 9 }),
          ]),
          fakeTest({ code: '6E2-26T2', title: 'Fracții', status: 'done', ...ready, ...started }, [
            fakeUpload({ studentId: 11, studentName: 'Stan Eva', status: 'graded', submissionId: 6, grade: 7 }),
          ]),
          fakeTest({ code: '6E2-26T1', title: 'Ecuații', status: 'open', ...ready, ...started }),
        ],
      }),
    );
    const working = await screen.findByRole('region', { name: 'În lucru' });
    const finished = screen.getByRole('region', { name: 'Terminate' });
    expect(within(working).getAllByRole('link', { name: /^(Ecuații|Fracții)$/ })).toHaveLength(2);
    expect(within(finished).getByRole('link', { name: 'Logaritmi' })).toBeInTheDocument();
    expect(stageText(rowOf('Logaritmi'))).toHaveTextContent('Rezultate · publicate · media testului 9');
    expect(working.compareDocumentPosition(finished) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('leaves out a group with no test', async () => {
    renderAdmin('/', createFakeApi({ classes: oneClass, students: {}, tests: [fakeTest({ code: '6E2-26T1', title: 'Fracții' })] }));
    expect(await screen.findByRole('region', { name: 'În lucru' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Terminate' })).not.toBeInTheDocument();
  });
});

const withManyClasses = () =>
  createFakeApi({
    classes: [
      { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 2, name: '6E3', schoolYear: 2026, archived: false, studentCount: 0 },
    ],
    students: {},
    tests: [
      fakeTest({ code: '6E2-26T1', title: 'Fracții' }),
      fakeTest({ code: '6E3-26T1', title: 'Pătrate', classId: 2, className: '6E3' }),
      fakeTest({ code: '6E3-26T2', title: 'Vechi', classId: 2, className: '6E3', status: 'done', archived: true }),
    ],
  });

const chip = (name: string) => within(screen.getByRole('group', { name: 'Clasa' })).getByRole('button', { name });

describe('TestsPage filters', () => {
  it('filters the tests by class and keeps the choice in the address', async () => {
    renderAdmin('/', withManyClasses(), <LocationProbe />);
    expect(await screen.findByRole('link', { name: 'Fracții' })).toBeInTheDocument();
    expect(chip('Toate clasele')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(chip('Clasa 6E3'));
    expect(screen.queryByRole('link', { name: 'Fracții' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pătrate' })).toBeInTheDocument();
    expect(chip('Clasa 6E3')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Toate clasele')).toHaveAttribute('aria-pressed', 'false');
    await expectLocation('/?clasa=2');
    await userEvent.click(chip('Toate clasele'));
    expect(await screen.findByRole('link', { name: 'Fracții' })).toBeInTheDocument();
    await expectLocation(/^\/$/);
  });

  it('opens with the class from the address', async () => {
    renderAdmin('/?clasa=2', withManyClasses());
    expect(await screen.findByRole('link', { name: 'Pătrate' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Fracții' })).not.toBeInTheDocument();
    expect(chip('Clasa 6E3')).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows all tests when the class in the address is not a class of the year', async () => {
    renderAdmin('/?clasa=99&arhivate=1', withManyClasses(), <LocationProbe />);
    expect(await screen.findByRole('link', { name: 'Fracții' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pătrate' })).toBeInTheDocument();
    expect(chip('Toate clasele')).toHaveAttribute('aria-pressed', 'true');
    await expectLocation('/?arhivate=1');
  });

  it('hides archived tests until asked, then shows them finished and marked', async () => {
    renderAdmin('/', withManyClasses(), <LocationProbe />);
    expect(await screen.findByRole('link', { name: 'Pătrate' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Vechi' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Arată și testele arhivate'));
    const row = await findRow('Vechi');
    expect(within(row).getByText('Arhivat')).toHaveClass('tag');
    expect(row).toHaveClass('is-muted');
    expect(within(screen.getByRole('region', { name: 'Terminate' })).getByRole('link', { name: 'Vechi' })).toBeInTheDocument();
    await expectLocation('/?arhivate=1');
    await userEvent.click(screen.getByLabelText('Arată și testele arhivate'));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Vechi' })).not.toBeInTheDocument());
    await expectLocation(/^\/$/);
  });

  it('opens with the archived tests when the address asks', async () => {
    renderAdmin('/?arhivate=1', withManyClasses());
    expect(await screen.findByRole('link', { name: 'Vechi' })).toBeInTheDocument();
    expect(screen.getByLabelText('Arată și testele arhivate')).toBeChecked();
  });

  it('keeps the other choice when one changes', async () => {
    renderAdmin('/?arhivate=1', withManyClasses(), <LocationProbe />);
    await screen.findByRole('link', { name: 'Vechi' });
    await userEvent.click(chip('Clasa 6E3'));
    await expectLocation('/?arhivate=1&clasa=2');
  });

  it('says so when the choice leaves no test', async () => {
    renderAdmin(
      '/?clasa=1',
      createFakeApi({
        classes: [
          { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
          { id: 2, name: '6E3', schoolYear: 2026, archived: false, studentCount: 0 },
        ],
        students: {},
        tests: [fakeTest({ code: '6E3-26T1', classId: 2, className: '6E3' })],
      }),
    );
    expect(await screen.findByText('Nu ai teste pentru această alegere.')).toBeInTheDocument();
  });
});

const gradedUpload = () => fakeUpload({ studentId: 10, studentName: 'Pop Ion', status: 'graded', submissionId: 5, grade: 9 });

const withPublishing = (overrides: Parameters<typeof fakeTest>[0] = {}) =>
  createFakeApi({
    classes: oneClass,
    students: {},
    tests: [fakeTest({ code: '6E2-26T1', title: 'Fracții', status: 'done', ...ready, ...started, ...overrides }, [gradedUpload()])],
  });

describe('TestsPage results', () => {
  it('shows no publish button on a test with nothing graded, as the test page does', async () => {
    renderAdmin('/', createFakeApi({ classes: oneClass, students: {}, tests: [fakeTest({ code: '6E2-26T1', title: 'Fracții', status: 'open', ...ready })] }));
    const row = await findRow('Fracții');
    expect(within(row).queryByRole('button', { name: /^Publică/ })).not.toBeInTheDocument();
  });

  it('publishes results from the list, and the test moves to "Terminate"', async () => {
    const api = withPublishing();
    renderAdmin('/', api);
    const row = await findRow('Fracții');
    expect(stageText(row)).toHaveTextContent('Rezultate · nepublicate');
    expect([...row.querySelector('.stage-bars')!.children].at(-1)).toHaveClass('is-wait');
    await userEvent.click(within(row).getByRole('button', { name: 'Publică rezultatele: Fracții, Clasa 6E2' }));
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', true);
    const finished = await screen.findByRole('region', { name: 'Terminate' });
    const moved = within(finished).getByRole('link', { name: 'Fracții' }).closest('tr')!;
    expect(stageText(moved)).toHaveTextContent('Rezultate · publicate · media testului 9');
    expect(within(moved).getByRole('button', { name: 'Oprește accesul: Fracții, Clasa 6E2' })).toBeInTheDocument();
  });

  it('keeps the button busy until the list is read again, so a publish cannot act twice', async () => {
    const api = withPublishing();
    renderAdmin('/', api);
    const row = await findRow('Fracții');
    const read = api.listTests.getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    api.listTests.mockImplementationOnce(async (schoolYear: number) => {
      await gate;
      return read(schoolYear);
    });
    const publish = within(row).getByRole('button', { name: 'Publică rezultatele: Fracții, Clasa 6E2' });
    await userEvent.click(publish);
    await waitFor(() => expect(api.listTests).toHaveBeenCalledTimes(2));
    expect(publish).toBeDisabled();
    await userEvent.click(publish);
    expect(api.setResultsOpen).toHaveBeenCalledTimes(1);
    release();
    const finished = await screen.findByRole('region', { name: 'Terminate' });
    expect(within(finished).getByRole('link', { name: 'Fracții' })).toBeInTheDocument();
  });

  it('refreshes the test page data after a publish from the list', async () => {
    const api = withPublishing();
    const { queryClient } = renderAdmin('/', api);
    const row = await findRow('Fracții');
    queryClient.setQueryData(['test', '6E2-26T1'], { stale: true });
    await userEvent.click(within(row).getByRole('button', { name: /^Publică rezultatele/ }));
    await screen.findByRole('region', { name: 'Terminate' });
    expect(queryClient.getQueryState(['test', '6E2-26T1'])?.isInvalidated).toBe(true);
  });

  it('shows the points that wait in the stage, with their next step', async () => {
    renderAdmin('/', withPublishing({ flagCount: 3 }));
    const row = await findRow('Fracții');
    expect(stageText(row)).toHaveTextContent('Verificare · 3 puncte nesigure');
    expect(within(row).getByRole('link', { name: 'Verifică 3 puncte: Fracții, Clasa 6E2' })).toBeInTheDocument();
  });

  it('shows no points to check when none wait', async () => {
    renderAdmin('/', withPublishing({ flagCount: 0 }));
    const row = await findRow('Fracții');
    expect(stageText(row)).not.toHaveTextContent('Verificare');
    expect(within(row).queryByRole('link', { name: /^Verifică/ })).not.toBeInTheDocument();
  });

  it('stops access from the list, and the test waits again', async () => {
    const api = withPublishing({ resultsOpen: true });
    renderAdmin('/', api);
    const row = await findRow('Fracții');
    expect(stageText(row)).toHaveTextContent('Rezultate · publicate');
    await userEvent.click(within(row).getByRole('button', { name: 'Oprește accesul: Fracții, Clasa 6E2' }));
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', false);
    const working = await screen.findByRole('region', { name: 'În lucru' });
    expect(stageText(within(working).getByRole('link', { name: 'Fracții' }).closest('tr')!)).toHaveTextContent('Rezultate · nepublicate');
  });

  it('gives an archived test with open results one way to close them: its next step', async () => {
    for (const open of [{ resultsOpen: true }, { publishedCount: 1 }]) {
      const view = renderAdmin('/?arhivate=1', withPublishing({ archived: true, ...open }));
      const row = await findRow('Fracții');
      expect(stageText(row)).toHaveTextContent('Rezultate · publicate · test arhivat');
      expect(within(row).getAllByRole('link', { name: /^Oprește accesul/ })).toHaveLength(1);
      expect(within(row).getByRole('link', { name: 'Oprește accesul: Fracții, Clasa 6E2' })).toHaveAttribute('href', '/teste/6E2-26T1#rezultate');
      expect(within(row).queryByRole('button', { name: /Oprește accesul|Publică/ })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('shows results published for some students, and publishes for all', async () => {
    const api = withPublishing({ gradedCount: 3, publishedCount: 2 });
    renderAdmin('/', api);
    const row = await findRow('Fracții');
    expect(stageText(row)).toHaveTextContent('Rezultate · publicate pentru 2 elevi');
    await userEvent.click(within(row).getByRole('button', { name: 'Publică pentru toți: Fracții, Clasa 6E2' }));
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', true);
    const finished = await screen.findByRole('region', { name: 'Terminate' });
    expect(stageText(within(finished).getByRole('link', { name: 'Fracții' }).closest('tr')!)).toHaveTextContent('Rezultate · publicate · media testului 9');
  });

  it('counts a single published student in the singular', async () => {
    renderAdmin('/', withPublishing({ gradedCount: 3, publishedCount: 1 }));
    expect(stageText(await findRow('Fracții'))).toHaveTextContent('Rezultate · publicate pentru 1 elev');
  });

  it('shows the whole test as published even when single publishes are counted', async () => {
    renderAdmin('/', withPublishing({ resultsOpen: true, publishedCount: 3 }));
    const row = await findRow('Fracții');
    expect(stageText(row)).toHaveTextContent('Rezultate · publicate · media testului 9');
    expect(stageText(row)).not.toHaveTextContent('pentru');
  });

  it('offers no results control for a draft or an ungraded test', async () => {
    renderAdmin(
      '/',
      createFakeApi({
        classes: oneClass,
        students: {},
        tests: [
          fakeTest({ code: '6E2-26T1', title: 'Fracții', status: 'draft', gradedCount: 2 }),
          fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'open', ...ready }, [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted' })]),
        ],
      }),
    );
    expect(await screen.findByRole('link', { name: 'Ecuații' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fracții' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Publică|Oprește accesul/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/publicate/)).not.toBeInTheDocument();
  });

  it('shows the server message under the row when publishing fails', async () => {
    const api = withPublishing();
    api.setResultsOpen.mockRejectedValueOnce(new ApiError(409, 'busy', 'Nu am putut publica rezultatele.'));
    renderAdmin('/', api);
    const row = await findRow('Fracții');
    await userEvent.click(within(row).getByRole('button', { name: /^Publică rezultatele/ }));
    expect(await within(row).findByRole('alert')).toHaveTextContent('Nu am putut publica rezultatele.');
    expect(stageText(row)).toHaveTextContent('Rezultate · nepublicate');
  });

  it('links the class report of published results', async () => {
    renderAdmin(
      '/',
      createFakeApi({
        classes: oneClass,
        students: {},
        tests: [
          fakeTest({ code: '6E2-26T1', title: 'Fracții', status: 'done', resultsOpen: true, ...ready, ...started }, [gradedUpload()]),
          fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'open', ...ready, ...started }, [fakeUpload({ studentId: 10, studentName: 'Pop Ion' })]),
        ],
      }),
    );
    const graded = await findRow('Fracții');
    expect(within(graded).getByRole('link', { name: 'Raportul clasei: Fracții, Clasa 6E2' })).toHaveAttribute('href', '/teste/6E2-26T1/raport');
    expect(within(rowOf('Ecuații')).queryByRole('link', { name: /^Raportul clasei/ })).not.toBeInTheDocument();
  });
});

describe('TestsPage small details', () => {
  it('puts a space between the title of an archived test and its tag', async () => {
    renderAdmin('/?arhivate=1', createFakeApi({ classes: oneClass, students: {}, tests: [fakeTest({ code: '6E2-26T1', title: 'Vechi', status: 'done', archived: true })] }));
    const row = await findRow('Vechi');
    expect(row.querySelector('th')!.textContent).toMatch(/^Vechi Arhivat/);
  });

  it('calls a test a draft by its status, not by a start date it may keep', async () => {
    renderAdmin('/', createFakeApi({ classes: oneClass, students: {}, tests: [fakeTest({ code: '6E2-26T1', title: 'Fracții', ...started })] }));
    const row = await findRow('Fracții');
    expect(within(row).getByText('Clasa 6E2 · ciornă')).toBeInTheDocument();
  });

  it('gives each table the name of its group', async () => {
    renderAdmin('/', withTests());
    await findRow('Ecuații');
    expect(screen.getByRole('table', { name: 'În lucru' })).toBeInTheDocument();
  });

  it('moves the focus to the test link when a publish moves the row', async () => {
    renderAdmin('/', withPublishing());
    const row = await findRow('Fracții');
    await userEvent.click(within(row).getByRole('button', { name: 'Publică rezultatele: Fracții, Clasa 6E2' }));
    const finished = await screen.findByRole('region', { name: 'Terminate' });
    await waitFor(() => expect(within(finished).getByRole('link', { name: 'Fracții' })).toHaveFocus());
  });

  it('changes the greeting when the hour passes while the page is open', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-11-04T08:59:30.000Z'));
    renderAdmin('/', withTests());
    expect(await screen.findByRole('heading', { level: 1, name: 'Bună dimineața, Laura.' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Bună ziua, Laura.' })).toBeInTheDocument();
  });
});
