import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawQr } from './qr.ts';

const svgOf = () => document.createElementNS('http://www.w3.org/2000/svg', 'svg');

afterEach(() => {
  vi.doUnmock('uqr');
  vi.resetModules();
});

describe('drawQr', () => {
  it('draws a white ground and one path of cells, with no style attribute', async () => {
    const svg = svgOf();
    await drawQr(svg, 'https://mqgrader.ro/try/abc/telefon');
    expect(svg.querySelectorAll('rect')).toHaveLength(1);
    expect(svg.querySelector('rect')!.getAttribute('fill')).toBe('#ffffff');
    expect(svg.querySelectorAll('path')).toHaveLength(1);
    expect(svg.querySelector('path')!.getAttribute('d')).toMatch(/^M\d+ \d+h1v1h-1z/);
    expect(svg.querySelector('[style]')).toBeNull();
    expect(svg.hasAttribute('style')).toBe(false);
  });

  it('sets a square viewBox', async () => {
    const svg = svgOf();
    await drawQr(svg, 'https://mqgrader.ro/try/abc/telefon');
    const [x, y, width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    expect([x, y]).toEqual([0, 0]);
    expect(width).toBe(height);
    expect(width).toBeGreaterThan(21);
  });

  it('draws anew over an earlier code', async () => {
    const svg = svgOf();
    await drawQr(svg, 'a');
    await drawQr(svg, 'b');
    expect(svg.children).toHaveLength(2);
  });

  it('rejects when the library cannot load', async () => {
    vi.resetModules();
    vi.doMock('uqr', () => {
      throw new Error('offline');
    });
    const { drawQr: draw } = await import('./qr.ts');
    await expect(draw(svgOf(), 'x')).rejects.toThrow();
  });
});
