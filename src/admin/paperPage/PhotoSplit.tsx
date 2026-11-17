import { type PointerEvent as ReactPointerEvent, type RefObject, useRef, useState } from 'react';

// The paper's share of the room the exercises and the paper have together:
// the teacher's own width, kept in this browser. None is today's start width
// (two fifths), with the photo no taller than the screen.
export const PHOTO_WIDTH_KEY = 'quickeval:paperPhotoWidth';
export const START_SHARE = 0.4;
export const MIN_SHARE = 0.2;
export const MAX_SHARE = 0.75;
// One press of an arrow key; with Shift, a bigger step.
export const KEY_STEP = 0.02;
export const BIG_KEY_STEP = 0.06;

// Inside the limits, to a thousandth (so the keys' steps add up exactly).
export const clampShare = (share: number) => Math.round(Math.min(MAX_SHARE, Math.max(MIN_SHARE, share)) * 1000) / 1000;

// The saved share, or null when there is none or it is not a number.
export function savedPhotoShare(): number | null {
  try {
    const saved = localStorage.getItem(PHOTO_WIDTH_KEY);
    if (saved === null) return null;
    const share = Number(saved);
    return Number.isFinite(share) && share > 0 ? clampShare(share) : null;
  } catch {
    return null;
  }
}

export function savePhotoShare(share: number | null): void {
  try {
    if (share === null) localStorage.removeItem(PHOTO_WIDTH_KEY);
    else localStorage.setItem(PHOTO_WIDTH_KEY, String(share));
  } catch {
    // Storage can be blocked; the width then lasts until the page reloads.
  }
}

// The style of `.paper-panes` for a share: the two columns as fractions
// (brand.css keeps each above its least width). Counted in tenths: when the
// exercises are at their least width, the paper's fraction alone takes the
// room left only if it is 1fr or more (a grid gives a column under 1fr only
// that part of the room).
export function shareStyle(share: number | null): Record<string, string> | undefined {
  if (share === null) return undefined;
  const tenths = (part: number) => `${Math.round(part * 1000) / 100}fr`;
  return { '--main-share': tenths(1 - share), '--photo-share': tenths(share) };
}

// The bar between the exercises and the paper, on a wide screen only
// (brand.css): drag it, or use the arrow keys, Home and End while it has the
// focus, to make the paper wider or narrower; a double click goes back to the
// start width. The width is saved when the drag ends.
export function PhotoSplit({
  panes,
  share,
  onShare,
}: {
  panes: RefObject<HTMLDivElement | null>;
  share: number | null;
  onShare: (share: number | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const last = useRef(share);
  const shown = share ?? START_SHARE;

  const change = (next: number | null, save: boolean) => {
    const value = next === null ? null : clampShare(next);
    last.current = value;
    onShare(value);
    if (save) savePhotoShare(value);
  };

  // The share under the pointer: the room from the exercises' left edge to the
  // panes' right edge, less the bar, is the room of the two.
  const shareAt = (event: ReactPointerEvent<HTMLDivElement>): number | null => {
    const box = panes.current;
    const main = box?.querySelector<HTMLElement>('.paper-main');
    if (!box || !main) return null;
    const bar = event.currentTarget.getBoundingClientRect();
    const right = box.getBoundingClientRect().right;
    const room = right - main.getBoundingClientRect().left - bar.width;
    if (room <= 0) return null;
    return (right - event.clientX - bar.width / 2) / room;
  };

  const percent = Math.round(shown * 100);
  return (
    <div
      className={dragging ? 'photo-split is-dragging' : 'photo-split'}
      role="separator"
      aria-orientation="vertical"
      aria-label="Lățimea lucrării"
      aria-valuemin={Math.round(MIN_SHARE * 100)}
      aria-valuemax={Math.round(MAX_SHARE * 100)}
      aria-valuenow={percent}
      aria-valuetext={`Lucrarea ia ${percent}% din loc`}
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (!dragging) return;
        const next = shareAt(event);
        if (next !== null) change(next, false);
      }}
      onPointerUp={(event) => {
        if (!dragging) return;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        setDragging(false);
        savePhotoShare(last.current);
      }}
      onPointerCancel={() => {
        setDragging(false);
        savePhotoShare(last.current);
      }}
      onDoubleClick={() => change(null, true)}
      onKeyDown={(event) => {
        const step = event.shiftKey ? BIG_KEY_STEP : KEY_STEP;
        // The bar moves the way the arrow points: left makes the paper wider.
        if (event.key === 'ArrowLeft') change(shown + step, true);
        else if (event.key === 'ArrowRight') change(shown - step, true);
        else if (event.key === 'Home') change(MIN_SHARE, true);
        else if (event.key === 'End') change(MAX_SHARE, true);
        else return;
        event.preventDefault();
      }}
    >
      <span className="photo-split-grip" aria-hidden="true" />
      <span className="photo-split-tip" aria-hidden="true">
        Trage ca să schimbi lățimea · dublu clic: lățimea de început
      </span>
    </div>
  );
}
