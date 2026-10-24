import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api.ts';
import { createFakeApi, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';

const withTests = () =>
  createFakeApi({
    classes: [
      { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 2, name: '6E3', schoolYear: 2026, archived: false, studentCount: 0 },
    ],
    students: {},
    tests: [
      fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'open', startedAt: '2026-10-06T07:15:00.000Z' }, [
        fakeUpload({ studentId: 10, studentName: 'Pop Ion', status: 'graded', submissionId: 5, grade: 9, flagCount: 2 }),
        fakeUpload({ studentId: 11, studentName: 'Stan Eva' }),
      ]),
      fakeTest({ code: '6E2-26T1', title: 'Fracții' }),
      fakeTest({ code: '6E2-27T1', title: 'Anul viitor', schoolYear: 2027 }),
    ],
  });

describe('TestsPage', () => {
  it('is the start page and lists the tests of the selected school year', async () => {
    const api = withTests();
    renderAdmin('/', api);
    expect(await screen.findByRole('heading', { name: 'Teste 2026-2027' })).toBeInTheDocument();
    const card = (await screen.findByRole('link', { name: '6E2-26T2' })).closest('li')!;
    expect(within(card).getByText('Ecuații')).toBeInTheDocument();
    expect(within(card).getByText('Clasa 6E2')).toBeInTheDocument();
    expect(within(card).getByText(/6 oct\. 2026, 10:15/)).toBeInTheDocument();
    expect(within(card).getByText('Deschis')).toBeInTheDocument();
    expect(within(card).getByText('Trimise: 1 din 2 · corectate: 1 · de verificat: 2')).toBeInTheDocument();

    const draft = screen.getByRole('link', { name: '6E2-26T1' }).closest('li')!;
    expect(within(draft).getByText('Ciornă')).toBeInTheDocument();
    expect(within(draft).queryByText(/Trimise/)).not.toBeInTheDocument();
    expect(screen.queryByText('Anul viitor')).not.toBeInTheDocument();
    expect(api.listTests).toHaveBeenCalledWith(2026);
    expect(api.listClasses).toHaveBeenCalledWith(2026);
  });

  it('links each test to its page and offers a new test', async () => {
    renderAdmin('/', withTests());
    expect(await screen.findByRole('link', { name: '6E2-26T2' })).toHaveAttribute('href', '/teste/6E2-26T2');
    expect(screen.getByRole('link', { name: 'Test nou' })).toHaveAttribute('href', '/teste/nou');
  });

  it('says so when the year has no tests', async () => {
    renderAdmin('/', createFakeApi());
    expect(await screen.findByText('Nu ai niciun test în acest an școlar.')).toBeInTheDocument();
  });

  it('marks Teste in the menu on test pages and Clase on class pages', async () => {
    renderAdmin('/', withTests());
    const menu = await screen.findByRole('navigation', { name: 'Meniu' });
    expect(within(menu).getByRole('link', { name: 'Teste' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(within(menu).getByRole('link', { name: 'Clase' }));
    expect(within(menu).getByRole('link', { name: 'Clase' })).toHaveAttribute('aria-current', 'page');
    expect(within(menu).getByRole('link', { name: 'Teste' })).not.toHaveAttribute('aria-current');
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

describe('TestsPage filters', () => {
  it('filters the tests by class and keeps the choice in the address', async () => {
    renderAdmin('/', withManyClasses(), <LocationProbe />);
    expect(await screen.findByRole('link', { name: '6E2-26T1' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Clasa'), 'Clasa 6E3');
    expect(screen.queryByRole('link', { name: '6E2-26T1' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '6E3-26T1' })).toBeInTheDocument();
    await expectLocation('/?clasa=2');
    await userEvent.selectOptions(screen.getByLabelText('Clasa'), 'Toate clasele');
    expect(await screen.findByRole('link', { name: '6E2-26T1' })).toBeInTheDocument();
    await expectLocation(/^\/$/);
  });

  it('opens with the class from the address', async () => {
    renderAdmin('/?clasa=2', withManyClasses());
    expect(await screen.findByRole('link', { name: '6E3-26T1' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '6E2-26T1' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Clasa')).toHaveValue('2');
  });

  it('shows all tests when the class in the address is not a class of the year', async () => {
    renderAdmin('/?clasa=99&arhivate=1', withManyClasses(), <LocationProbe />);
    expect(await screen.findByRole('link', { name: '6E2-26T1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '6E3-26T1' })).toBeInTheDocument();
    expect(screen.getByLabelText('Clasa')).toHaveValue('');
    await expectLocation('/?arhivate=1');
  });

  it('hides archived tests until asked', async () => {
    renderAdmin('/', withManyClasses(), <LocationProbe />);
    expect(await screen.findByRole('link', { name: '6E3-26T1' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '6E3-26T2' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Arată și testele arhivate'));
    const card = (await screen.findByRole('link', { name: '6E3-26T2' })).closest('li')!;
    expect(within(card).getByText('Arhivat')).toBeInTheDocument();
    expect(card).toHaveClass('is-muted');
    await expectLocation('/?arhivate=1');
    await userEvent.click(screen.getByLabelText('Arată și testele arhivate'));
    await waitFor(() => expect(screen.queryByRole('link', { name: '6E3-26T2' })).not.toBeInTheDocument());
    await expectLocation(/^\/$/);
  });

  it('opens with the archived tests when the address asks', async () => {
    renderAdmin('/?arhivate=1', withManyClasses());
    expect(await screen.findByRole('link', { name: '6E3-26T2' })).toBeInTheDocument();
    expect(screen.getByLabelText('Arată și testele arhivate')).toBeChecked();
  });

  it('keeps the other choice when one changes', async () => {
    renderAdmin('/?arhivate=1', withManyClasses(), <LocationProbe />);
    await screen.findByRole('link', { name: '6E3-26T2' });
    await userEvent.selectOptions(screen.getByLabelText('Clasa'), 'Clasa 6E3');
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

  it('colours each card by its class', async () => {
    renderAdmin('/', withManyClasses());
    const first = (await screen.findByRole('link', { name: '6E2-26T1' })).closest('li')!;
    const second = screen.getByRole('link', { name: '6E3-26T1' }).closest('li')!;
    expect(first).toHaveClass('card', 'has-tone', 'class-tone');
    expect(second).toHaveClass('card', 'has-tone', 'class-tone');
    expect(first.getAttribute('style')).toContain('--tone-hue');
    expect(first.getAttribute('style')).not.toBe(second.getAttribute('style'));
    expect(within(first).getByText('Clasa 6E2')).toHaveClass('class-badge');
  });
});

const gradedUpload = () => fakeUpload({ studentId: 10, studentName: 'Pop Ion', status: 'graded', submissionId: 5, grade: 9 });

const withPublishing = (overrides: Parameters<typeof fakeTest>[0] = {}) =>
  createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
    students: {},
    tests: [fakeTest({ code: '6E2-26T1', status: 'done', ...overrides }, [gradedUpload()])],
  });

describe('TestsPage results', () => {
  it('publishes results from the list', async () => {
    const api = withPublishing();
    renderAdmin('/', api);
    const card = (await screen.findByRole('link', { name: '6E2-26T1' })).closest('li')!;
    expect(within(card).getByText('Rezultate nepublicate')).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: /^Publică rezultatele/ }));
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', true);
    expect(await within(card).findByText('Rezultate publicate')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /^Oprește accesul/ })).toBeInTheDocument();
  });

  it('refreshes the test page data after a publish from the list', async () => {
    const api = withPublishing();
    const { queryClient } = renderAdmin('/', api);
    await screen.findByRole('link', { name: '6E2-26T1' });
    queryClient.setQueryData(['test', '6E2-26T1'], { stale: true });
    const card = screen.getByRole('link', { name: '6E2-26T1' }).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: /^Publică rezultatele/ }));
    await within(card).findByText('Rezultate publicate');
    expect(queryClient.getQueryState(['test', '6E2-26T1'])?.isInvalidated).toBe(true);
  });

  it('marks a test with unchecked grades with a "de verificat" label', async () => {
    renderAdmin('/', withPublishing({ flagCount: 3 }));
    const card = (await screen.findByRole('link', { name: '6E2-26T1' })).closest('li')!;
    expect(within(card).getByText('de verificat')).toHaveClass('tag');
  });

  it('shows no "de verificat" label when nothing waits for a check', async () => {
    renderAdmin('/', withPublishing({ flagCount: 0 }));
    const card = (await screen.findByRole('link', { name: '6E2-26T1' })).closest('li')!;
    expect(within(card).queryByText('de verificat')).not.toBeInTheDocument();
  });

  it('shows the publish state as a label, grey when unpublished, and keeps it with the actions at the foot', async () => {
    renderAdmin('/', withPublishing());
    const card = (await screen.findByRole('link', { name: '6E2-26T1' })).closest('li')!;
    const label = within(card).getByText('Rezultate nepublicate');
    expect(label).toHaveClass('tag', 'tag-muted');
    const foot = label.closest('.card-foot')!;
    expect(within(foot as HTMLElement).getByRole('button', { name: /^Publică rezultatele/ })).toBeInTheDocument();
    expect(within(foot as HTMLElement).getByRole('link', { name: 'Raportul clasei' })).toBeInTheDocument();
  });

  it('shows published results as a green label', async () => {
    renderAdmin('/', withPublishing({ resultsOpen: true }));
    const card = (await screen.findByRole('link', { name: '6E2-26T1' })).closest('li')!;
    expect(within(card).getByText('Rezultate publicate')).toHaveClass('tag', 'tag-ok');
  });

  it('stops access from the list', async () => {
    const api = withPublishing({ resultsOpen: true });
    renderAdmin('/', api);
    const card = (await screen.findByRole('link', { name: '6E2-26T1' })).closest('li')!;
    expect(within(card).getByText('Rezultate publicate')).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: /^Oprește accesul/ }));
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', false);
    expect(await within(card).findByText('Rezultate nepublicate')).toBeInTheDocument();
  });

  it('shows results published for some students', async () => {
    const api = withPublishing({ publishedCount: 2 });
    renderAdmin('/', api);
    const card = (await screen.findByRole('link', { name: '6E2-26T1' })).closest('li')!;
    expect(within(card).getByText('Publicate pentru 2 elevi')).toBeInTheDocument();
    expect(within(card).queryByText('Rezultate nepublicate')).not.toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: /^Publică pentru toți/ }));
    expect(api.setResultsOpen).toHaveBeenCalledWith('6E2-26T1', true);
    expect(await within(card).findByText('Rezultate publicate')).toBeInTheDocument();
  });

  it('counts a single published student in the singular', async () => {
    renderAdmin('/', withPublishing({ publishedCount: 1 }));
    expect(await screen.findByText('Publicate pentru 1 elev')).toBeInTheDocument();
  });

  it('shows the whole test as published even when single publishes are counted', async () => {
    renderAdmin('/', withPublishing({ resultsOpen: true, publishedCount: 3 }));
    expect(await screen.findByText('Rezultate publicate')).toBeInTheDocument();
    expect(screen.queryByText(/Publicate pentru/)).not.toBeInTheDocument();
  });

  it('offers no results control for a draft or an ungraded test', async () => {
    renderAdmin(
      '/',
      createFakeApi({
        classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
        students: {},
        tests: [
          fakeTest({ code: '6E2-26T1', status: 'draft', gradedCount: 2 }),
          fakeTest({ code: '6E2-26T2', status: 'open' }, [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted' })]),
        ],
      }),
    );
    expect(await screen.findByRole('link', { name: '6E2-26T2' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '6E2-26T1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Publică|Oprește accesul/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Rezultate (nepublicate|publicate)/)).not.toBeInTheDocument();
  });

  it('shows the server message under the card when publishing fails', async () => {
    const api = withPublishing();
    api.setResultsOpen.mockRejectedValueOnce(new ApiError(409, 'busy', 'Nu am putut publica rezultatele.'));
    renderAdmin('/', api);
    const card = (await screen.findByRole('link', { name: '6E2-26T1' })).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: /^Publică rezultatele/ }));
    expect(await within(card).findByRole('alert')).toHaveTextContent('Nu am putut publica rezultatele.');
    expect(within(card).getByText('Rezultate nepublicate')).toBeInTheDocument();
  });

  it('links the class report when a result is graded', async () => {
    renderAdmin(
      '/',
      createFakeApi({
        classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
        students: {},
        tests: [
          fakeTest({ code: '6E2-26T1', status: 'done' }, [gradedUpload()]),
          fakeTest({ code: '6E2-26T2', status: 'open' }, [fakeUpload({ studentId: 10, studentName: 'Pop Ion' })]),
        ],
      }),
    );
    const graded = (await screen.findByRole('link', { name: '6E2-26T1' })).closest('li')!;
    expect(within(graded).getByRole('link', { name: 'Raportul clasei' })).toHaveAttribute('href', '/teste/6E2-26T1/raport');
    const open = screen.getByRole('link', { name: '6E2-26T2' }).closest('li')!;
    expect(within(open).queryByRole('link', { name: 'Raportul clasei' })).not.toBeInTheDocument();
  });
});
