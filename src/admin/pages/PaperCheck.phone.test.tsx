import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLOSE_DELAY } from '../submissionPage/GradedResult.tsx';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
import { apiWith, paperAt, at, decision, pause, TOP, framed, ION_I3, screenOf, openRow, stubScroll, tallPhotoBox } from './paperCheckTestKit.tsx';

afterEach(() => vi.unstubAllGlobals());

describe('the paper on a phone', () => {
  it('opens the paper inside the open card, right after the answer, not at the end of the page', async () => {
    screenOf(375);
    renderAdmin(paperAt(11, '32', 'all'), apiWith());
    expect(await screen.findByText('Ana Pop · 3/3')).toBeInTheDocument();
    const cell = openRow().querySelector('td.inline-photo-cell')!;
    expect(cell).not.toBeNull();
    expect(openRow()).toHaveClass('has-photo');
    expect(within(cell as HTMLElement).getByText('Ana Pop · 3/3')).toBeInTheDocument();
    expect(within(cell as HTMLElement).getByRole('group', { name: 'Lucrarea, la II.1' })).toContainElement(screen.getByText('Ana Pop · 3/3'));
    expect(document.querySelector('.paper-panes > .review-photo')).toBeNull();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.review-photo')).toHaveLength(1);
  });

  it('keeps the card open when the teacher zooms the paper or picks another page in it', async () => {
    screenOf(375);
    renderAdmin(paperAt(11, '32', 'all'), apiWith(), <LocationProbe />);
    expect(await screen.findByText('Ana Pop · 3/3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pagina 1' }));
    expect(await screen.findByText('Ana Pop · 1/3')).toBeInTheDocument();
    await pause(CLOSE_DELAY + 50);
    await expectLocation(at(11, '32', 'all'));
    fireEvent.click(screen.getByAltText('Pagina 1 a lucrării'));
    await pause(CLOSE_DELAY + 50);
    await expectLocation(at(11, '32', 'all'));
    expect(openRow().querySelector('td.inline-photo-cell')).not.toBeNull();
  });

  it('moves the paper to the next open card', async () => {
    screenOf(375);
    renderAdmin(paperAt(11, '32', 'all'), apiWith(), <LocationProbe />);
    expect(await screen.findByText('Ana Pop · 3/3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' }));
    await expectLocation(at(11, '31', 'all'));
    await waitFor(() => expect(within(openRow()).getByRole('rowheader')).toHaveTextContent('I.1'));
    expect(openRow().querySelector('td.inline-photo-cell')).not.toBeNull();
    expect(document.querySelectorAll('.review-photo')).toHaveLength(1);
  });

  it('shows the paper at the end of the page while no card is open', async () => {
    screenOf(375);
    renderAdmin(paperAt(14, null, 'all'), apiWith());
    expect(await screen.findByText('Ion Popa · 1/1')).toBeInTheDocument();
    expect(document.querySelector('.paper-panes > .review-photo')).not.toBeNull();
    expect(document.querySelector('.inline-photo')).toBeNull();
  });

  it('opens the paper under the pages the robot could not read, before their decision', async () => {
    screenOf(375);
    renderAdmin(paperAt(11, 'pages'), apiWith());
    expect(await screen.findByText(/^Ana Pop · /)).toBeInTheDocument();
    const pages = document.querySelector('.pages-check.is-open')!;
    const inline = pages.querySelector(':scope > .inline-photo')!;
    expect(inline).not.toBeNull();
    expect(inline.nextElementSibling).toHaveClass('decision-slot');
    expect(inline).toHaveAccessibleName('Lucrarea, la paginile necitite');
    expect(document.querySelector('.paper-panes > .review-photo')).toBeNull();
  });

  it('puts the paper in a row of its own under the open exercise while the table is a table', async () => {
    screenOf(800);
    renderAdmin(paperAt(11, '32', 'all'), apiWith());
    expect(await screen.findByText('Ana Pop · 3/3')).toBeInTheDocument();
    const next = openRow().nextElementSibling!;
    expect(next).toHaveClass('item-photo');
    expect(next.querySelector('td')).toHaveAttribute('colspan', '6');
    expect(within(next as HTMLElement).getByRole('group', { name: 'Lucrarea, la II.1' })).toBeInTheDocument();
    expect(next.nextElementSibling).toHaveClass('item-decision');
    expect(openRow().querySelector('td.inline-photo-cell')).toBeNull();
  });

  it('hides the paper from the card with its ×, the focus going to "Lucrarea"', async () => {
    screenOf(375);
    renderAdmin(paperAt(11, '32', 'all'), apiWith());
    expect(await screen.findByText('Ana Pop · 3/3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ascunde lucrarea' }));
    expect(document.querySelector('.review-photo')).toBeNull();
    expect(screen.getByRole('button', { name: 'Lucrarea' })).toHaveFocus();
    expect(openRow()).not.toHaveClass('has-photo');
  });
});

describe('the open row with its paper on a phone', () => {
  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('brings a row the teacher opens to the top of the screen, not the row the page opens on', async () => {
    const scroll = stubScroll();
    screenOf(375);
    renderAdmin(paperAt(11, '32', 'all'), apiWith(), <LocationProbe />);
    expect(await screen.findByText('Ana Pop · 3/3')).toBeInTheDocument();
    // The page as it opens (or reloads, or comes back) keeps its place.
    await pause(50);
    expect(scroll).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' }));
    await expectLocation(at(11, '31', 'all'));
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
    expect(scroll.mock.contexts[0]).toBe(openRow());
    expect(scroll).toHaveBeenLastCalledWith({ block: 'start' });
  });

  it('brings the point a decision opens to the top of the screen', async () => {
    const scroll = stubScroll();
    screenOf(375);
    renderAdmin(paperAt(11, 'pages'), apiWith(), <LocationProbe />);
    await screen.findByRole('region', { name: 'Decizia' });
    await pause(50);
    expect(scroll).not.toHaveBeenCalled();
    await userEvent.click(within(decision()).getByRole('button', { name: 'Am verificat paginile' }));
    await expectLocation(at(11, '32'));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect(scroll.mock.contexts.at(-1)).toBe(openRow());
  });

  it('does not move the page later for a row opened on a computer, when the screen turns narrow', async () => {
    const scroll = stubScroll();
    // A tablet turned from landscape to portrait: the media queries change.
    let width = 1024;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return (query === '(max-width: 56.25rem)' && width <= 900) || (query === '(max-width: 48rem)' && width <= 768);
      },
      media: query,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }));
    renderAdmin(paperAt(11, '32', 'all'), apiWith(), <LocationProbe />);
    expect(await screen.findByText('Ana Pop · 3/3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' }));
    await expectLocation(at(11, '31', 'all'));
    await pause(50);
    width = 820;
    act(() => {
      for (const listener of listeners) listener();
    });
    // The paper is now in the open row, and the page stays where it was.
    await waitFor(() => expect(openRow().nextElementSibling).toHaveClass('item-photo'));
    expect(scroll).not.toHaveBeenCalled();
  });

  it('does not move the page when the hidden paper shows again in the open row', async () => {
    const scroll = stubScroll();
    screenOf(375);
    renderAdmin(paperAt(11, '32', 'all'), apiWith(), <LocationProbe />);
    expect(await screen.findByText('Ana Pop · 3/3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ascunde lucrarea' }));
    // With the paper hidden she opens another row by a click on it.
    await userEvent.click(screen.getByRole('rowheader', { name: /^I\.1\b/ }));
    await expectLocation(at(11, '31', 'all'));
    await pause(50);
    expect(scroll).not.toHaveBeenCalled();
    // Later "Lucrarea" shows the paper again, in that row: the page stays.
    await userEvent.click(screen.getByRole('button', { name: 'Lucrarea' }));
    await waitFor(() => expect(openRow().querySelector('td.inline-photo-cell')).not.toBeNull());
    await pause(50);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('does not move the page on a computer, where the paper stays beside the exercises', async () => {
    const scroll = stubScroll();
    renderAdmin(paperAt(11, '32', 'all'), apiWith(), <LocationProbe />);
    expect(await screen.findByText('Ana Pop · 3/3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Arată pe lucrare Subiectul I, ex. 1' }));
    await expectLocation(at(11, '31', 'all'));
    expect(scroll).not.toHaveBeenCalled();
  });
});

describe('the paper taller than its box', () => {
  it('scrolls the box to the answer on the page shown, and to the next part on its page', async () => {
    const restore = tallPhotoBox();
    renderAdmin(ION_I3, apiWith(framed()));
    expect(await screen.findByText('Ion Popa · 1/2')).toBeInTheDocument();
    const box = document.querySelector('.zoom-scroll')!;
    // The first part (page 1, 30%–40%): its middle, 100 + 0,35 × 1500, in the middle of the box.
    await waitFor(() => expect(box.scrollTop).toBeCloseTo(100 + 0.35 * 1500 - 500));
    await userEvent.click(screen.getByRole('button', { name: 'Partea următoare' }));
    expect(await screen.findByText('Ion Popa · 2/2')).toBeInTheDocument();
    // The second part (page 2, 50%–80%).
    await waitFor(() => expect(document.querySelector('.zoom-scroll')!.scrollTop).toBeCloseTo(100 + 0.65 * 1500 - 500));
    restore();
  });

  it('brings the answer back to the middle when the box or the page changes size', async () => {
    // jsdom has no ResizeObserver: this one keeps what the page watches.
    const watchers: (() => void)[] = [];
    const watched: Element[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          watchers.push(callback);
        }
        observe(element: Element) {
          watched.push(element);
        }
        disconnect() {}
      },
    );
    const restore = tallPhotoBox();
    renderAdmin(ION_I3, apiWith(framed()));
    expect(await screen.findByText('Ion Popa · 1/2')).toBeInTheDocument();
    const box = document.querySelector('.zoom-scroll')!;
    await waitFor(() => expect(box.scrollTop).toBeCloseTo(100 + 0.35 * 1500 - 500));
    expect(watched).toContain(box);
    expect(watched).toContain(screen.getByTestId('zoom-pane'));
    // The box was not yet taller than the screen when the answer opened (no
    // width of her own yet), so it stayed at the top; then she drags the
    // paper wider and the box grows.
    box.scrollTop = 0;
    act(() => {
      for (const watcher of watchers) watcher();
    });
    expect(box.scrollTop).toBeCloseTo(100 + 0.35 * 1500 - 500);
    restore();
  });

  it('leaves the box where it is when the border is turned off and on', async () => {
    const restore = tallPhotoBox();
    renderAdmin(ION_I3, apiWith(framed()));
    expect(await screen.findByText('Ion Popa · 1/2')).toBeInTheDocument();
    const box = document.querySelector('.zoom-scroll')!;
    await waitFor(() => expect(box.scrollTop).toBeCloseTo(100 + 0.35 * 1500 - 500));
    // She scrolls the page in its box, then hides and shows the border.
    box.scrollTop = 300;
    await userEvent.click(screen.getByRole('button', { name: 'Arată chenarul' }));
    expect(box.scrollTop).toBe(300);
    await userEvent.click(screen.getByRole('button', { name: 'Arată chenarul' }));
    expect(box.scrollTop).toBe(300);
    restore();
  });

  it('steps to a part on the same page without moving the box while the part is in sight', async () => {
    const restore = tallPhotoBox();
    const first = { page: 1, x0: 0.1, y0: 0.3, x1: 0.9, y1: 0.4 };
    const inSight = { page: 1, x0: 0.1, y0: 0.5, x1: 0.9, y1: 0.6 };
    const below = { page: 1, x0: 0.1, y0: 0.9, x1: 0.9, y1: 0.95 };
    renderAdmin(ION_I3, apiWith(framed([first, inSight, below])));
    expect(await screen.findByText('Ion Popa · 1/2')).toBeInTheDocument();
    const box = document.querySelector('.zoom-scroll')!;
    // The first part in the middle: the box shows 125–1125 of the page's 100–1600.
    await waitFor(() => expect(box.scrollTop).toBeCloseTo(100 + 0.35 * 1500 - 500));
    // The second part (850–1000) is already in sight: the box stays.
    await userEvent.click(screen.getByRole('button', { name: 'Partea următoare' }));
    expect(screen.getByText('I.3 · partea 2 din 3')).toBeInTheDocument();
    expect(box.scrollTop).toBeCloseTo(100 + 0.35 * 1500 - 500);
    // The third (1450–1525) is below the box: it comes to the middle.
    await userEvent.click(screen.getByRole('button', { name: 'Partea următoare' }));
    expect(screen.getByText('I.3 · partea 3 din 3')).toBeInTheDocument();
    expect(box.scrollTop).toBeCloseTo(100 + 0.925 * 1500 - 500);
    restore();
  });

  it('ignores the first size the browser reports, and places the page again only for a new size', async () => {
    // A ResizeObserver as a browser has it: every report carries the sizes.
    type Report = (entries: { target: Element; contentRect: { width: number; height: number } }[]) => void;
    const watchers: Report[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: Report) {
          watchers.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
    const restore = tallPhotoBox();
    renderAdmin(ION_I3, apiWith(framed()));
    expect(await screen.findByText('Ion Popa · 1/2')).toBeInTheDocument();
    const box = document.querySelector('.zoom-scroll')!;
    await waitFor(() => expect(box.scrollTop).toBeCloseTo(100 + 0.35 * 1500 - 500));
    const report = (height: number) =>
      act(() => {
        for (const watcher of watchers) watcher([{ target: box, contentRect: { width: 500, height } }]);
      });
    // She scrolls; the browser then reports the size the watch started with.
    box.scrollTop = 0;
    report(1000);
    expect(box.scrollTop).toBe(0);
    // The same size again changes nothing; a new size places the page again.
    report(1000);
    expect(box.scrollTop).toBe(0);
    report(1200);
    expect(box.scrollTop).toBeCloseTo(100 + 0.35 * 1500 - 500);
    restore();
  });

  it('goes back to the top of a page that holds none of the answer', async () => {
    const restore = tallPhotoBox();
    renderAdmin(ION_I3, apiWith(framed([TOP])));
    expect(await screen.findByText('Ion Popa · 1/2')).toBeInTheDocument();
    const box = document.querySelector('.zoom-scroll')!;
    await waitFor(() => expect(box.scrollTop).toBeCloseTo(100 + 0.35 * 1500 - 500));
    await userEvent.click(screen.getByRole('button', { name: 'Pagina 2' }));
    expect(await screen.findByText('Ion Popa · 2/2')).toBeInTheDocument();
    expect(document.querySelector('.zoom-scroll')!.scrollTop).toBe(0);
    restore();
  });
});
