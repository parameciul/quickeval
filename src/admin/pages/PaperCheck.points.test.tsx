import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { submissionFileUrl } from '../api.ts';
import { CLOSE_DELAY } from '../submissionPage/GradedResult.tsx';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
import { apiWith, paperAt, at, students, decision, pause, row } from './paperCheckTestKit.tsx';

afterEach(() => vi.unstubAllGlobals());

describe('the points to check on the paper page', () => {
  it('shows a paper with no point to check with all its exercises, its grade and its page', async () => {
    renderAdmin(paperAt(13, null, 'all'), apiWith());
    expect(await screen.findByText(/^Nota/)).toHaveTextContent('Nota 5 · 5 puncte din 10, cu 1 din oficiu');
    expect(within(row('Subiectul I, ex. 1')).getByText('4 din 4,5')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Decizia' })).not.toBeInTheDocument();
    // A checked paper opens with its photo hidden.
    await userEvent.click(screen.getByRole('button', { name: 'Lucrarea' }));
    expect(screen.getByTitle('Pagina 1 a lucrării')).toHaveAttribute('src', submissionFileUrl(13, 131));
    expect(within(students()).getByRole('link', { name: 'Eva Stan nota 5' })).toHaveAttribute('aria-current', 'true');
  });

  it('says so when only the points to check show and the paper has none', async () => {
    renderAdmin(paperAt(13), apiWith());
    expect(await screen.findByText('Niciun exercițiu de verificat în această lucrare.')).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Subiectul I, ex\. 1/ })).not.toBeInTheDocument();
  });

  it('opens any exercise on the paper: its page, and a decision only for one to check', async () => {
    renderAdmin(paperAt(11, null, 'all'), apiWith(), <LocationProbe />);
    await screen.findByText('Ana Pop · 1/3');
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await expectLocation(at(11, '32', 'all'));
    expect(screen.getByText('Ana Pop · 3/3')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' }));
    await expectLocation(at(11, '31', 'all'));
    expect(row('Subiectul I, ex. 1')).toHaveClass('is-open');
    expect(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Ana Pop · 1/3')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Decizia' })).not.toBeInTheDocument();
    // II.1 still waits: closed, it shows "Verifică", which opens it again.
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByRole('button', { name: 'Verifică Subiectul II, ex. 1' }));
    await expectLocation(at(11, '32', 'all'));
  });

  it('switches between all the exercises and only the points to check, in the address', async () => {
    renderAdmin(paperAt(11, null, 'all'), apiWith(), <LocationProbe />);
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
    await expectLocation(at(14, '41', 'all'));
  });

  it('opens the next point of the same student after a decision in all the exercises, and never another student', async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, 'pages', 'all'), api, <LocationProbe />);
    await userEvent.click(await within(await screen.findByRole('region', { name: 'Decizia' })).findByRole('button', { name: 'Am verificat paginile' }));
    await expectLocation(at(11, '32', 'all'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toHaveFocus());
    await userEvent.click(within(decision()).getByRole('button', { name: 'Accept 1p' }));
    // No point of Ana is left: the row stays open, and "Elevul următor" waits.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Elevul următor' })).toHaveFocus());
    await expectLocation(at(11, '32', 'all'));
    expect(screen.queryByRole('region', { name: 'Decizia' })).not.toBeInTheDocument();
    expect(within(row('Subiectul II, ex. 1')).getByText('Verificat')).toBeInTheDocument();
  });

  it('puts the focus on the exercises after the last point of the last student, in all the exercises', async () => {
    renderAdmin(paperAt(14, '41', 'all'), apiWith(), <LocationProbe />);
    const panel = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Accept 3p' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Exercițiile' })).toHaveFocus());
    // The arrow still goes round to the first student, but does not take the focus.
    expect(screen.getByRole('button', { name: 'Elevul următor' })).toBeEnabled();
    await expectLocation(at(14, '41', 'all'));
  });

  it('walks only the points of the open student with J and K in all the exercises', async () => {
    renderAdmin(paperAt(11, null, 'all'), apiWith(), <LocationProbe />);
    await screen.findByText('Ana Pop · 1/3');
    await userEvent.keyboard('j');
    await expectLocation(at(11, 'pages', 'all'));
    await userEvent.keyboard('j');
    await expectLocation(at(11, '32', 'all'));
    await userEvent.keyboard('j');
    await expectLocation(at(11, 'pages', 'all'));
    // The moves through the points show only with the points to check.
    expect(screen.queryByRole('group', { name: 'Punctele de verificat' })).not.toBeInTheDocument();
  });

  it('moves to the student before or after, in the order of the list, and goes round', async () => {
    renderAdmin(paperAt(11, null, 'all'), apiWith(), <LocationProbe />);
    await screen.findByText('Ana Pop · 1/3');
    const students = screen.getByRole('group', { name: 'Elevii' });
    expect(students).toHaveTextContent('Elev 1/4');
    // Before the first student comes the last.
    await userEvent.click(screen.getByRole('button', { name: 'Elevul anterior' }));
    await expectLocation(at(14, null, 'all'));
    expect(screen.getByRole('group', { name: 'Elevii' })).toHaveTextContent('Elev 4/4');
    // After the last comes the first.
    await userEvent.click(screen.getByRole('button', { name: 'Elevul următor' }));
    await expectLocation(at(11, null, 'all'));
    await userEvent.click(screen.getByRole('button', { name: 'Elevul următor' }));
    await expectLocation(at(12, null, 'all'));
    expect(screen.getByRole('group', { name: 'Elevii' })).toHaveTextContent('Elev 2/4');
    await userEvent.click(screen.getByRole('button', { name: 'Elevul anterior' }));
    await expectLocation(at(11, null, 'all'));
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
    renderAdmin(paperAt(11, null, 'all'), apiWith(), <LocationProbe />);
    await screen.findByText('Ana Pop · 1/3');
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await expectLocation(at(11, '32', 'all'));
    expect(await screen.findByRole('region', { name: 'Decizia' })).toBeInTheDocument();
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await expectLocation(at(11, null, 'all'));
    expect(screen.queryByRole('region', { name: 'Decizia' })).not.toBeInTheDocument();
    expect(row('Subiectul II, ex. 1')).not.toHaveClass('is-open');
    await userEvent.click(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' }));
    await expectLocation(at(11, '31', 'all'));
    await userEvent.click(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' }));
    await expectLocation(at(11, null, 'all'));
    expect(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('leaves the row as it is when a click ends a selection of its text', async () => {
    renderAdmin(paperAt(11, '32', 'all'), apiWith(), <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
    const selection = vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'x = 3' } as Selection);
    try {
      // Open, it stays open; closed, it stays closed.
      await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
      await pause(CLOSE_DELAY + 100);
      await expectLocation(at(11, '32', 'all'));
      await userEvent.click(within(row('Subiectul I, ex. 1')).getByRole('rowheader'));
      await expectLocation(at(11, '32', 'all'));
    } finally {
      selection.mockRestore();
    }
  });

  it('keeps the open row open on a double or a triple click, which selects a word to copy', async () => {
    renderAdmin(paperAt(11, '32', 'all'), apiWith(), <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
    await userEvent.dblClick(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await pause(CLOSE_DELAY + 100);
    await expectLocation(at(11, '32', 'all'));
    await userEvent.tripleClick(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await pause(CLOSE_DELAY + 100);
    await expectLocation(at(11, '32', 'all'));
    expect(screen.getByRole('region', { name: 'Decizia' })).toBeInTheDocument();
  });

  it('keeps a row to check open, dimmed, when another row opens, so the rows under it do not move', async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, 'pages', 'all'), api, <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Decide: Paginile necitite' })).toBeInTheDocument();
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await expectLocation(at(11, '32', 'all'));
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
    renderAdmin(paperAt(11, 'pages', 'all'), apiWith(), <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Decide: Paginile necitite' })).toBeInTheDocument();
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await expectLocation(at(11, '32', 'all'));
    await userEvent.click(screen.getByRole('button', { name: 'Verifică paginile necitite' }));
    await expectLocation(at(11, 'pages', 'all'));
    expect(within(decision()).getByRole('heading', { name: 'Decide: Paginile necitite' })).toBeInTheDocument();
    expect(row('Subiectul II, ex. 1')).toHaveClass('is-kept');
    expect(document.querySelector('.item-decision .decision-slot')).toHaveClass('is-kept');
  });

  it('closes the open row and leaves the kept one as it is', async () => {
    renderAdmin(paperAt(11, 'pages', 'all'), apiWith(), <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Decide: Paginile necitite' })).toBeInTheDocument();
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await expectLocation(at(11, '32', 'all'));
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await expectLocation(at(11, null, 'all'));
    expect(screen.queryByRole('region', { name: 'Decizia' })).not.toBeInTheDocument();
    expect(row('Subiectul II, ex. 1')).not.toHaveClass('is-open');
    expect(row('Subiectul II, ex. 1')).not.toHaveClass('is-kept');
    expect(document.querySelector('.pages-check .decision-slot')).toHaveClass('is-kept');
    // The row closed by its own click is not kept when another opens.
    await userEvent.click(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' }));
    await expectLocation(at(11, '31', 'all'));
    expect(row('Subiectul II, ex. 1')).not.toHaveClass('is-kept');
  });

  it('keeps no row open when the teacher moves with J, K or the buttons', async () => {
    renderAdmin(paperAt(11, 'pages', 'all'), apiWith(), <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Decide: Paginile necitite' })).toBeInTheDocument();
    await userEvent.keyboard('j');
    await expectLocation(at(11, '32', 'all'));
    await userEvent.keyboard('k');
    await expectLocation(at(11, 'pages', 'all'));
    expect(document.querySelectorAll('.decision-slot.is-kept')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Doar de verificat (3)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Următorul punct' }));
    await expectLocation(at(11, '32'));
    expect(document.querySelectorAll('.decision-slot.is-kept')).toHaveLength(0);
  });

  it('keeps what was typed in a kept decision, for when its row opens again', async () => {
    renderAdmin(paperAt(11, '32', 'all'), apiWith(), <LocationProbe />);
    const field = await within(await screen.findByRole('region', { name: 'Decizia' })).findByRole('textbox', { name: /Alt punctaj/ });
    await userEvent.clear(field);
    await userEvent.type(field, '1,5');
    await userEvent.click(screen.getByRole('button', { name: 'Verifică paginile necitite' }));
    await expectLocation(at(11, 'pages', 'all'));
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByRole('button', { name: 'Verifică Subiectul II, ex. 1' }));
    await expectLocation(at(11, '32', 'all'));
    expect(within(decision()).getByRole('textbox', { name: /Alt punctaj/ })).toHaveValue('1,5');
  });

  it('puts the focus on the next decision after a decision, though it was kept', async () => {
    renderAdmin(paperAt(11, '32', 'all'), apiWith(), <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Verifică paginile necitite' }));
    await expectLocation(at(11, 'pages', 'all'));
    await userEvent.click(within(decision()).getByRole('button', { name: 'Am verificat paginile' }));
    await expectLocation(at(11, '32', 'all'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Decide: Subiectul II, ex. 1' })).toHaveFocus());
  });

  it('drops a kept row once it is checked', async () => {
    renderAdmin(paperAt(11, 'pages', 'all'), apiWith(), <LocationProbe />);
    expect(await screen.findByRole('heading', { name: 'Decide: Paginile necitite' })).toBeInTheDocument();
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await expectLocation(at(11, '32', 'all'));
    await userEvent.click(screen.getByRole('button', { name: 'Verifică paginile necitite' }));
    await userEvent.click(await within(decision()).findByRole('button', { name: 'Am verificat paginile' }));
    // The next point opens: II.1, kept until now, is the open row.
    await expectLocation(at(11, '32', 'all'));
    await waitFor(() => expect(document.querySelector('.pages-check')).toBeNull());
    expect(document.querySelectorAll('.decision-slot.is-kept')).toHaveLength(0);
  });
});
