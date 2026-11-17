import { type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { PAPER_PHOTO_ID } from '../reviewPage/ReviewPhoto.tsx';

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

// The least widths brand.css keeps for the exercises and for the paper.
const LEAST_MAIN_REM = 28;
const LEAST_PHOTO_REM = 20;

export interface ShareRange {
  min: number;
  max: number;
}

const WHOLE_RANGE: ShareRange = { min: MIN_SHARE, max: MAX_SHARE };

// The shares the screen can show: the limits, narrowed so that neither column
// goes under its least width in the room the two have (`room`, in px).
export function shareRange(room: number, rem: number): ShareRange {
  if (!(room > 0) || !(rem > 0)) return WHOLE_RANGE;
  const min = Math.max(MIN_SHARE, Math.ceil(((LEAST_PHOTO_REM * rem) / room) * 1000) / 1000);
  const max = Math.min(MAX_SHARE, Math.floor((1 - (LEAST_MAIN_REM * rem) / room) * 1000) / 1000);
  return max >= min ? { min, max } : { min, max: min };
}

const within = (share: number, range: ShareRange) => clampShare(Math.min(range.max, Math.max(range.min, share)));

// The bar between the exercises and the paper, on a wide screen only
// (brand.css): drag it, or use the arrow keys, Home and End while it has the
// focus, to make the paper wider or narrower; a double click goes back to the
// start width. The width is saved when the drag ends. It never goes past what
// the screen can show: on a smaller screen a saved width wider than that shows
// at the widest the screen allows, and is kept for a bigger one.
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
  const bar = useRef<HTMLDivElement>(null);
  const last = useRef(share);
  const [range, setRange] = useState<ShareRange>(WHOLE_RANGE);

  // The room of the two columns: from the exercises' left edge to the panes'
  // right edge, less the bar.
  const measure = (): { room: number; right: number; width: number } | null => {
    const box = panes.current;
    const main = box?.querySelector<HTMLElement>('.paper-main');
    const own = bar.current;
    if (!box || !main || !own) return null;
    const width = own.getBoundingClientRect().width;
    const right = box.getBoundingClientRect().right;
    return { room: right - main.getBoundingClientRect().left - width, right, width };
  };
  const remeasure = (): ShareRange => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const next = shareRange(measure()?.room ?? 0, rem);
    setRange((old) => (old.min === next.min && old.max === next.max ? old : next));
    return next;
  };
  useLayoutEffect(() => {
    remeasure();
    window.addEventListener('resize', remeasure);
    return () => window.removeEventListener('resize', remeasure);
  });

  const shown = within(share ?? START_SHARE, range);

  const change = (next: number | null, save: boolean, limits: ShareRange = range) => {
    const value = next === null ? null : within(next, limits);
    last.current = value;
    onShare(value);
    if (save) savePhotoShare(value);
  };

  // The share under the pointer.
  const shareAt = (clientX: number): number | null => {
    const sizes = measure();
    if (!sizes || sizes.room <= 0) return null;
    return (sizes.right - clientX - sizes.width / 2) / sizes.room;
  };

  const percent = Math.round(shown * 100);
  return (
    <div
      ref={bar}
      className={dragging ? 'photo-split is-dragging' : 'photo-split'}
      role="separator"
      aria-orientation="vertical"
      aria-label="Lățimea lucrării"
      aria-valuemin={Math.round(range.min * 100)}
      aria-valuemax={Math.round(range.max * 100)}
      aria-valuenow={percent}
      aria-valuetext={`Lucrarea ia ${percent}% din loc`}
      aria-controls={PAPER_PHOTO_ID}
      aria-describedby="photo-split-keys"
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        remeasure();
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (!dragging) return;
        const next = shareAt(event.clientX);
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
        const limits = remeasure();
        const from = within(share ?? START_SHARE, limits);
        const step = event.shiftKey ? BIG_KEY_STEP : KEY_STEP;
        // The bar moves the way the arrow points: left makes the paper wider.
        if (event.key === 'ArrowLeft') change(from + step, true, limits);
        else if (event.key === 'ArrowRight') change(from - step, true, limits);
        else if (event.key === 'Home') change(limits.min, true, limits);
        else if (event.key === 'End') change(limits.max, true, limits);
        else return;
        event.preventDefault();
      }}
    >
      <span className="photo-split-grip" aria-hidden="true" />
      <span className="photo-split-tip" aria-hidden="true">
        Trage ca să schimbi lățimea · dublu clic: lățimea de început
      </span>
      {/* What the keys do, for the keyboard and screen readers: the tip
          above shows only under the pointer. */}
      <span className="sr-only" id="photo-split-keys">
        Săgeata stânga lărgește lucrarea, săgeata dreapta o îngustează, cu Shift mai mult. Home: cea mai îngustă. End: cea mai lată. Dublu clic: lățimea de
        început.
      </span>
    </div>
  );
}
