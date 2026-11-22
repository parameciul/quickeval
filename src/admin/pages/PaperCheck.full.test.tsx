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

  it('puts the buttons above the page and the hint under it, also with a mouse', async () => {
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    const pane = screen.getByTestId('zoom-pane');
    // With a mouse the buttons float over the page.
    expect(within(pane).getByRole('button', { name: 'Mărește' })).toBeInTheDocument();
    await userEvent.click(fullButton());
    const scroller = pane.parentElement!;
    expect(scroller).toHaveClass('zoom-scroll');
    expect(within(pane).queryByRole('button')).not.toBeInTheDocument();
    const bar = scroller.previousElementSibling!;
    expect(bar).toHaveClass('zoom-bar');
    expect(bar).toContainElement(screen.getByRole('button', { name: 'Arată chenarul' }));
    expect(bar).toContainElement(fullButton());
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

  it('has no button on a PDF page, which has no zoom', async () => {
    renderAdmin(`${PAGE}?paper=11&item=pages`, apiWith());
    await screen.findByText('Ana Pop · 2/3');
    await userEvent.keyboard('3');
    expect(screen.queryByRole('button', { name: 'Pe tot ecranul' })).not.toBeInTheDocument();
  });
});
