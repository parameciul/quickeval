import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { submissionFileUrl } from '../api.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { PAGE, papers, apiWith, decision, pane, layer, sizedPane, clickAt, WHOLE, TOP, framed, frame, ION_I3, onPhone } from './paperCheckTestKit.tsx';

afterEach(() => vi.unstubAllGlobals());

describe('the zoom of a page', () => {
  it('zooms in one small step where the photo is clicked, and out as much with a right click', async () => {
    renderAdmin(`${PAGE}?paper=14&item=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    const photo = sizedPane();
    expect(layer().style.transform).toBe(WHOLE);
    // No "Toată pagina" button: Esc or the zoom's − bring the whole page back,
    // and with no answer area there is no view group at all.
    expect(screen.queryByRole('button', { name: 'Toată pagina' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Vederea paginii' })).not.toBeInTheDocument();
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
    renderAdmin(`${PAGE}?paper=14&item=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    // A click on the page's top left corner: the page's edge stays at the pane's.
    clickAt(sizedPane(), 0, 0);
    expect(layer().style.transform).toBe('translate(0%, 0%) scale(1.25)');
  });

  it('says over the whole page what a click does, and leaves the page alone once it is zoomed', async () => {
    renderAdmin(`${PAGE}?paper=14&item=41`, apiWith());
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

  it('moves the zoomed page with a drag, and shows the whole page with Esc', async () => {
    renderAdmin(`${PAGE}?paper=14&item=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    const photo = sizedPane();
    clickAt(photo, 200, 200);
    fireEvent.pointerDown(photo, { pointerId: 1, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(photo, { pointerId: 1, button: 0, clientX: 240, clientY: 200 });
    fireEvent.pointerUp(photo, { pointerId: 1, button: 0, clientX: 240, clientY: 200 });
    expect(layer().style.transform).toBe('translate(-2.5%, -12.5%) scale(1.25)');

    await userEvent.keyboard('{Escape}');
    expect(layer().style.transform).toBe(WHOLE);
    expect(screen.getByRole('button', { name: 'Micșorează' })).toBeDisabled();
  });

  it('takes the same step with the buttons over the page, which stop at the ends', async () => {
    renderAdmin(`${PAGE}?paper=14&item=41`, apiWith());
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
    renderAdmin(`${PAGE}?paper=14&item=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    const photo = sizedPane();
    clickAt(photo, 200, 200);
    expect(fireEvent.contextMenu(photo)).toBe(false);
    expect(layer().style.transform).toBe('translate(-12.5%, -12.5%) scale(1.25)');
    await userEvent.keyboard('{Escape}');
    expect(layer().style.transform).toBe(WHOLE);
  });

  it('closes only the panel of the bar with Esc while the page is zoomed', async () => {
    renderAdmin(`${PAGE}?paper=14&item=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    clickAt(sizedPane(), 200, 200);
    await userEvent.click(await screen.findByRole('button', { name: /^De făcut/ }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Ce ai de făcut' })).not.toBeInTheDocument();
    expect(layer().style.transform).toBe('translate(-12.5%, -12.5%) scale(1.25)');
  });

  it('closes only the panel with Esc when the focus left the bar, and keeps the zoom', async () => {
    renderAdmin(`${PAGE}?paper=14&item=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    clickAt(sizedPane(), 200, 200);
    await userEvent.click(await screen.findByRole('button', { name: /^De făcut/ }));
    (document.activeElement as HTMLElement).blur();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Ce ai de făcut' })).not.toBeInTheDocument();
    expect(layer().style.transform).toBe('translate(-12.5%, -12.5%) scale(1.25)');
  });

  it('leaves the wheel to the page, which scrolls with it, and zooms a trackpad pinch', async () => {
    renderAdmin(`${PAGE}?paper=14&item=41`, apiWith());
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
    renderAdmin(`${PAGE}?paper=14&item=41`, apiWith());
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
    renderAdmin(`${PAGE}?paper=11&item=pages`, apiWith());
    await screen.findByText('Ana Pop · 2/3');
    clickAt(sizedPane(), 200, 200);
    expect(layer().style.transform).not.toBe(WHOLE);
    await userEvent.keyboard('1');
    await userEvent.keyboard('2');
    expect(screen.getByText('Ana Pop · 2/3')).toBeInTheDocument();
    expect(layer().style.transform).toBe(WHOLE);
  });

  it('gives a new page the usual shape until its photo loads', async () => {
    renderAdmin(`${PAGE}?paper=11&item=pages`, apiWith());
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
    renderAdmin(`${PAGE}?paper=11&item=pages`, apiWith());
    await screen.findByText('Ana Pop · 2/3');
    clickAt(sizedPane(), 200, 200);
    expect(layer().style.transform).not.toBe(WHOLE);
    await userEvent.keyboard('1');
    expect(screen.getByText('Ana Pop · 1/3')).toBeInTheDocument();
    expect(layer().style.transform).toBe(WHOLE);
    await userEvent.keyboard('3');
    expect(screen.queryByTestId('zoom-pane')).not.toBeInTheDocument();
    expect(screen.getByTitle('Pagina 3 a lucrării')).toHaveAttribute('src', submissionFileUrl(11, 103));
    expect(screen.queryByRole('button', { name: 'Mărește' })).not.toBeInTheDocument();
  });
});

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
    // The switch floats alone over the photo's top left; the
    // zoom stays alone on the top right.
    const view = screen.getByRole('group', { name: 'Vederea paginii' });
    expect(view).toContainElement(screen.getByRole('button', { name: 'Arată chenarul' }));
    expect(within(view).getAllByRole('button')).toHaveLength(1);
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

  it('puts the part controls in the line under the page on a phone, where a finger reaches them', async () => {
    onPhone();
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    const pane = screen.getByTestId('zoom-pane');
    const parts = screen.getByRole('group', { name: 'Părțile răspunsului' });
    // Not over the handwriting, and not beside the label, where the pane's
    // edge would cut them off.
    expect(pane).not.toContainElement(parts);
    expect(pane.nextElementSibling).toHaveClass('zoom-foot');
    expect(pane.nextElementSibling).toContainElement(parts);
    expect(within(parts).getByText('1 din 2')).toBeInTheDocument();
    expect(within(frame()).queryByRole('button', { name: 'Partea următoare' })).not.toBeInTheDocument();
    await userEvent.click(within(parts).getByRole('button', { name: 'Partea următoare' }));
    expect(screen.getByText('Ion Popa · 2/2')).toBeInTheDocument();
    const after = screen.getByRole('group', { name: 'Părțile răspunsului' });
    expect(within(after).getByText('2 din 2')).toBeInTheDocument();
    expect(within(after).getByRole('button', { name: 'Partea următoare' })).toBeDisabled();
  });

  it('puts the view and the zoom in a bar above the page on a phone, and the hint under it', async () => {
    onPhone();
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    const pane = screen.getByTestId('zoom-pane');
    const bar = pane.previousElementSibling!;
    expect(bar).toHaveClass('zoom-bar');
    expect(bar).toContainElement(screen.getByRole('group', { name: 'Vederea paginii' }));
    expect(bar).toContainElement(screen.getByRole('group', { name: 'Mărirea paginii' }));
    expect(within(pane).queryByRole('button')).not.toBeInTheDocument();
    const hint = screen.getByText('Atinge: mărește · ciupește: micșorează');
    expect(pane).not.toContainElement(hint);
    expect(pane.nextElementSibling).toContainElement(hint);
    // The bar's buttons still work, and the hint goes once the page is zoomed.
    await userEvent.click(screen.getByRole('button', { name: 'Mărește' }));
    expect(layer().style.transform).not.toBe(WHOLE);
    expect(screen.queryByText(/^Atinge/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Micșorează' }));
    expect(layer().style.transform).toBe(WHOLE);
  });

  it('leaves the line under the page out on a phone when it has nothing to say', async () => {
    onPhone();
    renderAdmin(`${PAGE}?paper=14&item=41`, apiWith());
    await screen.findByText('Ion Popa · 1/1');
    await userEvent.click(screen.getByRole('button', { name: 'Mărește' }));
    expect(document.querySelector('.zoom-foot')).toBeNull();
  });

  it('draws the border on a page picked by hand, on the whole page', async () => {
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · 1/2');
    await userEvent.click(screen.getByRole('button', { name: 'Pagina 2' }));
    expect(layer().style.transform).toBe(WHOLE);
    expect(within(frame()).getByText('I.3 · partea 2 din 2')).toBeInTheDocument();
  });

  it('puts the label below the border when there is no room above it', async () => {
    renderAdmin(`${PAGE}?paper=14&item=42`, apiWith(framed()));
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
    renderAdmin(`${PAGE}?paper=11&item=32`, apiWith(list));
    expect(await screen.findByText('Ana Pop · 3/3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arată chenarul' })).not.toBeInTheDocument();
    await userEvent.keyboard('1');
    expect(layer().style.transform).toBe(WHOLE);
    expect(screen.queryByTestId('answer-frame')).not.toBeInTheDocument();
  });
});
