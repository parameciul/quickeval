import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, submissionFileUrl } from '../api.ts';
import { fakeEvaluation, fakeItem } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
import { PAGE, GRADED_AT, papers, apiWith, paperAt, at, students, readsOf, decision, row } from './paperCheckTestKit.tsx';

afterEach(() => vi.unstubAllGlobals());

describe('the points to check on the paper page', () => {
  it('opens an old Romanian address of the review at the point it names', async () => {
    renderAdmin('/teste/6E2-26T1/verificare?lucrare=11&punct=pagini', apiWith(), <LocationProbe />);
    await expectLocation(at(11, 'pages'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana Pop' })).toBeInTheDocument();
  });

  it('opens an old Romanian address of a paper with all its exercises', async () => {
    renderAdmin('/teste/6E2-26T1/elevi/11?punct=32&vedere=toate', apiWith(), <LocationProbe />);
    await expectLocation('/tests/6E2-26T1/papers/11?item=32&view=all');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana Pop' })).toBeInTheDocument();
  });

  it('opens the address of the review on the first point, the students with points first', async () => {
    renderAdmin(PAGE, apiWith(), <LocationProbe />);
    await expectLocation(at(11, 'pages'));
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
    await expectLocation(at(11, 'pages'));
    await userEvent.keyboard('k');
    await expectLocation(at(14, '41'));
    await userEvent.keyboard('j');
    await expectLocation(at(11, 'pages'));
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
    renderAdmin(paperAt(11, '32', 'all'), apiWith(), <LocationProbe />);
    await screen.findByRole('region', { name: 'Decizia' });
    const keys = screen.getByText(/punctul următor sau anterior/).closest('p')!;
    const bar = screen.getByRole('group', { name: 'Exercițiile arătate' }).parentElement!;
    expect(bar).toContainElement(keys);
    expect(keys).toHaveTextContent('A accept');
    expect(keys).toHaveTextContent('1–3 pagina');
    await userEvent.click(row('Subiectul I, ex. 1'));
    await expectLocation(at(11, '31', 'all'));
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
    await expectLocation(at(11, 'pages'));
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
    // One point: nowhere to move.
    expect(screen.getByRole('button', { name: 'Următorul punct' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Punctul anterior' })).toBeDisabled();
    expect(screen.getByRole('group', { name: 'Punctele de verificat' })).toHaveTextContent('Punct 1/1');

    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 3p' }));
    expect(await screen.findByText(/Toate punctele sunt verificate\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mergi la Rezultate' })).toHaveAttribute('href', '/tests/6E2-26T1#results');
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
    renderAdmin(paperAt(13, null, 'all'), api, <LocationProbe />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Eva Stan' })).toBeInTheDocument();
    // Ion is after Eva, Dan before her.
    await waitFor(() => expect(readsOf(api, 14)).toBe(1));
    expect(readsOf(api, 12)).toBe(1);
    await userEvent.click(screen.getByRole('button', { name: 'Elevul următor' }));
    await expectLocation(at(14, null, 'all'));
    // The paper is there at once: no moment with no paper.
    expect(screen.queryByText('Se încarcă lucrarea…')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Ion Popa' })).toBeInTheDocument();
    expect(within(row('Subiectul I, ex. 3')).getByText('3 din 5')).toBeInTheDocument();
  });
});
