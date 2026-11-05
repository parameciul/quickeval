import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import favicon from '../../public/favicon.svg?raw';
import { BrandMark } from './BrandMark.tsx';

const ARCS = ['M35.74 14.39A18 18 0 0 1 49.12 37.56', 'M45.38 44.04A18 18 0 0 1 18.62 44.04', 'M14.88 37.56A18 18 0 0 1 28.26 14.39'];

describe('BrandMark', () => {
  it('draws the three arcs, two in the first colour and one in the second', () => {
    const { container } = render(<BrandMark />);
    const paths = Array.from(container.querySelectorAll('path'));
    expect(paths.map((path) => path.getAttribute('d'))).toEqual(ARCS);
    expect(paths.map((path) => path.getAttribute('stroke'))).toEqual(['var(--mk-a)', 'var(--mk-a)', 'var(--mk-b)']);
  });

  it('is flat and hidden from screen readers', () => {
    const { container } = render(<BrandMark />);
    expect(container.querySelector('linearGradient')).toBeNull();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('is the mark of the favicon too', () => {
    for (const arc of ARCS) expect(favicon).toContain(arc);
    expect(favicon).not.toContain('Gradient');
  });
});
