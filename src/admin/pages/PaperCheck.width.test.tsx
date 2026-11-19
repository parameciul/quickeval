import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { ApiError } from '../api.ts';
import { CLOSE_DELAY } from '../submissionPage/GradedResult.tsx';
import { createFakeApi, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
import { PAGE, rowsOf, papers, apiWith, paperAt, at, students, readsOf, decision, pause, row } from './paperCheckTestKit.tsx';

afterEach(() => vi.unstubAllGlobals());

describe('the points to check on the paper page', () => {
  it('puts the bar of the paper’s width between the exercises and the paper, only while the paper shows', async () => {
    renderAdmin(paperAt(11, '32', 'all'), apiWith());
    expect(await screen.findByText('Ana Pop · 3/3')).toBeInTheDocument();
    const panes = document.querySelector<HTMLElement>('.paper-panes')!;
    const bar = screen.getByRole('separator', { name: 'Lățimea lucrării' });
    expect(bar.previousElementSibling).toHaveClass('paper-main');
    expect(bar.nextElementSibling).toHaveClass('review-photo');
    expect(document.getElementById(bar.getAttribute('aria-controls')!)).toBe(bar.nextElementSibling);
    // No width of her own yet: the start width, with the page no taller than the screen.
    expect(panes).toHaveClass('has-split');
    expect(panes).not.toHaveClass('has-photo-width');
    bar.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(panes).toHaveClass('has-photo-width');
    expect(panes.style.getPropertyValue('--photo-share')).toBe('4.2fr');
    expect(localStorage.getItem('quickeval:paperPhotoWidth')).toBe('0.42');
    await userEvent.click(screen.getByRole('button', { name: 'Ascunde lucrarea' }));
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    expect(panes).not.toHaveClass('has-split');
    expect(panes.style.getPropertyValue('--photo-share')).toBe('');
  });

  it('opens the paper at the width saved in this browser', async () => {
    localStorage.setItem('quickeval:paperPhotoWidth', '0.6');
    renderAdmin(paperAt(11, '32', 'all'), apiWith());
    expect(await screen.findByText('Ana Pop · 3/3')).toBeInTheDocument();
    expect(screen.getByRole('separator', { name: 'Lățimea lucrării' })).toHaveAttribute('aria-valuenow', '60');
    expect(document.querySelector('.paper-panes')).toHaveClass('has-photo-width');
  });

  it('hides the paper for more room, keeps the choice in this browser, and shows it again', async () => {
    const first = renderAdmin(paperAt(11, '32', 'all'), apiWith(), <LocationProbe />);
    expect(await screen.findByText('Ana Pop · 3/3')).toBeInTheDocument();
    expect(screen.getByText(/pagina$/, { selector: '.review-keys-line > span' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ascunde lucrarea' }));
    expect(screen.queryByText('Ana Pop · 3/3')).not.toBeInTheDocument();
    expect(screen.queryByText(/pagina$/, { selector: '.review-keys-line > span' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lucrarea' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Lucrarea' })).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem('quickeval:paperPhotoFolded')).toBe('on');
    // The keys still walk the points; the numbers have no page to show.
    await userEvent.keyboard('k');
    await expectLocation(at(11, 'pages', 'all'));
    first.unmount();
    renderAdmin(paperAt(11, '32', 'all'), apiWith());
    await userEvent.click(await screen.findByRole('button', { name: 'Lucrarea' }));
    expect(screen.getByText('Ana Pop · 3/3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lucrarea' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Lucrarea' })).toHaveFocus();
    expect(localStorage.getItem('quickeval:paperPhotoFolded')).toBe('off');
    // "Lucrarea" hides it too.
    await userEvent.click(screen.getByRole('button', { name: 'Lucrarea' }));
    expect(screen.queryByText('Ana Pop · 3/3')).not.toBeInTheDocument();
  });

  it('says which point of how many is open, between the arrows of the points', async () => {
    renderAdmin(PAGE, apiWith(), <LocationProbe />);
    await expectLocation(at(11, 'pages'));
    const points = await screen.findByRole('group', { name: 'Punctele de verificat' });
    expect(points).toHaveTextContent('Punct 1/3');
    await userEvent.click(within(points).getByRole('button', { name: 'Următorul punct' }));
    await expectLocation(at(11, '32'));
    expect(screen.getByRole('group', { name: 'Punctele de verificat' })).toHaveTextContent('Punct 2/3');
    expect(screen.getByRole('button', { name: 'Următorul punct' })).toHaveAttribute('title', 'Următorul punct (J)');
    // Both arrows look alike: no blue arrow.
    for (const name of ['Punctul anterior', 'Următorul punct']) expect(screen.getByRole('button', { name })).toHaveAttribute('class', 'move-arrow');
    expect(within(screen.getByRole('group', { name: 'Elevii' })).getByRole('button', { name: 'Elevul următor' })).toBeEnabled();
  });

  it('changes no page with the numbers while the paper is folded', async () => {
    renderAdmin(paperAt(11, '32', 'all'), apiWith());
    expect(await screen.findByText('Ana Pop · 3/3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ascunde lucrarea' }));
    await userEvent.keyboard('1');
    await userEvent.click(screen.getByRole('button', { name: 'Lucrarea' }));
    expect(screen.getByText('Ana Pop · 3/3')).toBeInTheDocument();
  });

  it('shows the folded paper again on "Arată pe lucrare", and leaves it folded for a click on a row', async () => {
    renderAdmin(paperAt(11, null, 'all'), apiWith(), <LocationProbe />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ascunde lucrarea' }));
    await userEvent.click(within(row('Subiectul II, ex. 1')).getByText('x = 3'));
    await expectLocation(at(11, '32', 'all'));
    expect(screen.getByRole('button', { name: 'Lucrarea' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' }));
    await expectLocation(at(11, '31', 'all'));
    expect(screen.getByText('Ana Pop · 1/3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ascunde lucrarea' })).not.toHaveFocus();
    expect(localStorage.getItem('quickeval:paperPhotoFolded')).toBe('off');
    // On the open row, it shows the paper and leaves the row open.
    await userEvent.click(screen.getByRole('button', { name: 'Ascunde lucrarea' }));
    await userEvent.click(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' }));
    expect(screen.getByText('Ana Pop · 1/3')).toBeInTheDocument();
    await pause(CLOSE_DELAY + 100);
    await expectLocation(at(11, '31', 'all'));
    expect(row('Subiectul I, ex. 1')).toHaveClass('is-open');
  });

  it('hides the paper with no files too', async () => {
    const [ana, ion, eva] = papers();
    ion!.files = [];
    renderAdmin(paperAt(14, '41'), apiWith([ana!, ion!, eva!]));
    await userEvent.click(await screen.findByRole('button', { name: 'Ascunde lucrarea' }));
    expect(screen.queryByText('Elevul nu a încărcat niciun fișier.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lucrarea' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens a paper with nothing left to check with its photo hidden, and keeps the saved choice', async () => {
    renderAdmin(paperAt(13, null, 'all'), apiWith());
    const toggle = await screen.findByRole('button', { name: 'Lucrarea' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Ascunde lucrarea' })).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Ascunde lucrarea' })).toBeInTheDocument();
    expect(localStorage.getItem('quickeval:paperPhotoFolded')).toBeNull();
  });

  it('opens a paper with points to check with its photo, as the saved choice says', async () => {
    renderAdmin(paperAt(11, null, 'all'), apiWith());
    expect(await screen.findByRole('button', { name: 'Ascunde lucrarea' })).toBeInTheDocument();
  });

  it('keeps the photo when the last point of the paper is decided', async () => {
    renderAdmin(paperAt(14, '41', 'all'), apiWith(), <LocationProbe />);
    const open = await screen.findByRole('region', { name: 'Decizia' });
    await userEvent.click(within(open).getByRole('button', { name: /^Accept/ }));
    await waitFor(() => expect(document.querySelector('.decision-slot.is-current')).toBeNull());
    expect(screen.getByRole('button', { name: 'Ascunde lucrarea' })).toBeInTheDocument();
  });

  it('opens a student of the list at the top of the page, and keeps the place for J and K', async () => {
    const scroll = vi.spyOn(window, 'scrollTo');
    renderAdmin(PAGE, apiWith(), <LocationProbe />);
    await screen.findByText('Ana Pop · 2/3');
    await userEvent.keyboard('j');
    await expectLocation(at(11, '32'));
    expect(scroll).not.toHaveBeenCalled();
    await userEvent.click(within(students()).getByRole('link', { name: 'Eva Stan nota 5' }));
    expect(scroll).toHaveBeenCalledWith(0, 0);
    scroll.mockRestore();
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
    await expectLocation(/^\/tests\/6E2-26T1#review$/);
  });

  it('acts once for a key held down', async () => {
    const api = apiWith();
    renderAdmin(paperAt(11, 'pages'), api, <LocationProbe />);
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
    await screen.findByRole('link', { name: 'Ana Pop: 0 din 2 verificate' });
    await held.done();
    // The decided point counts on the test page, which stays.
    expect(await screen.findByRole('link', { name: 'Ana Pop: 1 din 2 verificate' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/tests\/6E2-26T1$/);
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
    await expectLocation(at(11, '32', 'all'));
    await held.done();
    expect(screen.getByTestId('location')).toHaveTextContent(at(11, '32', 'all'));
  });

  it('acts on the keys after "Începe" in De făcut', async () => {
    const api = apiWith();
    renderAdmin('/tests/6E2-26T1', api, <LocationProbe />);
    await screen.findByRole('link', { name: 'Ana Pop: 0 din 2 verificate' });
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
    expect(screen.getByTestId('location')).toHaveTextContent(at(11, 'pages'));
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
    renderAdmin(`${PAGE}?paper=11&item=32`, api, <LocationProbe />);
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
    renderAdmin(paperAt(11, 'pages'), api, <LocationProbe />);
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
