import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawnAreas, saveFrames, savedFrames } from './areas.ts';

const photo = (id: number) => ({ id, name: `${id}.jpg`, contentType: 'image/jpeg', size: 1000, position: id });
const pdf = (id: number) => ({ id, name: `${id}.pdf`, contentType: 'application/pdf', size: 1000, position: id });
const area = (page: number) => ({ page, x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.5 });

describe('the areas the review draws', () => {
  it('keeps the areas on the photo pages of the paper, in page order', () => {
    expect(drawnAreas([area(3), area(1), area(2), area(4)], [photo(1), pdf(2), photo(3)])).toEqual([area(1), area(3)]);
    expect(drawnAreas([area(2)], [photo(1)])).toEqual([]);
  });
});

describe('"Arată chenarul"', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is on until the teacher turns it off, and remembers her choice', () => {
    expect(savedFrames()).toBe(true);
    saveFrames(false);
    expect(savedFrames()).toBe(false);
    saveFrames(true);
    expect(savedFrames()).toBe(true);
  });

  it('stays on when the browser blocks its storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveFrames(false)).not.toThrow();
    expect(savedFrames()).toBe(true);
  });
});
