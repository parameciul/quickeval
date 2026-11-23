import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { PAGE, apiWith, layer, sizedPane, clickAt, WHOLE, framed, frame, ION_I3, onPhone } from './paperCheckTestKit.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const box = () => document.querySelector<HTMLElement>('figure.review-photo')!;
const fullButton = () => screen.getByRole('button', { name: 'Pe tot ecranul' });

describe('the paper over the whole screen', () => {
  it('opens with "Pe tot ecranul" and closes with the button again, the × or Esc', async () => {
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    expect(box()).not.toHaveClass('is-full');
    expect(fullButton()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Ascunde lucrarea' })).toBeInTheDocument();

    await userEvent.click(fullButton());
    expect(box()).toHaveClass('is-full');
    expect(fullButton()).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement).toHaveClass('has-full-paper');
    // One × only: it leaves the whole screen, it does not hide the paper.
    expect(screen.queryByRole('button', { name: 'Ascunde lucrarea' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ieși din ecranul complet' }));
    expect(box()).not.toHaveClass('is-full');
    expect(document.documentElement).not.toHaveClass('has-full-paper');
    // The focus is not lost on the × that went away.
    expect(fullButton()).toHaveFocus();

    await userEvent.click(fullButton());
    await userEvent.click(fullButton());
    expect(box()).not.toHaveClass('is-full');

    await userEvent.click(fullButton());
    await userEvent.keyboard('{Escape}');
    expect(box()).not.toHaveClass('is-full');
    expect(fullButton()).toHaveFocus();
  });

  it('closes with one Esc and keeps the zoom; the next Esc shows the whole page', async () => {
    renderAdmin(`${PAGE}?paper=14&item=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    clickAt(sizedPane(), 200, 200);
    const zoomed = 'translate(-12.5%, -12.5%) scale(1.25)';
    expect(layer().style.transform).toBe(zoomed);
    await userEvent.click(fullButton());
    expect(box()).toHaveClass('is-full');
    // The same page, zoomed as before.
    expect(layer().style.transform).toBe(zoomed);
    await userEvent.keyboard('{Escape}');
    expect(box()).not.toHaveClass('is-full');
    expect(layer().style.transform).toBe(zoomed);
    await userEvent.keyboard('{Escape}');
    expect(layer().style.transform).toBe(WHOLE);
  });

  it('keeps the same pane, so its zoom and its pinch go on working', async () => {
    renderAdmin(`${PAGE}?paper=14&item=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    const first = screen.getByTestId('zoom-pane');
    await userEvent.click(fullButton());
    expect(screen.getByTestId('zoom-pane')).toBe(first);
    clickAt(sizedPane(), 200, 200);
    expect(layer().style.transform).not.toBe(WHOLE);
  });

  it('puts the buttons in the header, the × in its middle, and the hint under the page, also with a mouse', async () => {
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    const pane = screen.getByTestId('zoom-pane');
    // With a mouse, in a box with no measured room, the buttons float over the
    // page, hung from the header, not inside the page that scrolls.
    const float = box().querySelector<HTMLElement>('.review-photo-float')!;
    expect(float).toContainElement(screen.getByRole('button', { name: 'Mărește' }));
    expect(pane).not.toContainElement(screen.getByRole('button', { name: 'Mărește' }));
    await userEvent.click(fullButton());
    const scroller = pane.parentElement!;
    expect(scroller).toHaveClass('zoom-scroll');
    expect(within(pane).queryByRole('button')).not.toBeInTheDocument();
    expect(document.querySelector('.zoom-bar')).toBeNull();
    // One header: the name and the view on the left, the × in the middle,
    // the zoom and the pages on the right.
    const head = box().querySelector<HTMLElement>('.review-photo-top')!;
    const [start, middle, end] = [...head.children] as HTMLElement[];
    expect(start).toContainElement(screen.getByText('Ion Popa · 1/2'));
    expect(start).toContainElement(screen.getByRole('button', { name: 'Arată chenarul' }));
    expect(middle).toBe(screen.getByRole('button', { name: 'Ieși din ecranul complet' }));
    expect(end).toContainElement(fullButton());
    expect(end).toContainElement(screen.getByRole('group', { name: 'Paginile lucrării' }));
    // Its buttons work there.
    await userEvent.click(screen.getByRole('button', { name: 'Mărește' }));
    expect(layer().style.transform).not.toBe(WHOLE);
    await userEvent.click(screen.getByRole('button', { name: 'Micșorează' }));
    expect(layer().style.transform).toBe(WHOLE);
    // The hint is the mouse's, and the parts' arrows stand under the page,
    // where they stay in sight while the page scrolls.
    const foot = scroller.nextElementSibling!;
    expect(foot).toHaveClass('zoom-foot');
    expect(foot).toContainElement(screen.getByText('Clic stânga: mărește · clic dreapta: micșorează'));
    const parts = within(foot as HTMLElement).getByRole('group', { name: 'Părțile răspunsului' });
    expect(within(frame()).queryByRole('button', { name: 'Partea următoare' })).not.toBeInTheDocument();
    await userEvent.click(within(parts).getByRole('button', { name: 'Partea următoare' }));
    expect(screen.getByText('Ion Popa · 2/2')).toBeInTheDocument();
    // Another page of the same paper stays over the whole screen.
    expect(box()).toHaveClass('is-full');
  });

  it('has the button in the bar above the page on a phone', async () => {
    onPhone();
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    const bar = document.querySelector('.zoom-bar')!;
    expect(bar).toContainElement(fullButton());
    await userEvent.click(fullButton());
    expect(box()).toHaveClass('is-full');
    expect(screen.getByText('Atinge: mărește · ciupește: micșorează')).toBeInTheDocument();
  });

  it("holds the paper's place in the page while it is over the whole screen", async () => {
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const height = this.classList.contains('review-photo') ? 640 : 0;
      return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: height, width: 0, height, toJSON: () => ({}) } as DOMRect;
    });
    await userEvent.click(fullButton());
    const spacer = box().previousElementSibling as HTMLElement;
    expect(spacer).toHaveClass('review-photo-spacer');
    expect(spacer.style.height).toBe('640px');
    await userEvent.keyboard('{Escape}');
    expect(document.querySelector('.review-photo-spacer')).toBeNull();
  });

  it('brings the answer to the middle of the screen as it opens there', async () => {
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    // jsdom draws nothing: the page in its scroller is 1500px high, 100px under
    // the scroller's top, which is 1000px high.
    const scrolled = new WeakMap<Element, number>();
    const scroller = (element: Element) => element.classList.contains('zoom-scroll');
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return scroller(this) ? 2000 : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return scroller(this) ? 1000 : 0;
    });
    vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(function (this: Element) {
      return scrolled.get(this) ?? 0;
    });
    vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(function (this: Element, value: number) {
      scrolled.set(this, value);
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const pane = this.classList.contains('zoom-pane');
      const top = pane ? 100 : 0;
      const height = pane ? 1500 : 0;
      return { x: 0, y: top, top, left: 0, right: 0, bottom: top + height, width: 0, height, toJSON: () => ({}) } as DOMRect;
    });
    await userEvent.click(fullButton());
    // The answer (30% to 40% of the page) is 550px to 700px down: its middle,
    // 625px, comes to the middle of the scroller.
    await waitFor(() => expect(document.querySelector('.zoom-scroll')!.scrollTop).toBe(125));
  });

  it('leaves A, J and K alone over the whole screen, and keeps the page keys', async () => {
    const api = apiWith();
    renderAdmin(`${PAGE}?paper=11&item=pages`, api);
    await screen.findByText('Ana Pop · 2/3');
    await userEvent.click(fullButton());
    // The decision is under the whole screen, out of sight: A accepts nothing.
    await userEvent.keyboard('a');
    expect(api.reviewPages).not.toHaveBeenCalled();
    await userEvent.keyboard('j');
    await userEvent.keyboard('k');
    expect(screen.getByText('Ana Pop · 2/3')).toBeInTheDocument();
    expect(box()).toHaveClass('is-full');
    await userEvent.keyboard('1');
    expect(screen.getByText('Ana Pop · 1/3')).toBeInTheDocument();
    expect(box()).toHaveClass('is-full');
    // Back from the whole screen, A works again.
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('a');
    expect(api.reviewPages).toHaveBeenCalled();
  });

  it('keeps Tab among its own controls, never on the hidden buttons under it', async () => {
    renderAdmin(`${PAGE}?paper=11&item=pages`, apiWith());
    await screen.findByText('Ana Pop · 2/3');
    await userEvent.click(fullButton());
    const own = [...box().querySelectorAll<HTMLElement>('button:not([disabled])')];
    expect(own.length).toBeGreaterThan(2);
    own[own.length - 1]!.focus();
    await userEvent.tab();
    expect(own[0]).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(own[own.length - 1]).toHaveFocus();
    // A focus left outside the box comes back into it.
    (document.activeElement as HTMLElement).blur();
    await userEvent.tab();
    expect(box()).toContainElement(document.activeElement as HTMLElement);
  });

  it('stays over the whole screen when a phone turned sideways moves the paper beside the exercises', async () => {
    // A big phone: under 900px wide upright, over it sideways.
    let upright = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return query === '(pointer: coarse)' || (query === '(max-width: 56.25rem)' && upright);
      },
      media: query,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }));
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    expect(box().closest('.inline-photo')).not.toBeNull();
    await userEvent.click(fullButton());
    const before = box();
    act(() => {
      upright = false;
      listeners.forEach((listener) => listener());
    });
    // Another box, beside the exercises, and still over the whole screen.
    expect(box()).not.toBe(before);
    expect(box().closest('.inline-photo')).toBeNull();
    expect(box()).toHaveClass('is-full');
    expect(document.documentElement).toHaveClass('has-full-paper');
    expect(fullButton()).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(box()).not.toHaveClass('is-full');
    expect(document.documentElement).not.toHaveClass('has-full-paper');
  });

  it('closes when the page turns to a PDF, whose own viewer would keep Esc', async () => {
    renderAdmin(`${PAGE}?paper=11&item=pages`, apiWith());
    await screen.findByText('Ana Pop · 2/3');
    await userEvent.click(fullButton());
    await userEvent.keyboard('3');
    expect(screen.getByText('Ana Pop · 3/3')).toBeInTheDocument();
    expect(box()).not.toHaveClass('is-full');
    expect(document.documentElement).not.toHaveClass('has-full-paper');
    // Back on a photo, it stays closed.
    await userEvent.keyboard('1');
    expect(box()).not.toHaveClass('is-full');
  });

  it('leaves Ctrl+A and the other shortcuts with a modifier to the browser', async () => {
    renderAdmin(`${PAGE}?paper=11&item=pages`, apiWith());
    await screen.findByText('Ana Pop · 2/3');
    await userEvent.click(fullButton());
    expect(fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(document.body, { key: 'k', metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(document.body, { key: 'a' })).toBe(false);
  });

  it('brings Shift+Tab from outside the box to its last control', async () => {
    renderAdmin(`${PAGE}?paper=11&item=pages`, apiWith());
    await screen.findByText('Ana Pop · 2/3');
    await userEvent.click(fullButton());
    const own = [...box().querySelectorAll<HTMLElement>('button:not([disabled])')];
    (document.activeElement as HTMLElement).blur();
    await userEvent.tab({ shift: true });
    expect(own[own.length - 1]).toHaveFocus();
  });

  it('turns the pages with the arrows beside the page and with ← and →', async () => {
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    // Not beside the exercises: only over the whole screen.
    expect(screen.queryByRole('button', { name: 'Pagina următoare' })).not.toBeInTheDocument();
    await userEvent.click(fullButton());
    const previous = screen.getByRole('button', { name: 'Pagina anterioară' });
    const next = screen.getByRole('button', { name: 'Pagina următoare' });
    // Out of the page: a click on one never zooms it.
    expect(screen.getByTestId('zoom-pane')).not.toContainElement(next);
    expect(previous).toBeDisabled();
    await userEvent.click(next);
    expect(screen.getByText('Ion Popa · 2/2')).toBeInTheDocument();
    expect(layer().style.transform).toBe(WHOLE);
    expect(screen.getByRole('button', { name: 'Pagina următoare' })).toBeDisabled();
    expect(box()).toHaveClass('is-full');
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByText('Ion Popa · 1/2')).toBeInTheDocument();
    // Past the first page, nothing.
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByText('Ion Popa · 1/2')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('Ion Popa · 2/2')).toBeInTheDocument();
    expect(box()).toHaveClass('is-full');
  });

  it('has no page arrows for a paper of one page', async () => {
    renderAdmin(`${PAGE}?paper=14&item=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    await userEvent.click(fullButton());
    expect(screen.queryByRole('button', { name: 'Pagina următoare' })).not.toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('Ion Popa · 1/1')).toBeInTheDocument();
  });

  it('closes when the arrow turns to a PDF page', async () => {
    renderAdmin(`${PAGE}?paper=11&item=pages`, apiWith());
    await screen.findByText('Ana Pop · 2/3');
    await userEvent.click(fullButton());
    await userEvent.click(screen.getByRole('button', { name: 'Pagina următoare' }));
    expect(screen.getByText('Ana Pop · 3/3')).toBeInTheDocument();
    expect(box()).not.toHaveClass('is-full');
  });

  it('puts the view and the zoom in a bar under the header on a phone', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-width: 40rem)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    await userEvent.click(fullButton());
    const head = box().querySelector<HTMLElement>('.review-photo-top')!;
    const bar = box().querySelector<HTMLElement>('.zoom-bar')!;
    expect(bar).toContainElement(screen.getByRole('button', { name: 'Mărește' }));
    expect(bar).toContainElement(screen.getByRole('button', { name: 'Arată chenarul' }));
    expect(head).not.toContainElement(screen.getByRole('button', { name: 'Mărește' }));
    // The header keeps the name, the × and the pages.
    expect(head).toContainElement(screen.getByRole('button', { name: 'Ieși din ecranul complet' }));
    expect(head).toContainElement(screen.getByRole('group', { name: 'Paginile lucrării' }));
    expect(fullButton()).toHaveFocus();
  });

  it('moves the focus to the other arrow when one reaches the last or the first page', async () => {
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    await userEvent.click(fullButton());
    await userEvent.click(screen.getByRole('button', { name: 'Pagina următoare' }));
    expect(screen.getByText('Ion Popa · 2/2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagina anterioară' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Pagina anterioară' }));
    expect(screen.getByRole('button', { name: 'Pagina următoare' })).toHaveFocus();
  });

  it("gives the focus to the page's button when an arrow turns to a PDF page", async () => {
    renderAdmin(`${PAGE}?paper=11&item=pages`, apiWith());
    await screen.findByText('Ana Pop · 2/3');
    await userEvent.click(fullButton());
    await userEvent.click(screen.getByRole('button', { name: 'Pagina următoare' }));
    expect(box()).not.toHaveClass('is-full');
    expect(screen.getByRole('button', { name: 'Pagina 3' })).toHaveFocus();
  });

  it('keeps the focus on its button when it closes into a box whose buttons float', async () => {
    // A box 30rem wide beside the exercises, the screen 90rem over the whole
    // screen; the browser reports each size after the render.
    const watchers = new Set<() => void>();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        report: () => void;
        constructor(report: () => void) {
          this.report = report;
        }
        observe() {
          watchers.add(this.report);
        }
        disconnect() {
          watchers.delete(this.report);
        }
      },
    );
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('review-photo') ? (this.classList.contains('is-full') ? 90 : 30) * 16 : 0;
    });
    const report = () => act(() => [...watchers].forEach((watch) => watch()));
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    report();
    expect(box().querySelector('.review-photo-float')).toContainElement(fullButton());
    await userEvent.click(fullButton());
    report();
    await userEvent.keyboard('{Escape}');
    report();
    expect(box()).not.toHaveClass('is-full');
    expect(box().querySelector('.review-photo-float')).toContainElement(fullButton());
    expect(fullButton()).toHaveFocus();
  });

  it('has no button on a PDF page, which has no zoom', async () => {
    renderAdmin(`${PAGE}?paper=11&item=pages`, apiWith());
    await screen.findByText('Ana Pop · 2/3');
    await userEvent.keyboard('3');
    expect(screen.queryByRole('button', { name: 'Pe tot ecranul' })).not.toBeInTheDocument();
  });
});

describe('the header of the paper beside the exercises', () => {
  // The box laid out `rem` wide (jsdom lays out nothing).
  const boxWide = (rem: number) => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('review-photo') ? rem * 16 : 0;
    });
  };

  it('holds the view and the zoom when its one line has the room', async () => {
    boxWide(60);
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    const head = box().querySelector<HTMLElement>('.review-photo-top')!;
    expect(head).toHaveClass('has-tools');
    expect(head).toContainElement(screen.getByRole('button', { name: 'Arată chenarul' }));
    expect(head).toContainElement(screen.getByRole('button', { name: 'Mărește' }));
    expect(head).toContainElement(fullButton());
    expect(within(screen.getByTestId('zoom-pane')).queryByRole('group', { name: 'Mărirea paginii' })).not.toBeInTheDocument();
    expect(within(screen.getByTestId('zoom-pane')).queryByRole('group', { name: 'Vederea paginii' })).not.toBeInTheDocument();
    // The hint still floats over the whole page, with a mouse.
    expect(screen.getByTestId('zoom-pane')).toContainElement(screen.getByText('Clic stânga: mărește · clic dreapta: micșorează'));
    await userEvent.click(screen.getByRole('button', { name: 'Mărește' }));
    expect(layer().style.transform).not.toBe(WHOLE);
  });

  it('leaves them over the page when it is too narrow, never on a second line', async () => {
    boxWide(30);
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    const head = box().querySelector<HTMLElement>('.review-photo-top')!;
    expect(head).not.toHaveClass('has-tools');
    // Over the page's corners, hung from the header (which stays at the top of
    // the box), so they never scroll away with the page.
    const float = head.querySelector<HTMLElement>('.review-photo-float')!;
    expect(float).toContainElement(screen.getByRole('button', { name: 'Mărește' }));
    expect(float).toContainElement(screen.getByRole('button', { name: 'Arată chenarul' }));
    expect(screen.getByTestId('zoom-pane')).not.toContainElement(screen.getByRole('button', { name: 'Mărește' }));
    expect(document.querySelector('.zoom-bar')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Mărește' }));
    expect(layer().style.transform).not.toBe(WHOLE);
  });
});
