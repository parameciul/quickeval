import { describe, expect, it } from 'vitest';
import { boxInPane, CLICK_SCALE, clampView, layerTransform, MAX_SCALE, panBy, viewOfBox, WHOLE_PAGE, wheelScale, zoomAround, zoomInAt } from './zoom.ts';

describe('the zoom of a page', () => {
  it('zooms in on the point clicked', () => {
    expect(zoomInAt(WHOLE_PAGE, 0.25, 0.375)).toEqual({ scale: CLICK_SCALE, cx: 0.25, cy: 0.375 });
  });

  it('keeps the page over the whole pane near its edges', () => {
    expect(zoomInAt(WHOLE_PAGE, 0, 1)).toEqual({ scale: CLICK_SCALE, cx: 0.2, cy: 0.8 });
    expect(clampView({ scale: 0.5, cx: 0.1, cy: 0.9 })).toEqual(WHOLE_PAGE);
    expect(clampView({ scale: 20, cx: 0.5, cy: 0.5 }).scale).toBe(MAX_SCALE);
  });

  it('keeps the point under the pointer where it is when the wheel zooms', () => {
    const view = zoomAround(WHOLE_PAGE, 2, 0.3, 0.6);
    expect(view.scale).toBe(2);
    expect(view.cx + (0.3 - 0.5) / view.scale).toBeCloseTo(0.3);
    expect(view.cy + (0.6 - 0.5) / view.scale).toBeCloseTo(0.6);
  });

  it('zooms in when the wheel turns up and out when it turns down, a little per pixel', () => {
    expect(wheelScale(2, -100)).toBeGreaterThan(2);
    expect(wheelScale(2, 100)).toBeLessThan(2);
    expect(wheelScale(2, -4)).toBeLessThan(2.02);
    expect(zoomAround(WHOLE_PAGE, wheelScale(1, 100), 0.5, 0.5)).toEqual(WHOLE_PAGE);
  });

  it('moves the zoomed page with the pointer', () => {
    expect(panBy({ scale: 2.5, cx: 0.5, cy: 0.5 }, 0.1, -0.05)).toEqual({ scale: 2.5, cx: 0.46, cy: 0.52 });
    expect(panBy({ scale: 2.5, cx: 0.5, cy: 0.5 }, -1, 0).cx).toBe(0.8);
  });

  it('turns a view into the transform of the page layer', () => {
    expect(layerTransform(WHOLE_PAGE)).toBe('translate(0%, 0%) scale(1)');
    expect(layerTransform({ scale: 2.5, cx: 0.25, cy: 0.375 })).toBe('translate(-12.5%, -43.75%) scale(2.5)');
  });
});

describe('the view of an answer', () => {
  it('shows a box in the middle of the pane, as big as fits', () => {
    const view = viewOfBox({ x0: 0.2, y0: 0.3, x1: 0.6, y1: 0.4 });
    expect(view.scale).toBeCloseTo(1.875);
    expect(view.cx).toBeCloseTo(0.4);
    expect(view.cy).toBeCloseTo(0.35);
    // A big box shows the whole page; a tiny one stops at the biggest zoom.
    expect(viewOfBox({ x0: 0.1, y0: 0.5, x1: 0.9, y1: 0.8 })).toEqual(WHOLE_PAGE);
    expect(viewOfBox({ x0: 0.5, y0: 0.5, x1: 0.51, y1: 0.505 }).scale).toBe(MAX_SCALE);
  });

  it('puts a box of the page where it is in the pane', () => {
    const whole = boxInPane(WHOLE_PAGE, { x0: 0.1, y0: 0.5, x1: 0.9, y1: 0.8 });
    expect([whole.x0, whole.y0, whole.x1, whole.y1].map((value) => Math.round(value * 1000) / 1000)).toEqual([0.1, 0.5, 0.9, 0.8]);
    const box = boxInPane({ scale: 1.875, cx: 0.4, cy: 0.35 }, { x0: 0.2, y0: 0.3, x1: 0.6, y1: 0.4 });
    expect(box.x0).toBeCloseTo(0.125);
    expect(box.y0).toBeCloseTo(0.40625);
    expect(box.x1).toBeCloseTo(0.875);
    expect(box.y1).toBeCloseTo(0.59375);
  });
});
