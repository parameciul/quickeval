import { describe, expect, it } from 'vitest';
import { boxInPane, clampView, layerTransform, MAX_SCALE, panBy, pinchScale, WHOLE_PAGE, zoomAround, zoomInAt, zoomOutAt, ZOOM_STEP } from './zoom.ts';

describe('the zoom of a page', () => {
  it('takes one small step in on the point clicked', () => {
    expect(zoomInAt(WHOLE_PAGE, 0.5, 0.5)).toEqual({ scale: ZOOM_STEP, cx: 0.5, cy: 0.5 });
    // A step of its own, from any zoom: a quarter more each time.
    expect(zoomInAt({ scale: 2, cx: 0.5, cy: 0.5 }, 0.3, 0.6).scale).toBeCloseTo(2.5);
    expect(ZOOM_STEP).toBeCloseTo(1.25);
  });

  it('takes the same step out on a right click, and stops at the whole page', () => {
    expect(zoomOutAt({ scale: ZOOM_STEP * ZOOM_STEP, cx: 0.5, cy: 0.5 }, 0.5, 0.5).scale).toBeCloseTo(ZOOM_STEP);
    expect(zoomOutAt({ scale: MAX_SCALE, cx: 0.5, cy: 0.5 }, 0.5, 0.5).scale).toBeCloseTo(MAX_SCALE / ZOOM_STEP);
    // Nothing to take away from the whole page.
    expect(zoomOutAt(WHOLE_PAGE, 0.2, 0.8)).toEqual(WHOLE_PAGE);
  });

  it('keeps the page over the whole pane near its edges', () => {
    expect(clampView({ scale: 2, cx: 0.1, cy: 0.9 })).toEqual({ scale: 2, cx: 0.25, cy: 0.75 });
    expect(clampView({ scale: 0.5, cx: 0.1, cy: 0.9 })).toEqual(WHOLE_PAGE);
    // A click on the page's corner stops at the edge instead of showing the
    // pane's background beside it.
    expect(zoomInAt(WHOLE_PAGE, 0, 1)).toEqual({ scale: ZOOM_STEP, cx: 0.4, cy: 0.6 });
    expect(clampView({ scale: 20, cx: 0.5, cy: 0.5 }).scale).toBe(MAX_SCALE);
  });

  it('keeps the point under the pointer where it is', () => {
    const view = zoomAround(WHOLE_PAGE, 2, 0.3, 0.6);
    expect(view.scale).toBe(2);
    expect(view.cx + (0.3 - 0.5) / view.scale).toBeCloseTo(0.3);
    expect(view.cy + (0.6 - 0.5) / view.scale).toBeCloseTo(0.6);
  });

  it('zooms a trackpad pinch a little per pixel', () => {
    expect(pinchScale(1, -50)).toBeCloseTo(Math.exp(0.5));
    expect(pinchScale(2, 100)).toBeLessThan(2);
    expect(zoomAround(WHOLE_PAGE, pinchScale(1, 100), 0.5, 0.5)).toEqual(WHOLE_PAGE);
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

describe('the border of an answer', () => {
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
