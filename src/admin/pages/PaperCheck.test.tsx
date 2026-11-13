import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionDetail, UploadRow } from '../../../shared/api.ts';
import type { AnswerArea } from '../../../shared/schemas.ts';
import { ApiError, submissionFileUrl } from '../api.ts';
import { CLOSE_DELAY } from '../submissionPage/GradedResult.tsx';
import { createFakeApi, fakeEvaluation, fakeItem, fakeSubmission, fakeTest, fakeUpload, reviewPointsOf } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';

// The points to check on the paper page (spec 2026-11-12 §4): the old address
// of the review opens the page with only the points to check.
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
            page: 3,
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

// The paper page of one paper, with an open point and a view.
function paperAt(id: number, key: string | null = null, mode: 'toate' | 'verificare' = 'verificare'): string {
  const params = new URLSearchParams();
  if (key !== null) params.set('punct', key);
  if (mode === 'verificare') params.set('vedere', 'verificare');
  const search = params.toString();
  return `/teste/6E2-26T1/elevi/${id}${search ? `?${search}` : ''}`;
}

// The whole address, so a shorter one does not match a longer one.
const at = (id: number, key: string | null = null, mode: 'toate' | 'verificare' = 'verificare') =>
  new RegExp(`^${paperAt(id, key, mode).replace(/[?.]/g, '\\$&')}$`);

const students = () => screen.getByRole('navigation', { name: 'Elevii' });

// How many times one paper was read: the page also reads ahead the papers
// the teacher can move to next.
const readsOf = (api: ReturnType<typeof apiWith>, id: number) => api.getSubmission.mock.calls.filter(([read]) => read === id).length;
const decision = () => screen.getByRole('region', { name: 'Decizia' });
const pause = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));
const row = (label: string) => screen.getByRole('row', { name: new RegExp(label) });

describe('the points to check on the paper page', () => {
  it('opens the address of the review on the first point, the students with points first', async () => {
    renderAdmin(PAGE, apiWith(), <LocationProbe />);
    await expectLocation(at(11, 'pagini'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana Pop' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Doar de verificat (3)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Toate exercițiile' })).toHaveAttribute('aria-pressed', 'false');
    const list = students();
    expect(within(list).getByRole('heading', { name: 'Cu puncte de verificat 2' })).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Ana Pop 2 puncte de verificat' })).toHaveAttribute('aria-current', 'true');
    expect(within(list).getByRole('link', { name: 'Ion Popa 1 punct de verificat' })).toHaveAttribute('href', paperAt(14, '41'));
    expect(within(list).getByRole('heading', { name: 'Celelalte lucrări 2' })).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Eva Stan nota 5' })).toHaveAttribute('href', paperAt(13));
    expect(within(list).getByRole('link', { name: 'Dan Marin trimis' })).toHaveAttribute('href', paperAt(12));
    expect(within(list).queryByText(/Mara Ilie/)).not.toBeInTheDocument();
  });

  it('opens on the pages Ana could not read, on the first of them, and the next point opens after them', async () => {
    const api = apiWith();
    renderAdmin(PAGE, api, <LocationProbe />);
    expect(await screen.findByText('Ana Pop · 2/3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagina 2' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('img', { name: 'Pagina 2 a lucrării' })).toHaveAttribute('src', submissionFileUrl(11, 102));
    expect(within(decision()).getByRole('heading', { name: 'Decide: Paginile necitite' })).toBeInTheDocument();
    expect(
      within(decision()).getByText('Robotul nu a putut citi: Pagina 2. Verifică pozele și punctajele exercițiilor de pe ele.'),
    ).toBeInTheDocument();
    // The note above the exercises does not say it a second time.
    expect(screen.getAllByText(/^Robotul nu a putut citi/)).toHaveLength(1);
    // Only the points to check show: I.1 waits for nothing.
    expect(screen.queryByRole('row', { name: /Subiectul I, ex\. 1/ })).not.toBeInTheDocument();

    await userEvent.click(within(decision()).getByRole('button', { name: 'Am verificat paginile' }));
    expect(api.reviewPages).toHaveBeenCalledWith(11, { pagesReviewed: true, gradedAt: GRADED_AT });
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
    await expectLocation(at(11, '32'));
    expect(within(students()).getByRole('link', { name: 'Ana Pop 1 punct de verificat' })).toBeInTheDocument();
  });

  it('opens an item on the page where its answer is, and on page 1 when the page is unknown', async () => {
    const api = apiWith();
    renderAdmin(PAGE, api, <LocationProbe />);
    await screen.findByText('Ana Pop · 2/3');
    await userEvent.keyboard('j');
    await expectLocation(at(11, '32'));
    expect(screen.getByText('Ana Pop · 3/3')).toBeInTheDocument();
    expect(screen.getByTitle('Pagina 3 a lucrării')).toHaveAttribute('src', submissionFileUrl(11, 103));
    await userEvent.keyboard('1');
    expect(screen.getByText('Ana Pop · 1/3')).toBeInTheDocument();
    await userEvent.keyboard('k');
    await userEvent.keyboard('k');
    await expectLocation(at(14, '41'));
    expect(await screen.findByText('Ion Popa · 1/1')).toBeInTheDocument();
  });

  it("accepts the robot's points under the row, and the next point opens", async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    // The row above the decision has the answer, the comment and the reason.
    const flagged = row('Subiectul II, ex. 1');
    expect(flagged).toHaveClass('is-open', 'is-to-check');
    expect(within(flagged).getByText('1 din 2')).toHaveClass('points-pill');
    expect(within(flagged).getByText('x = 3')).toBeInTheDocument();
    expect(within(flagged).getByText('Verifică semnul.')).toBeInTheDocument();
    expect(within(flagged).queryByRole('button', { name: 'Verificat Subiectul II, ex. 1' })).not.toBeInTheDocument();
    // The reason is under the row, with "Accept" of the robot's points.
    expect(within(panel).getByText('Scrisul nu se citește.')).toBeInTheDocument();
    expect(within(panel).getByRole('textbox', { name: 'Alt punctaj, din 2' })).toHaveValue('1');
    expect(screen.getByText('Ana Pop · 3/3')).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 1p' }));
    expect(api.correctItem).toHaveBeenCalledWith(11, 32, { reviewed: true, gradedAt: GRADED_AT });
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul I, ex. 3' })).toBeInTheDocument();
    await expectLocation(at(14, '41'));
    expect(screen.getByRole('button', { name: 'Doar de verificat (2)' })).toBeInTheDocument();
  });

  it('says what the grade becomes with another value, and saves it', async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, '32'), api);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    const input = within(panel).getByRole('textbox', { name: 'Alt punctaj, din 2' });
    expect(within(panel).queryByText(/nota devine/)).not.toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'Scade 0,5p' }));
    expect(input).toHaveValue('0,5');
    expect(within(panel).getByText('Cu 0,5p aici, nota devine 6.')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Scade 0,5p' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Scade 0,5p' }));
    expect(input).toHaveValue('0');
    expect(within(panel).getByText('Cu 0p aici, nota devine 5,5.')).toBeInTheDocument();
    for (let press = 0; press < 5; press += 1) await userEvent.click(within(panel).getByRole('button', { name: 'Adaugă 0,5p' }));
    expect(input).toHaveValue('2');

    await userEvent.clear(input);
    await userEvent.type(input, '1,25');
    expect(within(panel).getByText('Cu 1,25p aici, nota devine 6,75.')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Salvează' }));
    expect(api.correctItem).toHaveBeenCalledWith(11, 32, { points: 1.25, reviewed: true, gradedAt: GRADED_AT });
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul I, ex. 3' })).toBeInTheDocument();
  });

  it("saves the robot's points as a check, with no change of points", async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, '32'), api);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Salvează' }));
    expect(api.correctItem).toHaveBeenCalledWith(11, 32, { reviewed: true, gradedAt: GRADED_AT });
  });

  it('steps from robot points off the 0,05 steps onto them, between 0 and the maximum', async () => {
    const [ana, ion, eva] = papers();
    ana!.evaluation = fakeEvaluation([
      fakeItem({ id: 32, exerciseId: 'II.1', label: 'Subiectul II, ex. 1', points: 0.33, maxPoints: 2, needsReview: true, reviewReason: 'Neclar.' }),
    ]);
    const api = apiWith([ana!, ion!, eva!]);
    renderAdmin(paperAt(11, '32'), api);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    const input = within(panel).getByRole('textbox', { name: 'Alt punctaj, din 2' });
    expect(within(panel).getByRole('button', { name: 'Accept 0,33p' })).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Adaugă 0,5p' }));
    expect(input).toHaveValue('0,85');
    await userEvent.click(within(panel).getByRole('button', { name: 'Scade 0,5p' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Scade 0,5p' }));
    expect(input).toHaveValue('0');
    await userEvent.click(within(panel).getByRole('button', { name: 'Salvează' }));
    expect(api.correctItem).toHaveBeenCalledWith(11, 32, { points: 0, reviewed: true, gradedAt: GRADED_AT });
  });

  it('refuses a value off the steps of 0,05', async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, '32'), api);
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
    await screen.findByText('Ana Pop · 2/3');
    await userEvent.keyboard('j');
    await expectLocation(at(11, '32'));
    await userEvent.keyboard('k');
    await expectLocation(at(11, 'pagini'));
    await userEvent.keyboard('k');
    await expectLocation(at(14, '41'));
    await userEvent.keyboard('j');
    await expectLocation(at(11, 'pagini'));
    await userEvent.keyboard('3');
    expect(screen.getByText('Ana Pop · 3/3')).toBeInTheDocument();
    expect(screen.getByTitle('Pagina 3 a lucrării')).toHaveAttribute('src', submissionFileUrl(11, 103));
    await userEvent.keyboard('9');
    expect(screen.getByText('Ana Pop · 3/3')).toBeInTheDocument();
    await userEvent.keyboard('1');
    expect(screen.getByText('Ana Pop · 1/3')).toBeInTheDocument();
    await userEvent.keyboard('a');
    expect(api.reviewPages).toHaveBeenCalledWith(11, { pagesReviewed: true, gradedAt: GRADED_AT });
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
  });

  it('names the keys in the bar, between the switch and the moves, only while a decision shows', async () => {
    renderAdmin(paperAt(11, '32', 'toate'), apiWith(), <LocationProbe />);
    await screen.findByRole('region', { name: 'Decizia' });
    const keys = screen.getByText(/punctul următor sau anterior/).closest('p')!;
    const bar = screen.getByRole('group', { name: 'Exercițiile arătate' }).parentElement!;
    expect(bar).toContainElement(keys);
    expect(keys).toHaveTextContent('A accept');
    expect(keys).toHaveTextContent('1–3 pagina');
    await userEvent.click(row('Subiectul I, ex. 1'));
    await expectLocation(at(11, '31', 'toate'));
    expect(screen.queryByText(/punctul următor sau anterior/)).not.toBeInTheDocument();
  });

  it('goes to the next point and back with the buttons above the panes', async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' });
    await userEvent.click(screen.getByRole('button', { name: 'Următorul punct' }));
    await expectLocation(at(14, '41'));
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul I, ex. 3' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Punctul anterior' }));
    await expectLocation(at(11, '32'));
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Punctul anterior' }));
    await expectLocation(at(11, 'pagini'));
    // The buttons go round the queue: before the first point comes the last one.
    await userEvent.click(screen.getByRole('button', { name: 'Punctul anterior' }));
    await expectLocation(at(14, '41'));
  });

  it('ignores the keys in the stepper field and with Ctrl, Alt or Meta', async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    const input = within(panel).getByRole('textbox', { name: 'Alt punctaj, din 2' });
    await userEvent.type(input, 'ajk2');
    expect(input).toHaveValue('1ajk2');
    input.blur();
    await userEvent.keyboard('{Control>}a{/Control}{Alt>}j{/Alt}{Meta>}k{/Meta}');
    expect(api.correctItem).not.toHaveBeenCalled();
    await expectLocation(at(11, '32'));
  });

  it('ignores the keys while a panel of the bar is open', async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(await screen.findByRole('button', { name: /^De făcut/ }));
    expect(screen.getByRole('complementary', { name: 'Ce ai de făcut' })).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard('aj');
    expect(api.correctItem).not.toHaveBeenCalled();
    await expectLocation(at(11, '32'));
  });

  it('writes once when A is pressed twice, and no key acts while it saves', async () => {
    const api = apiWith();
    api.correctItem.mockReturnValueOnce(new Promise<never>(() => {}));
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.keyboard('aa');
    expect(api.correctItem).toHaveBeenCalledTimes(1);
    expect(within(panel).getByRole('button', { name: 'Accept 1p' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Următorul punct' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Punctul anterior' })).toBeDisabled();
    await userEvent.keyboard('jk2');
    await expectLocation(at(11, '32'));
    expect(screen.getByText('Ana Pop · 3/3')).toBeInTheDocument();
  });

  it('says when every point is checked, with the way to Rezultate', async () => {
    const [ana, ion, eva] = papers();
    ana!.evaluation = fakeEvaluation([fakeItem({ id: 31, exerciseId: 'I.1', label: 'Subiectul I, ex. 1', points: 4.5 })]);
    const api = apiWith([ana!, ion!, eva!]);
    renderAdmin(PAGE, api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    expect(within(panel).getByRole('heading', { name: 'Decide: Subiectul I, ex. 3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Următorul punct' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Punctul anterior' })).not.toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 3p' }));
    expect(await screen.findByText(/Toate punctele sunt verificate\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mergi la Rezultate' })).toHaveAttribute('href', '/teste/6E2-26T1#rezultate');
    await expectLocation(at(14));
    expect(screen.queryByRole('region', { name: 'Decizia' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Doar de verificat (0)' })).toBeInTheDocument();
    expect(within(students()).queryByRole('heading', { name: /Cu puncte de verificat/ })).not.toBeInTheDocument();
  });

  it('reads the paper again when it was graded again in the meantime', async () => {
    const api = apiWith();
    api.correctItem.mockRejectedValueOnce(new ApiError(409, 'not_graded', 'Lucrarea se corectează din nou. Reîncarcă pagina.'));
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    expect(readsOf(api, 11)).toBe(1);
    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 1p' }));
    expect(await within(decision()).findByText('Lucrarea se corectează din nou. Reîncarcă pagina.')).toBeInTheDocument();
    expect(readsOf(api, 11)).toBe(2);
    await expectLocation(at(11, '32'));
  });

  it('reads ahead the papers of the next and the previous student, so the next one shows at once', async () => {
    const api = apiWith();
    renderAdmin(paperAt(13, null, 'toate'), api, <LocationProbe />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Eva Stan' })).toBeInTheDocument();
    // Ion is after Eva, Dan before her.
    await waitFor(() => expect(readsOf(api, 14)).toBe(1));
    expect(readsOf(api, 12)).toBe(1);
    await userEvent.click(screen.getByRole('button', { name: 'Elevul următor' }));
    await expectLocation(at(14, null, 'toate'));
    // The paper is there at once: no moment with no paper.
    expect(screen.queryByText('Se încarcă lucrarea…')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Ion Popa' })).toBeInTheDocument();
    expect(within(row('Subiectul I, ex. 3')).getByText('3 din 5')).toBeInTheDocument();
  });

  it('shows a paper with no point to check with all its exercises, its grade and its page', async () => {
    renderAdmin(paperAt(13, null, 'toate'), apiWith());
    expect(await screen.findByText(/^Nota/)).toHaveTextContent('Nota 5 · 5 puncte din 10, cu 1 din oficiu');
    expect(within(row('Subiectul I, ex. 1')).getByText('4 din 4,5')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Decizia' })).not.toBeInTheDocument();
    expect(screen.getByTitle('Pagina 1 a lucrării')).toHaveAttribute('src', submissionFileUrl(13, 131));
    expect(within(students()).getByRole('link', { name: 'Eva Stan nota 5' })).toHaveAttribute('aria-current', 'true');
  });

  it('says so when only the points to check show and the paper has none', async () => {
    renderAdmin(paperAt(13), apiWith());
    expect(await screen.findByText('Niciun exercițiu de verificat în această lucrare.')).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Subiectul I, ex\. 1/ })).not.toBeInTheDocument();
  });

  it('opens any exercise on the paper: its page, and a decision only for one to check', async () => {
    renderAdmin(paperAt(11, null, 'toate'), apiWith(), <LocationProbe />);
    await screen.findByText('Ana Pop · 1/3');
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await expectLocation(at(11, '32', 'toate'));
    expect(screen.getByText('Ana Pop · 3/3')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' }));
    await expectLocation(at(11, '31', 'toate'));
    expect(row('Subiectul I, ex. 1')).toHaveClass('is-open');
    expect(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Ana Pop · 1/3')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Decizia' })).not.toBeInTheDocument();
    // II.1 still waits: closed, it shows "Verifică", which opens it again.
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByRole('button', { name: 'Verifică Subiectul II, ex. 1' }));
    await expectLocation(at(11, '32', 'toate'));
  });

  it('switches between all the exercises and only the points to check, in the address', async () => {
    renderAdmin(paperAt(11, null, 'toate'), apiWith(), <LocationProbe />);
    expect(await screen.findByRole('row', { name: /Subiectul I, ex\. 1/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ce a lucrat bine' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Doar de verificat (3)' }));
    await expectLocation(at(11));
    expect(screen.queryByRole('row', { name: /Subiectul I, ex\. 1/ })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Subiectul II, ex\. 1/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ce a lucrat bine' })).not.toBeInTheDocument();
    // Another student keeps the view.
    await userEvent.click(within(students()).getByRole('link', { name: 'Ion Popa 1 punct de verificat' }));
    await expectLocation(at(14, '41'));
    await userEvent.click(screen.getByRole('button', { name: 'Toate exercițiile' }));
    await expectLocation(at(14, '41', 'toate'));
  });

  it('opens the next point of the same student after a decision in all the exercises, and never another student', async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, 'pagini', 'toate'), api, <LocationProbe />);
    await userEvent.click(await within(await screen.findByRole('region', { name: 'Decizia' })).findByRole('button', { name: 'Am verificat paginile' }));
    await expectLocation(at(11, '32', 'toate'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toHaveFocus());
    await userEvent.click(within(decision()).getByRole('button', { name: 'Accept 1p' }));
    // No point of Ana is left: the row stays open, and "Elevul următor" waits.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Elevul următor' })).toHaveFocus());
    await expectLocation(at(11, '32', 'toate'));
    expect(screen.queryByRole('region', { name: 'Decizia' })).not.toBeInTheDocument();
    expect(within(row('Subiectul II, ex. 1')).getByText('Verificat')).toBeInTheDocument();
  });

  it('puts the focus on the exercises after the last point of the last student, in all the exercises', async () => {
    renderAdmin(paperAt(14, '41', 'toate'), apiWith(), <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 3p' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Exercițiile' })).toHaveFocus());
    expect(screen.queryByRole('button', { name: 'Elevul următor' })).not.toBeInTheDocument();
    await expectLocation(at(14, '41', 'toate'));
  });

  it('walks only the points of the open student with J and K in all the exercises', async () => {
    renderAdmin(paperAt(11, null, 'toate'), apiWith(), <LocationProbe />);
    await screen.findByText('Ana Pop · 1/3');
    await userEvent.keyboard('j');
    await expectLocation(at(11, 'pagini', 'toate'));
    await userEvent.keyboard('j');
    await expectLocation(at(11, '32', 'toate'));
    await userEvent.keyboard('j');
    await expectLocation(at(11, 'pagini', 'toate'));
    expect(screen.queryByRole('button', { name: 'Următorul punct' })).not.toBeInTheDocument();
  });

  it('moves to the student before or after, in the order of the list', async () => {
    renderAdmin(paperAt(11, null, 'toate'), apiWith(), <LocationProbe />);
    await screen.findByText('Ana Pop · 1/3');
    expect(screen.queryByRole('button', { name: 'Elevul anterior' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Elevul următor' }));
    await expectLocation(at(12, null, 'toate'));
    await userEvent.click(screen.getByRole('button', { name: 'Elevul anterior' }));
    await expectLocation(at(11, null, 'toate'));
    // With only the points to check, the students with points come first and
    // each opens on its first point.
    await userEvent.click(screen.getByRole('button', { name: 'Doar de verificat (3)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Elevul următor' }));
    await expectLocation(at(14, '41'));
  });

  it('folds the students and keeps the choice in this browser', async () => {
    const first = renderAdmin(paperAt(11), apiWith());
    await userEvent.click(await within(await screen.findByRole('navigation', { name: 'Elevii' })).findByRole('button', { name: 'Ascunde' }));
    expect(within(students()).queryByRole('link')).not.toBeInTheDocument();
    expect(localStorage.getItem('quickeval:paperStudentsFolded')).toBe('on');
    first.unmount();
    renderAdmin(paperAt(11), apiWith());
    await userEvent.click(await within(await screen.findByRole('navigation', { name: 'Elevii' })).findByRole('button', { name: 'Arată elevii' }));
    expect(within(students()).getByRole('link', { name: 'Ana Pop 2 puncte de verificat' })).toBeInTheDocument();
    expect(localStorage.getItem('quickeval:paperStudentsFolded')).toBe('off');
  });

  it('closes the open row on a second click, on the row or on its "Arată pe lucrare"', async () => {
    renderAdmin(paperAt(11, null, 'toate'), apiWith(), <LocationProbe />);
    await screen.findByText('Ana Pop · 1/3');
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await expectLocation(at(11, '32', 'toate'));
    expect(await screen.findByRole('region', { name: 'Decizia' })).toBeInTheDocument();
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await expectLocation(at(11, null, 'toate'));
    expect(screen.queryByRole('region', { name: 'Decizia' })).not.toBeInTheDocument();
    expect(row('Subiectul II, ex. 1')).not.toHaveClass('is-open');
    await userEvent.click(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' }));
    await expectLocation(at(11, '31', 'toate'));
    await userEvent.click(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' }));
    await expectLocation(at(11, null, 'toate'));
    expect(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('leaves the row as it is when a click ends a selection of its text', async () => {
    renderAdmin(paperAt(11, '32', 'toate'), apiWith(), <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
    const selection = vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'x = 3' } as Selection);
    try {
      // Open, it stays open; closed, it stays closed.
      await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
      await pause(CLOSE_DELAY + 100);
      await expectLocation(at(11, '32', 'toate'));
      await userEvent.click(within(row('Subiectul I, ex. 1')).getByRole('rowheader'));
      await expectLocation(at(11, '32', 'toate'));
    } finally {
      selection.mockRestore();
    }
  });

  it('keeps the open row open on a double or a triple click, which selects a word to copy', async () => {
    renderAdmin(paperAt(11, '32', 'toate'), apiWith(), <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
    await userEvent.dblClick(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await pause(CLOSE_DELAY + 100);
    await expectLocation(at(11, '32', 'toate'));
    await userEvent.tripleClick(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await pause(CLOSE_DELAY + 100);
    await expectLocation(at(11, '32', 'toate'));
    expect(screen.getByRole('region', { name: 'Decizia' })).toBeInTheDocument();
  });

  it('keeps a row to check open, dimmed, when another row opens, so the rows under it do not move', async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, 'pagini', 'toate'), api, <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Decide: Paginile necitite' })).toBeInTheDocument();
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await expectLocation(at(11, '32', 'toate'));
    // The pages' decision stays in place, out of reach; only II.1's acts.
    const kept = document.querySelector('.pages-check .decision-slot');
    expect(kept).toHaveClass('is-kept');
    expect(kept).toHaveAttribute('aria-hidden', 'true');
    expect(kept).toHaveAttribute('inert');
    expect(screen.getAllByRole('region', { name: 'Decizia' })).toHaveLength(1);
    expect(within(decision()).getByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
    // A accepts the open row only.
    await userEvent.keyboard('a');
    await waitFor(() => expect(api.correctItem).toHaveBeenCalledWith(11, 32, expect.objectContaining({ reviewed: true })));
    expect(api.reviewPages).not.toHaveBeenCalled();
  });

  it('opens a kept row on a click, and keeps the row that was open', async () => {
    renderAdmin(paperAt(11, 'pagini', 'toate'), apiWith(), <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Decide: Paginile necitite' })).toBeInTheDocument();
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await expectLocation(at(11, '32', 'toate'));
    await userEvent.click(screen.getByRole('button', { name: 'Verifică paginile necitite' }));
    await expectLocation(at(11, 'pagini', 'toate'));
    expect(within(decision()).getByRole('heading', { name: 'Decide: Paginile necitite' })).toBeInTheDocument();
    expect(row('Subiectul II, ex. 1')).toHaveClass('is-kept');
    expect(document.querySelector('.item-decision .decision-slot')).toHaveClass('is-kept');
  });

  it('closes the open row and leaves the kept one as it is', async () => {
    renderAdmin(paperAt(11, 'pagini', 'toate'), apiWith(), <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Decide: Paginile necitite' })).toBeInTheDocument();
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await expectLocation(at(11, '32', 'toate'));
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await expectLocation(at(11, null, 'toate'));
    expect(screen.queryByRole('region', { name: 'Decizia' })).not.toBeInTheDocument();
    expect(row('Subiectul II, ex. 1')).not.toHaveClass('is-open');
    expect(row('Subiectul II, ex. 1')).not.toHaveClass('is-kept');
    expect(document.querySelector('.pages-check .decision-slot')).toHaveClass('is-kept');
    // The row closed by its own click is not kept when another opens.
    await userEvent.click(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' }));
    await expectLocation(at(11, '31', 'toate'));
    expect(row('Subiectul II, ex. 1')).not.toHaveClass('is-kept');
  });

  it('keeps no row open when the teacher moves with J, K or the buttons', async () => {
    renderAdmin(paperAt(11, 'pagini', 'toate'), apiWith(), <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Decide: Paginile necitite' })).toBeInTheDocument();
    await userEvent.keyboard('j');
    await expectLocation(at(11, '32', 'toate'));
    await userEvent.keyboard('k');
    await expectLocation(at(11, 'pagini', 'toate'));
    expect(document.querySelectorAll('.decision-slot.is-kept')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Doar de verificat (3)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Următorul punct' }));
    await expectLocation(at(11, '32'));
    expect(document.querySelectorAll('.decision-slot.is-kept')).toHaveLength(0);
  });

  it('keeps what was typed in a kept decision, for when its row opens again', async () => {
    renderAdmin(paperAt(11, '32', 'toate'), apiWith(), <LocationProbe />);
    const field = await within(await screen.findByRole('region', { name: 'Decizia' })).findByRole('textbox', { name: /Alt punctaj/ });
    await userEvent.clear(field);
    await userEvent.type(field, '1,5');
    await userEvent.click(screen.getByRole('button', { name: 'Verifică paginile necitite' }));
    await expectLocation(at(11, 'pagini', 'toate'));
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByRole('button', { name: 'Verifică Subiectul II, ex. 1' }));
    await expectLocation(at(11, '32', 'toate'));
    expect(within(decision()).getByRole('textbox', { name: /Alt punctaj/ })).toHaveValue('1,5');
  });

  it('puts the focus on the next decision after a decision, though it was kept', async () => {
    renderAdmin(paperAt(11, '32', 'toate'), apiWith(), <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Verifică paginile necitite' }));
    await expectLocation(at(11, 'pagini', 'toate'));
    await userEvent.click(within(decision()).getByRole('button', { name: 'Am verificat paginile' }));
    await expectLocation(at(11, '32', 'toate'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toHaveFocus());
  });

  it('drops a kept row once it is checked', async () => {
    renderAdmin(paperAt(11, 'pagini', 'toate'), apiWith(), <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Decide: Paginile necitite' })).toBeInTheDocument();
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await expectLocation(at(11, '32', 'toate'));
    await userEvent.click(screen.getByRole('button', { name: 'Verifică paginile necitite' }));
    await userEvent.click(await within(decision()).findByRole('button', { name: 'Am verificat paginile' }));
    // The next point opens: II.1, kept until now, is the open row.
    await expectLocation(at(11, '32', 'toate'));
    await waitFor(() => expect(document.querySelector('.pages-check')).toBeNull());
    expect(document.querySelectorAll('.decision-slot.is-kept')).toHaveLength(0);
  });

  it('hides the paper for more room, keeps the choice in this browser, and shows it again', async () => {
    const first = renderAdmin(paperAt(11, '32', 'toate'), apiWith(), <LocationProbe />);
    expect(await screen.findByText('Ana Pop · 3/3')).toBeInTheDocument();
    expect(screen.getByText(/pagina$/, { selector: '.review-keys-line > span' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ascunde lucrarea' }));
    expect(screen.queryByText('Ana Pop · 3/3')).not.toBeInTheDocument();
    expect(screen.queryByText(/pagina$/, { selector: '.review-keys-line > span' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arată lucrarea' })).toHaveFocus();
    expect(localStorage.getItem('quickeval:paperPhotoFolded')).toBe('on');
    // The keys still walk the points; the numbers have no page to show.
    await userEvent.keyboard('k');
    await expectLocation(at(11, 'pagini', 'toate'));
    first.unmount();
    renderAdmin(paperAt(11, '32', 'toate'), apiWith());
    await userEvent.click(await screen.findByRole('button', { name: 'Arată lucrarea' }));
    expect(screen.getByText('Ana Pop · 3/3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ascunde lucrarea' })).toHaveFocus();
    expect(localStorage.getItem('quickeval:paperPhotoFolded')).toBe('off');
  });

  it('changes no page with the numbers while the paper is folded', async () => {
    renderAdmin(paperAt(11, '32', 'toate'), apiWith());
    expect(await screen.findByText('Ana Pop · 3/3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ascunde lucrarea' }));
    await userEvent.keyboard('1');
    await userEvent.click(screen.getByRole('button', { name: 'Arată lucrarea' }));
    expect(screen.getByText('Ana Pop · 3/3')).toBeInTheDocument();
  });

  it('shows the folded paper again on "Arată pe lucrare", and leaves it folded for a click on a row', async () => {
    renderAdmin(paperAt(11, null, 'toate'), apiWith(), <LocationProbe />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ascunde lucrarea' }));
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await expectLocation(at(11, '32', 'toate'));
    expect(screen.getByRole('button', { name: 'Arată lucrarea' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' }));
    await expectLocation(at(11, '31', 'toate'));
    expect(screen.getByText('Ana Pop · 1/3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ascunde lucrarea' })).not.toHaveFocus();
    expect(localStorage.getItem('quickeval:paperPhotoFolded')).toBe('off');
  });

  it('hides the paper with no files too', async () => {
    const [ana, ion, eva] = papers();
    ion!.files = [];
    renderAdmin(paperAt(14, '41'), apiWith([ana!, ion!, eva!]));
    await userEvent.click(await screen.findByRole('button', { name: 'Ascunde lucrarea' }));
    expect(screen.queryByText('Elevul nu a încărcat niciun fișier.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arată lucrarea' })).toBeInTheDocument();
  });

  it('says when a paper has no files', async () => {
    const [ana, ion, eva] = papers();
    ion!.files = [];
    renderAdmin(paperAt(14, '41'), apiWith([ana!, ion!, eva!]));
    expect(await screen.findByText('Elevul nu a încărcat niciun fișier.')).toBeInTheDocument();
  });

  it("opens the test's Verificare before any paper is graded", async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 1 }],
      students: {},
      tests: [fakeTest({ status: 'evaluating' }, [fakeUpload({ studentId: 2, studentName: 'Dan Marin', submissionId: 12, status: 'submitted' })])],
    });
    renderAdmin(PAGE, api, <LocationProbe />);
    await expectLocation(/^\/teste\/6E2-26T1#verificare$/);
  });

  it('acts once for a key held down', async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, 'pagini'), api, <LocationProbe />);
    await screen.findByText('Ana Pop · 2/3');
    await userEvent.keyboard('a');
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
    // The key is still down: the browser repeats it, and the repeats do nothing.
    fireEvent.keyDown(document.body, { key: 'a', repeat: true });
    fireEvent.keyDown(document.body, { key: 'j', repeat: true });
    await act(async () => {});
    expect(api.correctItem).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent(at(11, '32'));
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
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 1p' }));
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Unde ești' })).getByRole('link', { name: 'Fracții' }));
    await screen.findByRole('link', { name: 'Decide: Ana Pop, Subiectul II, ex. 1' });
    await held.done();
    expect(screen.queryByRole('link', { name: 'Decide: Ana Pop, Subiectul II, ex. 1' })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/teste\/6E2-26T1$/);
  });

  it('stays on the paper the teacher opened while a decision saved', async () => {
    const api = apiWith();
    const held = heldSave(api);
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 1p' }));
    await userEvent.click(within(students()).getByRole('link', { name: 'Eva Stan nota 5' }));
    await expectLocation(at(13));
    await held.done();
    expect(within(students()).getByRole('link', { name: 'Ana Pop 1 punct de verificat' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(at(13));
  });

  it('stays in the view the teacher switched to while a decision saved', async () => {
    const api = apiWith();
    const held = heldSave(api);
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 1p' }));
    await userEvent.click(screen.getByRole('button', { name: 'Toate exercițiile' }));
    await expectLocation(at(11, '32', 'toate'));
    await held.done();
    expect(screen.getByTestId('location')).toHaveTextContent(at(11, '32', 'toate'));
  });

  it('acts on the keys after "Începe" in De făcut', async () => {
    const api = apiWith();
    renderAdmin('/teste/6E2-26T1', api, <LocationProbe />);
    await screen.findByRole('link', { name: 'Decide: Ana Pop, Subiectul II, ex. 1' });
    await userEvent.click(screen.getByRole('button', { name: /^De făcut/ }));
    const todo = screen.getByRole('complementary', { name: 'Ce ai de făcut' });
    await userEvent.click(within(todo).getByRole('link', { name: 'Începe: Fracții, 6E2' }));
    await screen.findByText('Ana Pop · 2/3');
    await userEvent.keyboard('j');
    await expectLocation(at(11, '32'));
  });

  it('acts on the keys after a panel of the bar closes with Esc', async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(await screen.findByRole('button', { name: /^De făcut/ }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Ce ai de făcut' })).not.toBeInTheDocument();
    await userEvent.keyboard('j');
    await expectLocation(at(14, '41'));
  });

  it('writes once for two presses of A in the same moment', async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await within(panel).findByRole('button', { name: 'Accept 1p' });
    fireEvent.keyDown(document.body, { key: 'a' });
    fireEvent.keyDown(document.body, { key: 'a' });
    // Ion's paper loads in a new middle pane: found through the screen.
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul I, ex. 3' })).toBeInTheDocument();
    expect(api.correctItem).toHaveBeenCalledTimes(1);
  });

  it('drops a value typed on a grading that was replaced meanwhile', async () => {
    const api = apiWith();
    api.correctItem.mockRejectedValueOnce(new ApiError(409, 'not_graded', 'Lucrarea se corectează din nou. Reîncarcă pagina.'));
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
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

  it('names the point it opens on in the address before it shows a paper', async () => {
    renderAdmin(PAGE, apiWith(), <LocationProbe />);
    // The first moment the paper shows, the address already names the point:
    // a decision is never made on a point the address does not hold.
    await screen.findByRole('navigation', { name: 'Elevii' });
    expect(screen.getByTestId('location')).toHaveTextContent(at(11, 'pagini'));
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
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana Pop' })).toBeInTheDocument();
    expect(await screen.findByText('Robotul corectează acum lucrarea.')).toBeInTheDocument();
    expect(screen.getByText('Ana Pop · 1/3')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Decizia' })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(at(11, '32'));
  });

  it('reads the paper again when the list has its newer grading', async () => {
    const api = apiWith();
    // The paper was read while it was graded again; the list has the new result.
    const before = papers()[0]!;
    before.status = 'grading';
    before.evaluation = null;
    api.getSubmission.mockResolvedValueOnce(before);
    renderAdmin(paperAt(11, '32'), api, <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
    expect(readsOf(api, 11)).toBe(2);
  });

  it('puts the focus on the point that opens after a decision', async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, 'pagini'), api, <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Am verificat paginile' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toHaveFocus());
    await userEvent.click(screen.getByRole('button', { name: 'Accept 1p' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Decide: Subiectul I, ex. 3' })).toHaveFocus());
    // The keys still act from there.
    await userEvent.keyboard('k');
    await expectLocation(at(14, '41'));
  });
});

// The page of the paper zooms inside the middle pane. jsdom lays nothing out:
// the pane is given a size of 400 × 400 px.
const pane = () => screen.getByTestId('zoom-pane');
const layer = () => pane().firstElementChild as HTMLElement;
function sizedPane(): HTMLElement {
  const element = pane();
  element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400, x: 0, y: 0, toJSON: () => ({}) });
  return element;
}
function clickAt(element: HTMLElement, clientX: number, clientY: number, button = 0) {
  fireEvent.pointerDown(element, { pointerId: 1, button, clientX, clientY });
  fireEvent.pointerUp(element, { pointerId: 1, button, clientX, clientY });
}
const WHOLE = 'translate(0%, 0%) scale(1)';

describe('the zoom of a page', () => {
  it('zooms in one small step where the photo is clicked, and out as much with a right click', async () => {
    renderAdmin(`${PAGE}?lucrare=14&punct=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    const photo = sizedPane();
    expect(layer().style.transform).toBe(WHOLE);
    // "Toată pagina" waits over the page, off while the page is whole.
    expect(screen.getByRole('button', { name: 'Toată pagina' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: /Pagina 1 a lucrării/ })).not.toBeInTheDocument();

    clickAt(photo, 200, 200);
    expect(layer().style.transform).toBe('translate(-12.5%, -12.5%) scale(1.25)');
    expect(screen.getByText('125%')).toBeInTheDocument();
    // The next click takes another step of the same size, never a jump.
    clickAt(photo, 200, 200);
    expect(layer().style.transform).toBe('translate(-28.125%, -28.125%) scale(1.563)');
    // A right click takes the same step out, and stops at the whole page.
    clickAt(photo, 200, 200, 2);
    expect(layer().style.transform).toBe('translate(-12.5%, -12.5%) scale(1.25)');
    clickAt(photo, 200, 200, 2);
    expect(layer().style.transform).toBe(WHOLE);
  });

  it('zooms in on the point clicked, so the handwriting under the pointer stays there', async () => {
    renderAdmin(`${PAGE}?lucrare=14&punct=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    // A click on the page's top left corner: the page's edge stays at the pane's.
    clickAt(sizedPane(), 0, 0);
    expect(layer().style.transform).toBe('translate(0%, 0%) scale(1.25)');
  });

  it('says over the whole page what a click does, and leaves the page alone once it is zoomed', async () => {
    renderAdmin(`${PAGE}?lucrare=14&punct=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    const photo = sizedPane();
    expect(screen.getByText('Clic stânga: mărește · clic dreapta: micșorează')).toBeInTheDocument();
    clickAt(photo, 200, 200);
    // The line would sit over the handwriting the teacher zoomed in on.
    expect(screen.queryByText(/^Clic stânga/)).not.toBeInTheDocument();
    clickAt(photo, 200, 200, 2);
    clickAt(photo, 200, 200, 2);
    expect(screen.getByText('Clic stânga: mărește · clic dreapta: micșorează')).toBeInTheDocument();
  });

  it('moves the zoomed page with a drag, and shows the whole page with "Toată pagina"', async () => {
    renderAdmin(`${PAGE}?lucrare=14&punct=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    const photo = sizedPane();
    clickAt(photo, 200, 200);
    fireEvent.pointerDown(photo, { pointerId: 1, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(photo, { pointerId: 1, button: 0, clientX: 240, clientY: 200 });
    fireEvent.pointerUp(photo, { pointerId: 1, button: 0, clientX: 240, clientY: 200 });
    expect(layer().style.transform).toBe('translate(-2.5%, -12.5%) scale(1.25)');

    await userEvent.click(screen.getByRole('button', { name: 'Toată pagina' }));
    expect(layer().style.transform).toBe(WHOLE);
    expect(screen.getByRole('button', { name: 'Toată pagina' })).toBeDisabled();
  });

  it('takes the same step with the buttons over the page, which stop at the ends', async () => {
    renderAdmin(`${PAGE}?lucrare=14&punct=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    const bigger = screen.getByRole('button', { name: 'Mărește' });
    const smaller = screen.getByRole('button', { name: 'Micșorează' });
    expect(smaller).toBeDisabled();
    expect(screen.getByText('100%')).toBeInTheDocument();
    await userEvent.click(bigger);
    expect(layer().style.transform).toBe('translate(-12.5%, -12.5%) scale(1.25)');
    expect(smaller).toBeEnabled();
    await userEvent.click(smaller);
    expect(layer().style.transform).toBe(WHOLE);

    // Nine steps reach the biggest zoom, where "Mărește" stops.
    for (let step = 0; step < 9; step += 1) fireEvent.click(bigger);
    expect(layer().style.transform).toBe('translate(-250%, -250%) scale(6)');
    expect(bigger).toBeDisabled();
    expect(screen.getByText('600%')).toBeInTheDocument();
  });

  it('shows the whole page again with Esc, and a right button never opens the browser menu', async () => {
    renderAdmin(`${PAGE}?lucrare=14&punct=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    const photo = sizedPane();
    clickAt(photo, 200, 200);
    expect(fireEvent.contextMenu(photo)).toBe(false);
    expect(layer().style.transform).toBe('translate(-12.5%, -12.5%) scale(1.25)');
    await userEvent.keyboard('{Escape}');
    expect(layer().style.transform).toBe(WHOLE);
  });

  it('closes only the panel of the bar with Esc while the page is zoomed', async () => {
    renderAdmin(`${PAGE}?lucrare=14&punct=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    clickAt(sizedPane(), 200, 200);
    await userEvent.click(await screen.findByRole('button', { name: /^De făcut/ }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Ce ai de făcut' })).not.toBeInTheDocument();
    expect(layer().style.transform).toBe('translate(-12.5%, -12.5%) scale(1.25)');
  });

  it('closes only the panel with Esc when the focus left the bar, and keeps the zoom', async () => {
    renderAdmin(`${PAGE}?lucrare=14&punct=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    clickAt(sizedPane(), 200, 200);
    await userEvent.click(await screen.findByRole('button', { name: /^De făcut/ }));
    (document.activeElement as HTMLElement).blur();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Ce ai de făcut' })).not.toBeInTheDocument();
    expect(layer().style.transform).toBe('translate(-12.5%, -12.5%) scale(1.25)');
  });

  it('leaves the wheel to the page, which scrolls with it, and zooms a trackpad pinch', async () => {
    renderAdmin(`${PAGE}?lucrare=14&punct=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    const photo = sizedPane();
    // The page scrolls under a plain wheel: the photo neither zooms nor takes the wheel.
    expect(fireEvent.wheel(photo, { deltaY: -100, clientX: 200, clientY: 200 })).toBe(true);
    expect(fireEvent.wheel(photo, { deltaY: 100, clientX: 200, clientY: 200 })).toBe(true);
    expect(layer().style.transform).toBe(WHOLE);
    // A trackpad pinch comes as a wheel with Ctrl, and the photo takes it.
    expect(fireEvent.wheel(photo, { deltaY: -20, ctrlKey: true, clientX: 200, clientY: 200 })).toBe(false);
    expect(layer().style.transform).toMatch(/^translate\(-11\.\d+%, -11\.\d+%\) scale\(1\.22\d*\)$/);
  });

  it('pinches with two fingers on a touch screen, and a pinch is never a click', async () => {
    renderAdmin(`${PAGE}?lucrare=14&punct=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    const photo = sizedPane();
    // Two fingers 200 px apart, their middle a little right of the pane's middle.
    fireEvent.pointerDown(photo, { pointerId: 1, button: 0, clientX: 100, clientY: 200 });
    fireEvent.pointerDown(photo, { pointerId: 2, button: 0, clientX: 300, clientY: 200 });
    // Farther apart by a fifth: a fifth more of the page.
    fireEvent.pointerMove(photo, { pointerId: 2, clientX: 340, clientY: 200 });
    expect(layer().style.transform).toBe('translate(-11%, -10%) scale(1.2)');
    fireEvent.pointerUp(photo, { pointerId: 2, button: 0, clientX: 340, clientY: 200 });
    fireEvent.pointerUp(photo, { pointerId: 1, button: 0, clientX: 100, clientY: 200 });
    // Lifting the fingers never takes another step.
    expect(layer().style.transform).toBe('translate(-11%, -10%) scale(1.2)');
  });

  it('shows a page whole again when the teacher comes back to it', async () => {
    renderAdmin(`${PAGE}?lucrare=11&punct=pagini`, apiWith());
    await screen.findByText('Ana Pop · 2/3');
    clickAt(sizedPane(), 200, 200);
    expect(layer().style.transform).not.toBe(WHOLE);
    await userEvent.keyboard('1');
    await userEvent.keyboard('2');
    expect(screen.getByText('Ana Pop · 2/3')).toBeInTheDocument();
    expect(layer().style.transform).toBe(WHOLE);
  });

  it('gives a new page the usual shape until its photo loads', async () => {
    renderAdmin(`${PAGE}?lucrare=11&punct=pagini`, apiWith());
    await screen.findByText('Ana Pop · 2/3');
    const image = layer().querySelector('img')!;
    Object.defineProperty(image, 'naturalWidth', { value: 2000 });
    Object.defineProperty(image, 'naturalHeight', { value: 1000 });
    fireEvent.load(image);
    expect(pane().style.getPropertyValue('--page-ratio')).toBe('2');
    await userEvent.keyboard('1');
    expect(pane().style.getPropertyValue('--page-ratio')).toBe('0.75');
  });

  it('opens another page whole, and a PDF page has no zoom', async () => {
    renderAdmin(`${PAGE}?lucrare=11&punct=pagini`, apiWith());
    await screen.findByText('Ana Pop · 2/3');
    clickAt(sizedPane(), 200, 200);
    expect(layer().style.transform).not.toBe(WHOLE);
    await userEvent.keyboard('1');
    expect(screen.getByText('Ana Pop · 1/3')).toBeInTheDocument();
    expect(layer().style.transform).toBe(WHOLE);
    await userEvent.keyboard('3');
    expect(screen.queryByTestId('zoom-pane')).not.toBeInTheDocument();
    expect(screen.getByTitle('Pagina 3 a lucrării')).toHaveAttribute('src', submissionFileUrl(11, 103));
    expect(screen.queryByRole('button', { name: 'Toată pagina' })).not.toBeInTheDocument();
  });
});

// Ion's I.3 in two parts, given out of page order: the second page, then the
// first. II.4 waits too, on the first page. Ion has two photo pages here.
const TOP = { page: 1, x0: 0.2, y0: 0.3, x1: 0.6, y1: 0.4 };
const LOW = { page: 2, x0: 0.1, y0: 0.5, x1: 0.9, y1: 0.8 };
const OTHER = { page: 1, x0: 0.1, y0: 0.02, x1: 0.5, y1: 0.12 };
function framed(areas: AnswerArea[] = [LOW, TOP]): SubmissionDetail[] {
  const list = papers();
  const ion = list[1]!;
  ion.files = [photo(141, 'i1.jpg'), photo(142, 'i2.jpg')];
  ion.evaluation = fakeEvaluation([
    fakeItem({ id: 41, exerciseId: 'I.3', label: 'Subiectul I, ex. 3', points: 3, maxPoints: 5, needsReview: true, reviewReason: 'Răspunsul e tăiat.', areas }),
    fakeItem({ id: 42, exerciseId: 'II.4', label: 'Subiectul II, ex. 4', points: 1, maxPoints: 2, needsReview: true, reviewReason: 'Neclar.', areas: [OTHER] }),
  ]);
  return list;
}
const frame = () => screen.getByTestId('answer-frame');
const ION_I3 = `${PAGE}?lucrare=14&punct=41`;

// A phone: a finger, not a mouse, presses the controls.
const onPhone = () =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(pointer: coarse)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

afterEach(() => vi.unstubAllGlobals());

describe('the border of the answer to check', () => {
  it('opens the answer on its first part, on the whole page, with an orange border and its label outside it', async () => {
    renderAdmin(ION_I3, apiWith(framed()));
    expect(await screen.findByText('Ion Popa · 1/2')).toBeInTheDocument();
    // The page never zooms by itself: the border alone shows where the answer is.
    expect(layer().style.transform).toBe(WHOLE);
    expect(frame().style).toMatchObject({ left: '20%', top: '30%', width: '40%', height: '10%' });
    expect(within(frame()).getByText('I.3 · partea 1 din 2')).not.toHaveClass('is-below');
    expect(within(frame()).getByRole('button', { name: 'Partea anterioară' })).toBeDisabled();
    expect(within(frame()).getByRole('button', { name: 'Partea următoare' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Arată chenarul' })).toHaveAttribute('aria-pressed', 'true');
    // The switch floats over the photo's top left with "Toată pagina"; the
    // zoom stays alone on the top right.
    const view = screen.getByRole('group', { name: 'Vederea paginii' });
    expect(view).toContainElement(screen.getByRole('button', { name: 'Arată chenarul' }));
    expect(view).toContainElement(screen.getByRole('button', { name: 'Toată pagina' }));
    expect(within(screen.getByRole('group', { name: 'Mărirea paginii' })).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Micșorează',
      'Mărește',
    ]);
  });

  it('steps to the next part on its page and back', async () => {
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    await userEvent.click(screen.getByRole('button', { name: 'Partea următoare' }));
    expect(screen.getByText('Ion Popa · 2/2')).toBeInTheDocument();
    // A part this big shows on the whole page.
    expect(layer().style.transform).toBe(WHOLE);
    expect(frame().style).toMatchObject({ left: '10%', top: '50%', width: '80%', height: '30%' });
    expect(within(frame()).getByText('I.3 · partea 2 din 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Partea următoare' })).toBeDisabled();
    // The arrows are the teacher's own move, and they never zoom on their own:
    // the part opens on its page, whole.
    await userEvent.click(screen.getByRole('button', { name: 'Partea anterioară' }));
    expect(screen.getByText('Ion Popa · 1/2')).toBeInTheDocument();
    expect(layer().style.transform).toBe(WHOLE);
  });

  it('floats the part controls inside the pane on a phone, where a finger reaches them', async () => {
    onPhone();
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    const pane = screen.getByTestId('zoom-pane');
    expect(within(pane).getByRole('button', { name: 'Partea următoare' })).toBeInTheDocument();
    expect(within(pane).getByText('1 din 2')).toBeInTheDocument();
    // Not beside the label, where the pane's edge would cut them off.
    expect(within(frame()).queryByRole('button', { name: 'Partea următoare' })).not.toBeInTheDocument();
    await userEvent.click(within(pane).getByRole('button', { name: 'Partea următoare' }));
    expect(screen.getByText('Ion Popa · 2/2')).toBeInTheDocument();
    expect(within(pane).getByText('2 din 2')).toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: 'Partea următoare' })).toBeDisabled();
  });

  it('draws the border on a page picked by hand, on the whole page', async () => {
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    await userEvent.click(screen.getByRole('button', { name: 'Pagina 2' }));
    expect(layer().style.transform).toBe(WHOLE);
    expect(within(frame()).getByText('I.3 · partea 2 din 2')).toBeInTheDocument();
  });

  it('puts the label below the border when there is no room above it', async () => {
    renderAdmin(`${PAGE}?lucrare=14&punct=42`, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    expect(within(frame()).getByText('II.4')).toHaveClass('is-below');
    expect(screen.queryByText(/Partea 1/)).not.toBeInTheDocument();
  });

  it("moves to the next point's area after a decision, on the same page", async () => {
    renderAdmin(ION_I3, apiWith(framed([TOP])));
    await screen.findByText('Ion Popa · 1/2');
    clickAt(sizedPane(), 200, 200);
    await userEvent.click(within(decision()).getByRole('button', { name: 'Accept 3p' }));
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 4' })).toBeInTheDocument();
    expect(within(frame()).getByText('II.4')).toBeInTheDocument();
    // The next answer opens whole: its border shows where it is.
    expect(layer().style.transform).toBe(WHOLE);
  });

  it('opens the next point whole after a decision while the border is off', async () => {
    renderAdmin(ION_I3, apiWith(framed([TOP])));
    await screen.findByText('Ion Popa · 1/2');
    await userEvent.click(screen.getByRole('button', { name: 'Arată chenarul' }));
    clickAt(sizedPane(), 200, 200);
    expect(layer().style.transform).not.toBe(WHOLE);
    await userEvent.click(within(decision()).getByRole('button', { name: 'Accept 3p' }));
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 4' })).toBeInTheDocument();
    expect(screen.getByText('Ion Popa · 1/2')).toBeInTheDocument();
    expect(layer().style.transform).toBe(WHOLE);
  });

  it('turns the border off and on, and remembers the choice in this browser', async () => {
    const first = renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    await userEvent.click(screen.getByRole('button', { name: 'Arată chenarul' }));
    expect(screen.queryByTestId('answer-frame')).not.toBeInTheDocument();
    expect(screen.queryByText('Partea 1 din 2')).not.toBeInTheDocument();
    expect(layer().style.transform).toBe(WHOLE);
    first.unmount();

    // Off: the answer opens on its page, whole, as before.
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    expect(screen.getByRole('button', { name: 'Arată chenarul' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('answer-frame')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Arată chenarul' }));
    expect(within(frame()).getByText('I.3 · partea 1 din 2')).toBeInTheDocument();
    expect(layer().style.transform).toBe(WHOLE);
  });

  it('opens as before an answer with no area it can draw: on a PDF page, or on a page the paper does not have', async () => {
    const list = papers();
    list[0]!.evaluation!.items[1]!.areas = [{ ...TOP, page: 3 }, { ...TOP, page: 9 }];
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, apiWith(list));
    expect(await screen.findByText('Ana Pop · 3/3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arată chenarul' })).not.toBeInTheDocument();
    await userEvent.keyboard('1');
    expect(layer().style.transform).toBe(WHOLE);
    expect(screen.queryByTestId('answer-frame')).not.toBeInTheDocument();
  });
});
