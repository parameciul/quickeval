import { describe, expect, it } from 'vitest';
import { CLICK_SCALE, clampView, layerTransform, MAX_SCALE, panBy, WHOLE_PAGE, wheelScale, zoomAround, zoomInAt } from './zoom.ts';

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
