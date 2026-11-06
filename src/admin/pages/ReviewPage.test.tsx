import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { SubmissionDetail, UploadRow } from '../../../shared/api.ts';
import { ApiError, submissionFileUrl } from '../api.ts';
import { createFakeApi, fakeEvaluation, fakeItem, fakeSubmission, fakeTest, fakeUpload, reviewPointsOf } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';

// The review of the points to check (redesign spec §7).
const PAGE = '/teste/6E2-26T1/verificare';
const GRADED_AT = '2026-10-07T09:00:00.000Z';

const photo = (id: number, name: string) => ({ id, name, contentType: 'image/jpeg', size: 1000, position: id });

// Ana: the second page could not be read, and II.1 waits (1p of 2p). Ion:
// I.3 waits (3p of 5p). Eva: nothing to check, a PDF. Dan: not graded yet.
function papers(): SubmissionDetail[] {
  return [
    fakeSubmission({
      id: 11,
      studentId: 1,
      studentName: 'Ana Pop',
      files: [photo(101, 'a1.jpg'), photo(102, 'a2.jpg'), { id: 103, name: 'a3.pdf', contentType: 'application/pdf', size: 1000, position: 3 }],
      evaluation: fakeEvaluation(
        [
          fakeItem({ id: 31, exerciseId: 'I.1', label: 'Subiectul I, ex. 1', points: 4.5 }),
          fakeItem({
            id: 32,
            exerciseId: 'II.1',
            label: 'Subiectul II, ex. 1',
            points: 1,
            maxPoints: 2,
            studentAnswer: 'x = 3',
            comment: 'Verifică semnul.',
            needsReview: true,
            reviewReason: 'Scrisul nu se citește.',
          }),
        ],
        { unreadable: ['student/page-02.jpg'] },
      ),
    }),
    fakeSubmission({
      id: 14,
      studentId: 4,
      studentName: 'Ion Popa',
      files: [photo(141, 'i1.jpg')],
      evaluation: fakeEvaluation([
        fakeItem({ id: 41, exerciseId: 'I.3', label: 'Subiectul I, ex. 3', points: 3, maxPoints: 5, needsReview: true, reviewReason: 'Răspunsul e tăiat.' }),
      ]),
    }),
    fakeSubmission({
      id: 13,
      studentId: 3,
      studentName: 'Eva Stan',
      files: [{ id: 131, name: 'e.pdf', contentType: 'application/pdf', size: 1000, position: 1 }],
      evaluation: fakeEvaluation([fakeItem({ id: 51, exerciseId: 'I.1', label: 'Subiectul I, ex. 1', points: 4 })]),
    }),
  ];
}

// The uploads table of the same papers, sorted by name, Dan's upload, and
// Mara, who sent nothing.
function rowsOf(submissions: SubmissionDetail[]): UploadRow[] {
  const rows = submissions.map((paper) =>
    fakeUpload({
      studentId: paper.studentId,
      studentName: paper.studentName,
      submissionId: paper.id,
      status: 'graded',
      fileCount: paper.files.length,
      grade: paper.evaluation!.grade,
      total: paper.evaluation!.total,
      maxTotal: paper.evaluation!.maxTotal,
      flagCount: paper.evaluation!.flagCount,
      reviewPoints: reviewPointsOf(paper.evaluation),
    }),
  );
  rows.push(fakeUpload({ studentId: 2, studentName: 'Dan Marin', submissionId: 12, status: 'submitted', fileCount: 1 }));
  rows.push(fakeUpload({ studentId: 5, studentName: 'Mara Ilie' }));
  return rows.sort((a, b) => a.studentName.localeCompare(b.studentName));
}

function apiWith(submissions = papers()) {
  return createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 4 }],
    students: {},
    tests: [fakeTest({ status: 'done', startedAt: '2026-10-06T07:00:00.000Z' }, rowsOf(submissions))],
    submissions,
  });
}

// The whole address, so a shorter one does not match a longer one.
const at = (search: string) => new RegExp(`^${(PAGE + search).replace(/[?.]/g, '\\$&')}$`);

const queue = () => screen.getByRole('navigation', { name: 'Lucrările' });
const decision = () => screen.getByRole('region', { name: 'Decizia' });

describe('the review of the points to check', () => {
  it('lists the papers with points to check, their points, and the other graded papers', async () => {
    renderAdmin(PAGE, apiWith());
    expect(await screen.findByRole('heading', { level: 1, name: 'Verificare' })).toBeInTheDocument();
    expect(screen.getByText('Fracții · Clasa 6E2 · 3 puncte în 2 lucrări')).toBeInTheDocument();
    const list = queue();
    expect(within(list).getByRole('heading', { name: 'Cu puncte de verificat 2' })).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Ana Pop nota 6,5 2 puncte de verificat' })).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Paginile necitite' })).toHaveAttribute('aria-current', 'true');
    expect(within(list).getByRole('link', { name: 'Subiectul II, ex. 1 · 1p din 2p' })).not.toHaveAttribute('aria-current');
    expect(within(list).getByRole('link', { name: 'Subiectul I, ex. 3 · 3p din 5p' })).toHaveAttribute('href', `${PAGE}?lucrare=14&punct=41`);
    expect(within(list).getByRole('heading', { name: 'Celelalte lucrări 1' })).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Eva Stan nota 5' })).toHaveAttribute('href', `${PAGE}?lucrare=13`);
    expect(within(list).queryByText(/Dan Marin/)).not.toBeInTheDocument();
  });

  it('opens on the first point: the pages Ana could not read, on the first of them', async () => {
    const api = apiWith();
    renderAdmin(PAGE, api, <LocationProbe />);
    expect(await screen.findByText('Ana Pop · pagina 2 din 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagina 2' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('img', { name: 'Pagina 2 a lucrării' })).toHaveAttribute('src', submissionFileUrl(11, 102));
    expect(within(decision()).getByRole('heading', { name: 'Ana Pop · Paginile necitite' })).toBeInTheDocument();
    expect(
      within(decision()).getByText('Robotul nu a putut citi: Pagina 2. Verifică pozele și punctajele exercițiilor de pe ele.'),
    ).toBeInTheDocument();

    await userEvent.click(within(decision()).getByRole('button', { name: 'Am verificat paginile' }));
    expect(api.reviewPages).toHaveBeenCalledWith(11, { pagesReviewed: true, gradedAt: GRADED_AT });
    expect(await within(decision()).findByRole('heading', { name: 'Ana Pop · Subiectul II, ex. 1' })).toBeInTheDocument();
    await expectLocation(at(`?lucrare=11&punct=32`));
    expect(within(queue()).queryByRole('link', { name: 'Paginile necitite' })).not.toBeInTheDocument();
  });

  it("accepts the robot's points, and the next point opens", async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    expect(within(panel).getByText('x = 3')).toBeInTheDocument();
    expect(within(panel).getByText('Verifică semnul.')).toBeInTheDocument();
    expect(within(panel).getByText('De verificat: Scrisul nu se citește.')).toBeInTheDocument();
    expect(within(panel).getByText('2p în barem')).toBeInTheDocument();
    expect(screen.getByText('Ana Pop · pagina 1 din 3')).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 1p' }));
    expect(api.correctItem).toHaveBeenCalledWith(11, 32, { reviewed: true, gradedAt: GRADED_AT });
    expect(await screen.findByRole('heading', { name: 'Ion Popa · Subiectul I, ex. 3' })).toBeInTheDocument();
    await expectLocation(at(`?lucrare=14&punct=41`));
    expect(screen.getByText('Fracții · Clasa 6E2 · 2 puncte în 2 lucrări')).toBeInTheDocument();
  });

  it('says what the grade becomes with another value, and saves it', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    const input = within(panel).getByRole('textbox', { name: 'Alt punctaj, din 2' });
    expect(within(panel).getByText('Total: 6,5 din 10, cu 1 din oficiu')).toBeInTheDocument();
    expect(within(panel).queryByText(/nota devine/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Scade 0,5p' }));
    expect(input).toHaveValue('0,5');
    expect(within(panel).getByText('Cu 0,5p aici, nota devine 6.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Scade 0,5p' }));
    await userEvent.click(screen.getByRole('button', { name: 'Scade 0,5p' }));
    expect(input).toHaveValue('0');
    expect(within(panel).getByText('Cu 0p aici, nota devine 5,5.')).toBeInTheDocument();
    for (let press = 0; press < 5; press += 1) await userEvent.click(screen.getByRole('button', { name: 'Adaugă 0,5p' }));
    expect(input).toHaveValue('2');

    await userEvent.clear(input);
    await userEvent.type(input, '1,25');
    expect(within(panel).getByText('Cu 1,25p aici, nota devine 6,75.')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Salvează' }));
    expect(api.correctItem).toHaveBeenCalledWith(11, 32, { points: 1.25, reviewed: true, gradedAt: GRADED_AT });
    expect(await screen.findByRole('heading', { name: 'Ion Popa · Subiectul I, ex. 3' })).toBeInTheDocument();
  });

  it('refuses a value off the steps of 0,05', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    const input = within(panel).getByRole('textbox', { name: 'Alt punctaj, din 2' });
    await userEvent.clear(input);
    await userEvent.type(input, '0,03{Enter}');
    expect(within(panel).getByRole('alert')).toHaveTextContent('Punctajul este între 0 și 2, din 0,05 în 0,05.');
    expect(within(panel).queryByText(/nota devine/)).not.toBeInTheDocument();
    expect(api.correctItem).not.toHaveBeenCalled();
  });

  it('moves with J and K, changes the page with the numbers, and accepts with A', async () => {
    const api = apiWith();
    renderAdmin(PAGE, api, <LocationProbe />);
    await screen.findByText('Ana Pop · pagina 2 din 3');
    await userEvent.keyboard('j');
    await expectLocation(at(`?lucrare=11&punct=32`));
    await userEvent.keyboard('k');
    await expectLocation(at(`?lucrare=11&punct=pagini`));
    await userEvent.keyboard('k');
    await expectLocation(at(`?lucrare=14&punct=41`));
    await userEvent.keyboard('j');
    await expectLocation(at(`?lucrare=11&punct=pagini`));
    await userEvent.keyboard('3');
    expect(screen.getByText('Ana Pop · pagina 3 din 3')).toBeInTheDocument();
    expect(screen.getByTitle('Pagina 3 a lucrării')).toHaveAttribute('src', submissionFileUrl(11, 103));
    await userEvent.keyboard('9');
    expect(screen.getByText('Ana Pop · pagina 3 din 3')).toBeInTheDocument();
    await userEvent.keyboard('1');
    expect(screen.getByText('Ana Pop · pagina 1 din 3')).toBeInTheDocument();
    await userEvent.keyboard('a');
    expect(api.reviewPages).toHaveBeenCalledWith(11, { pagesReviewed: true, gradedAt: GRADED_AT });
    expect(await within(decision()).findByRole('heading', { name: 'Ana Pop · Subiectul II, ex. 1' })).toBeInTheDocument();
  });

  it('ignores the keys in the stepper field and with Ctrl, Alt or Meta', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    const input = within(panel).getByRole('textbox', { name: 'Alt punctaj, din 2' });
    await userEvent.type(input, 'ajk2');
    expect(input).toHaveValue('1ajk2');
    input.blur();
    await userEvent.keyboard('{Control>}a{/Control}{Alt>}j{/Alt}{Meta>}k{/Meta}');
    expect(api.correctItem).not.toHaveBeenCalled();
    await expectLocation(at(`?lucrare=11&punct=32`));
  });

  it('ignores the keys while a panel of the bar is open', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(await screen.findByRole('button', { name: /^De făcut/ }));
    expect(screen.getByRole('complementary', { name: 'Ce ai de făcut' })).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard('aj');
    expect(api.correctItem).not.toHaveBeenCalled();
    await expectLocation(at(`?lucrare=11&punct=32`));
  });

  it('writes once when A is pressed twice, and no key acts while it saves', async () => {
    const api = apiWith();
    api.correctItem.mockReturnValueOnce(new Promise<never>(() => {}));
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.keyboard('aa');
    expect(api.correctItem).toHaveBeenCalledTimes(1);
    expect(within(panel).getByRole('button', { name: 'Accept 1p' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Următorul punct' })).toBeDisabled();
    await userEvent.keyboard('jk2');
    await expectLocation(at(`?lucrare=11&punct=32`));
    expect(screen.getByText('Ana Pop · pagina 1 din 3')).toBeInTheDocument();
  });

  it('says when every point is checked, with the way to Rezultate', async () => {
    const [ana, ion, eva] = papers();
    ana!.evaluation = fakeEvaluation([fakeItem({ id: 31, exerciseId: 'I.1', label: 'Subiectul I, ex. 1', points: 4.5 })]);
    const api = apiWith([ana!, ion!, eva!]);
    renderAdmin(PAGE, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    expect(within(panel).getByRole('heading', { name: 'Ion Popa · Subiectul I, ex. 3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Următorul punct' })).not.toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 3p' }));
    expect(await screen.findByText(/Toate punctele sunt verificate\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mergi la Rezultate' })).toHaveAttribute('href', '/teste/6E2-26T1#rezultate');
    await expectLocation(at(`?lucrare=14`));
    expect(within(decision()).getByRole('heading', { name: 'Ion Popa' })).toBeInTheDocument();
    expect(within(queue()).getByText('Niciuna.')).toBeInTheDocument();
  });

  it('reads the paper again when it was graded again in the meantime', async () => {
    const api = apiWith();
    api.correctItem.mockRejectedValueOnce(new ApiError(409, 'not_graded', 'Lucrarea se corectează din nou. Reîncarcă pagina.'));
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    expect(api.getSubmission).toHaveBeenCalledTimes(1);
    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 1p' }));
    expect(await within(decision()).findByText('Lucrarea se corectează din nou. Reîncarcă pagina.')).toBeInTheDocument();
    expect(api.getSubmission).toHaveBeenCalledTimes(2);
    await expectLocation(at(`?lucrare=11&punct=32`));
  });

  it('shows a paper with no point to check: its total, its exercises and its page', async () => {
    renderAdmin(`${PAGE}?lucrare=13`, apiWith());
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    expect(within(panel).getByRole('heading', { name: 'Eva Stan' })).toBeInTheDocument();
    expect(within(panel).getByText('Total: 5 din 10, cu 1 din oficiu')).toBeInTheDocument();
    expect(within(panel).getByText('Subiectul I, ex. 1 · 4p din 4,5p')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Deschide lucrarea' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/13');
    expect(within(panel).queryByRole('button', { name: /^Accept/ })).not.toBeInTheDocument();
    expect(screen.getByTitle('Pagina 1 a lucrării')).toHaveAttribute('src', submissionFileUrl(13, 131));
    expect(within(queue()).getByRole('link', { name: 'Eva Stan nota 5' })).toHaveAttribute('aria-current', 'true');
  });

  it('opens a point from the exercises of the paper', async () => {
    renderAdmin(PAGE, apiWith(), <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(panel).getByRole('link', { name: 'Subiectul II, ex. 1 · 1p din 2p' }));
    await expectLocation(at(`?lucrare=11&punct=32`));
    expect(await within(decision()).findByRole('heading', { name: 'Ana Pop · Subiectul II, ex. 1' })).toBeInTheDocument();
  });

  it('says when a paper has no files', async () => {
    const [ana, ion, eva] = papers();
    ion!.files = [];
    renderAdmin(`${PAGE}?lucrare=14&punct=41`, apiWith([ana!, ion!, eva!]));
    expect(await screen.findByText('Elevul nu a încărcat niciun fișier.')).toBeInTheDocument();
  });

  it('has one line before any paper is graded, and the way back to the test', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 1 }],
      students: {},
      tests: [fakeTest({ status: 'evaluating' }, [fakeUpload({ studentId: 2, studentName: 'Dan Marin', submissionId: 12, status: 'submitted' })])],
    });
    renderAdmin(PAGE, api);
    expect(await screen.findByText('Nicio lucrare nu este corectată încă.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Înapoi la test' })).toHaveAttribute('href', '/teste/6E2-26T1#verificare');
    expect(screen.queryByRole('navigation', { name: 'Lucrările' })).not.toBeInTheDocument();
  });

  it('acts once for a key held down', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=pagini`, api, <LocationProbe />);
    await screen.findByText('Ana Pop · pagina 2 din 3');
    await userEvent.keyboard('a');
    expect(await within(decision()).findByRole('heading', { name: 'Ana Pop · Subiectul II, ex. 1' })).toBeInTheDocument();
    // The key is still down: the browser repeats it, and the repeats do nothing.
    fireEvent.keyDown(document.body, { key: 'a', repeat: true });
    fireEvent.keyDown(document.body, { key: 'j', repeat: true });
    await act(async () => {});
    expect(api.correctItem).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent(at('?lucrare=11&punct=32'));
    fireEvent.keyDown(document.body, { key: 'a' });
    await waitFor(() => expect(api.correctItem).toHaveBeenCalledTimes(1));
  });

  // A save that returns only when the test says so. done() lets it return and
  // waits for the last thing a decision does, reading the test again, then for
  // React to draw what came of it.
  function heldSave(api: ReturnType<typeof apiWith>) {
    const save = api.correctItem.getMockImplementation()!;
    let release = () => {};
    api.correctItem.mockImplementationOnce(
      (...args: Parameters<typeof save>) =>
        new Promise<SubmissionDetail>((resolve) => {
          release = () => resolve(save(...args));
        }),
    );
    return {
      async done() {
        const reads = api.getTest.mock.calls.length;
        release();
        await waitFor(() => expect(api.getTest.mock.calls.length).toBeGreaterThan(reads));
        await act(async () => {});
      },
    };
  }

  it('stays on the test page when the teacher went back while a decision saved', async () => {
    const api = apiWith();
    const held = heldSave(api);
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 1p' }));
    await userEvent.click(screen.getByRole('link', { name: 'Înapoi la test' }));
    await screen.findByRole('link', { name: 'Decide: Ana Pop, Subiectul II, ex. 1' });
    await held.done();
    expect(screen.queryByRole('link', { name: 'Decide: Ana Pop, Subiectul II, ex. 1' })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/teste\/6E2-26T1#verificare$/);
  });

  it('stays on the paper the teacher opened while a decision saved', async () => {
    const api = apiWith();
    const held = heldSave(api);
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 1p' }));
    await userEvent.click(within(queue()).getByRole('link', { name: 'Eva Stan nota 5' }));
    await expectLocation(at('?lucrare=13'));
    await held.done();
    expect(within(queue()).queryByRole('link', { name: 'Subiectul II, ex. 1 · 1p din 2p' })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(at('?lucrare=13'));
  });

  it('acts on the keys after "Începe" in De făcut', async () => {
    const api = apiWith();
    renderAdmin('/teste/6E2-26T1', api, <LocationProbe />);
    await screen.findByRole('link', { name: 'Decide: Ana Pop, Subiectul II, ex. 1' });
    await userEvent.click(screen.getByRole('button', { name: /^De făcut/ }));
    const todo = screen.getByRole('complementary', { name: 'Ce ai de făcut' });
    await userEvent.click(within(todo).getByRole('link', { name: 'Începe: Fracții, 6E2' }));
    await screen.findByText('Ana Pop · pagina 2 din 3');
    await userEvent.keyboard('j');
    await expectLocation(at('?lucrare=11&punct=32'));
  });

  it('acts on the keys after a panel of the bar closes with Esc', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(await screen.findByRole('button', { name: /^De făcut/ }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Ce ai de făcut' })).not.toBeInTheDocument();
    await userEvent.keyboard('j');
    await expectLocation(at('?lucrare=14&punct=41'));
  });

  it('writes once for two presses of A in the same moment', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await within(panel).findByRole('button', { name: 'Accept 1p' });
    fireEvent.keyDown(document.body, { key: 'a' });
    fireEvent.keyDown(document.body, { key: 'a' });
    // Ion's paper loads in a new right pane: found through the screen.
    expect(await screen.findByRole('heading', { name: 'Ion Popa · Subiectul I, ex. 3' })).toBeInTheDocument();
    expect(api.correctItem).toHaveBeenCalledTimes(1);
  });

  it('drops a value typed on a grading that was replaced meanwhile', async () => {
    const api = apiWith();
    api.correctItem.mockRejectedValueOnce(new ApiError(409, 'not_graded', 'Lucrarea se corectează din nou. Reîncarcă pagina.'));
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    const input = within(panel).getByRole('textbox', { name: 'Alt punctaj, din 2' });
    // The paper is read again after the refusal: it has a new grading, with
    // the same exercise to check.
    const regraded = papers()[0]!;
    regraded.evaluation = { ...regraded.evaluation!, gradedAt: '2026-10-08T09:00:00.000Z' };
    api.getSubmission.mockResolvedValueOnce(regraded);
    await userEvent.clear(input);
    await userEvent.type(input, '1,5');
    await userEvent.click(within(panel).getByRole('button', { name: 'Salvează' }));
    await waitFor(() => expect(within(decision()).getByRole('textbox', { name: 'Alt punctaj, din 2' })).toHaveValue('1'));
  });

  it('names the point it opens on in the address', async () => {
    renderAdmin(PAGE, apiWith(), <LocationProbe />);
    await expectLocation(at('?lucrare=11&punct=pagini'));
  });

  it('writes the address before it shows a paper', async () => {
    renderAdmin(PAGE, apiWith(), <LocationProbe />);
    // The first moment the papers show, the address already names the point:
    // a decision is never made on a point the address does not hold.
    await screen.findByRole('navigation', { name: 'Lucrările' });
    expect(screen.getByTestId('location')).toHaveTextContent(at('?lucrare=11&punct=pagini'));
  });

  it('shows a paper that is graded again, says why, and keeps its address', async () => {
    const [ana, ion, eva] = papers();
    ana!.status = 'grading';
    ana!.evaluation = null;
    const rows = [...rowsOf([ion!, eva!]), fakeUpload({ studentId: 1, studentName: 'Ana Pop', submissionId: 11, status: 'grading', fileCount: 3 })];
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 5 }],
      students: {},
      tests: [fakeTest({ status: 'evaluating', startedAt: '2026-10-06T07:00:00.000Z' }, rows.sort((a, b) => a.studentName.localeCompare(b.studentName)))],
      submissions: [ana!, ion!, eva!],
    });
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    expect(await within(panel).findByRole('heading', { name: 'Ana Pop' })).toBeInTheDocument();
    expect(within(panel).getByText('Robotul corectează acum lucrarea. Când are rezultatul, apare aici.')).toBeInTheDocument();
    expect(screen.getByText('Ana Pop · pagina 1 din 3')).toBeInTheDocument();
    expect(within(queue()).getByRole('link', { name: 'Subiectul I, ex. 3 · 3p din 5p' })).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('location')).toHaveTextContent(at('?lucrare=11&punct=32'));
  });

  it('reads the paper again when the list has its newer grading', async () => {
    const api = apiWith();
    // The paper was read while it was graded again; the list has the new result.
    const before = papers()[0]!;
    before.status = 'grading';
    before.evaluation = null;
    api.getSubmission.mockResolvedValueOnce(before);
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, api, <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Ana Pop · Subiectul II, ex. 1' })).toBeInTheDocument();
    expect(api.getSubmission).toHaveBeenCalledTimes(2);
  });

  it('puts the focus on the point that opens after a decision', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?lucrare=11&punct=pagini`, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Am verificat paginile' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ana Pop · Subiectul II, ex. 1' })).toHaveFocus());
    await userEvent.click(screen.getByRole('button', { name: 'Accept 1p' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ion Popa · Subiectul I, ex. 3' })).toHaveFocus());
    // The keys still act from there.
    await userEvent.keyboard('k');
    await expectLocation(at('?lucrare=14&punct=41'));
  });
});
