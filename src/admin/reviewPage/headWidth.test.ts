import { describe, expect, it } from 'vitest';
import { headWidth } from './ReviewPhoto.tsx';

describe('headWidth', () => {
  it('counts the name, the zoom, and each part the header holds', () => {
    const bare = headWidth({ view: false, pages: 1, hide: false });
    expect(bare).toBe(24.25);
    // One page has no page buttons.
    expect(headWidth({ view: false, pages: 1, hide: true })).toBe(bare + 2.75);
    expect(headWidth({ view: true, pages: 1, hide: false })).toBe(bare + 2.75);
    expect(headWidth({ view: false, pages: 6, hide: false })).toBe(bare + 6 * 2.25 + 0.75);
  });
});
