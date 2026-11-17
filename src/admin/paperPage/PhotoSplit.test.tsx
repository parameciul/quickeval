import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MAX_SHARE, MIN_SHARE, PHOTO_WIDTH_KEY, PhotoSplit, savedPhotoShare, shareStyle } from './PhotoSplit.tsx';

// The bar between a 600px column of exercises (left 100) and the paper, in
// panes that end at 1100: 1000px for the two, less the 20px bar.
function Harness({ start = null, onShare }: { start?: number | null; onShare?: (share: number | null) => void }) {
  const panes = useRef<HTMLDivElement>(null);
  const [share, setShare] = useState<number | null>(start);
  return (
    <div ref={panes} data-testid="panes" style={shareStyle(share)}>
      <div className="paper-main" />
      <PhotoSplit
        panes={panes}
        share={share}
        onShare={(next) => {
          setShare(next);
          onShare?.(next);
        }}
      />
    </div>
  );
}

function layOut() {
  const box = (left: number, right: number) => ({ left, right, width: right - left, top: 0, bottom: 800, height: 800, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
  vi.spyOn(screen.getByTestId('panes'), 'getBoundingClientRect').mockReturnValue(box(0, 1100));
  vi.spyOn(document.querySelector<HTMLElement>('.paper-main')!, 'getBoundingClientRect').mockReturnValue(box(100, 700));
  vi.spyOn(screen.getByRole('separator'), 'getBoundingClientRect').mockReturnValue(box(700, 720));
}

describe('savedPhotoShare', () => {
  it('reads the saved width, and none when there is none', () => {
    expect(savedPhotoShare()).toBeNull();
    localStorage.setItem(PHOTO_WIDTH_KEY, '0.55');
    expect(savedPhotoShare()).toBe(0.55);
  });

  it('keeps a saved width inside its limits and drops one that is not a number', () => {
    localStorage.setItem(PHOTO_WIDTH_KEY, '0.95');
    expect(savedPhotoShare()).toBe(MAX_SHARE);
    localStorage.setItem(PHOTO_WIDTH_KEY, '0.01');
    expect(savedPhotoShare()).toBe(MIN_SHARE);
    for (const bad of ['', 'lat', 'NaN', '-1', '0', 'Infinity']) {
      localStorage.setItem(PHOTO_WIDTH_KEY, bad);
      expect(savedPhotoShare(), bad).toBeNull();
    }
  });

  it('reads none when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(savedPhotoShare()).toBeNull();
    vi.restoreAllMocks();
  });
});

describe('shareStyle', () => {
  it('gives each column a fraction of 1fr or more, so one alone still takes all the room left', () => {
    for (const share of [MIN_SHARE, 0.4, MAX_SHARE]) {
      const style = shareStyle(share)!;
      for (const value of Object.values(style)) expect(parseFloat(value), `${share}: ${value}`).toBeGreaterThanOrEqual(1);
    }
    expect(shareStyle(MAX_SHARE)).toEqual({ '--main-share': '2.5fr', '--photo-share': '7.5fr' });
    expect(shareStyle(null)).toBeUndefined();
  });
});

describe('PhotoSplit', () => {
  it('is a separator the keyboard reaches, at the start width', () => {
    render(<Harness />);
    const bar = screen.getByRole('separator', { name: 'Lățimea lucrării' });
    expect(bar).toHaveAttribute('aria-orientation', 'vertical');
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(bar).toHaveAttribute('aria-valuemin', '20');
    expect(bar).toHaveAttribute('aria-valuemax', '75');
    expect(bar).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('panes').style.getPropertyValue('--photo-share')).toBe('');
  });

  it('makes the paper wider with ←, narrower with →, and saves each step', async () => {
    render(<Harness />);
    const bar = screen.getByRole('separator');
    bar.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(localStorage.getItem(PHOTO_WIDTH_KEY)).toBe('0.42');
    await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    expect(bar).toHaveAttribute('aria-valuenow', '48');
    await userEvent.keyboard('{ArrowRight}');
    expect(bar).toHaveAttribute('aria-valuenow', '46');
    expect(localStorage.getItem(PHOTO_WIDTH_KEY)).toBe('0.46');
    const panes = screen.getByTestId('panes');
    expect(panes.style.getPropertyValue('--photo-share')).toBe('4.6fr');
    expect(panes.style.getPropertyValue('--main-share')).toBe('5.4fr');
  });

  it('goes to the narrowest paper with Home and the widest with End, never past them', async () => {
    render(<Harness />);
    const bar = screen.getByRole('separator');
    bar.focus();
    await userEvent.keyboard('{Home}');
    expect(bar).toHaveAttribute('aria-valuenow', '20');
    await userEvent.keyboard('{ArrowRight}');
    expect(bar).toHaveAttribute('aria-valuenow', '20');
    await userEvent.keyboard('{End}');
    expect(bar).toHaveAttribute('aria-valuenow', '75');
    await userEvent.keyboard('{ArrowLeft}');
    expect(bar).toHaveAttribute('aria-valuenow', '75');
  });

  it('follows a drag and saves the width only when the drag ends', () => {
    const shares: (number | null)[] = [];
    render(<Harness onShare={(share) => shares.push(share)} />);
    layOut();
    const bar = screen.getByRole('separator');
    fireEvent.pointerDown(bar, { button: 0, pointerId: 1, clientX: 710 });
    expect(bar).toHaveClass('is-dragging');
    // The pointer at 500: the paper gets 1100 - 500 - 10 = 590 of 980.
    fireEvent.pointerMove(bar, { pointerId: 1, clientX: 500 });
    expect(shares.at(-1)).toBeCloseTo(590 / 980);
    expect(localStorage.getItem(PHOTO_WIDTH_KEY)).toBeNull();
    // Far to the left: the widest paper.
    fireEvent.pointerMove(bar, { pointerId: 1, clientX: 50 });
    expect(shares.at(-1)).toBe(MAX_SHARE);
    fireEvent.pointerUp(bar, { pointerId: 1, clientX: 50 });
    expect(bar).not.toHaveClass('is-dragging');
    expect(localStorage.getItem(PHOTO_WIDTH_KEY)).toBe('0.75');
    // A move after the drag ended changes nothing.
    fireEvent.pointerMove(bar, { pointerId: 1, clientX: 900 });
    expect(shares.at(-1)).toBe(MAX_SHARE);
  });

  it('starts no drag on a right click', () => {
    render(<Harness />);
    layOut();
    const bar = screen.getByRole('separator');
    fireEvent.pointerDown(bar, { button: 2, pointerId: 1, clientX: 710 });
    fireEvent.pointerMove(bar, { pointerId: 1, clientX: 500 });
    expect(bar).toHaveAttribute('aria-valuenow', '40');
  });

  it('goes back to the start width on a double click and forgets the saved one', async () => {
    localStorage.setItem(PHOTO_WIDTH_KEY, '0.6');
    render(<Harness start={0.6} />);
    const bar = screen.getByRole('separator');
    expect(bar).toHaveAttribute('aria-valuenow', '60');
    await userEvent.dblClick(bar);
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(localStorage.getItem(PHOTO_WIDTH_KEY)).toBeNull();
    expect(screen.getByTestId('panes').style.getPropertyValue('--photo-share')).toBe('');
  });
});
