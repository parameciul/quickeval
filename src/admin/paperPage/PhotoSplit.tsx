import { type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { PAPER_PHOTO_ID } from '../reviewPage/ReviewPhoto.tsx';
import { t } from '../../i18n/t.ts';

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

interface Sizes {
  room: number;
  right: number;
  width: number;
}

const within = (share: number, range: ShareRange) => clampShare(Math.min(range.max, Math.max(range.min, share)));

// The bar between the exercises and the paper, on a wide screen only
// (brand.css): drag it, or use the arrow keys, Home and End while it has the
// focus, to make the paper wider or narrower; a double click goes back to the
// start width. The width is saved when the drag ends. It never goes past what
// the screen can show: on a smaller screen a saved width wider than that shows
// at the widest the screen allows, and is kept for a bigger one.
//
// The paper is the pane the bar sizes (its value, as the separator pattern
// has it): Home gives it its least width, End its most, and the arrows move
// the bar their way, so ← makes the paper wider.
//
// While a drag lasts, the bar writes the new width straight on the panes and
// tells the page only when it ends: the page is not drawn again on every move
// of the pointer.
export function PhotoSplit({
  panes,
  share,
  onShare,
}: {
  panes: RefObject<HTMLDivElement | null>;
  share: number | null;
  onShare: (share: number | null) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<ShareRange>(WHOLE_RANGE);
  // The drag under way: the sizes measured when it started, and the share it
  // reached (none before the first move).
  const drag = useRef<{ sizes: Sizes | null; limits: ShareRange; share: number | null } | null>(null);
  const [dragShare, setDragShare] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  // The room of the two columns: from the exercises' left edge to the panes'
  // right edge, less the bar.
  const measure = (): Sizes | null => {
    const box = panes.current;
    const main = box?.querySelector<HTMLElement>('.paper-main');
    const own = bar.current;
    if (!box || !main || !own) return null;
    const width = own.getBoundingClientRect().width;
    const right = box.getBoundingClientRect().right;
    return { room: right - main.getBoundingClientRect().left - width, right, width };
  };
  const remeasure = (sizes: Sizes | null = measure()): ShareRange => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const next = shareRange(sizes?.room ?? 0, rem);
    setRange((old) => (old.min === next.min && old.max === next.max ? old : next));
    return next;
  };
  // Measured when the bar shows, and again when the window or the exercises'
  // column changes size (the students folded or unfolded): not on every
  // render of the page.
  useLayoutEffect(() => {
    const again = () => remeasure();
    again();
    window.addEventListener('resize', again);
    const main = panes.current?.querySelector('.paper-main');
    const watch = typeof ResizeObserver === 'function' && main ? new ResizeObserver(again) : null;
    if (main) watch?.observe(main);
    return () => {
      window.removeEventListener('resize', again);
      watch?.disconnect();
    };
    // The refs and setRange never change.
  }, []);

  const shown = within(dragShare ?? share ?? START_SHARE, range);

  const change = (next: number | null, limits: ShareRange = range) => {
    const value = next === null ? null : within(next, limits);
    onShare(value);
    savePhotoShare(value);
  };

  // The end of a drag, however it ends (the button let go, the browser
  // cancelling it, or the pointer lost to another window): the page gets the
  // width it reached, which is saved. Once only: letting go also loses the
  // pointer.
  const endDrag = () => {
    const ended = drag.current;
    if (ended === null) return;
    drag.current = null;
    setDragging(false);
    setDragShare(null);
    if (ended.share !== null) {
      onShare(ended.share);
      savePhotoShare(ended.share);
    }
  };

  const percent = Math.round(shown * 100);
  return (
    <div
      ref={bar}
      className={dragging ? 'photo-split is-dragging' : 'photo-split'}
      role="separator"
      aria-orientation="vertical"
      aria-label={t('Lățimea lucrării')}
      aria-valuemin={Math.round(range.min * 100)}
      aria-valuemax={Math.round(range.max * 100)}
      aria-valuenow={percent}
      aria-valuetext={t('Lucrarea ia {percent}% din loc', { percent })}
      aria-controls={PAPER_PHOTO_ID}
      aria-describedby="photo-split-keys"
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        const sizes = measure();
        drag.current = { sizes, limits: remeasure(sizes), share: null };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        const now = drag.current;
        if (now === null) return;
        // No button held any more: the drag ended out of sight.
        if (event.buttons === 0) {
          endDrag();
          return;
        }
        const sizes = now.sizes;
        if (!sizes || sizes.room <= 0) return;
        const next = within((sizes.right - event.clientX - sizes.width / 2) / sizes.room, now.limits);
        now.share = next;
        setDragShare(next);
        const box = panes.current;
        if (!box) return;
        for (const [name, value] of Object.entries(shareStyle(next)!)) box.style.setProperty(name, value);
        box.classList.add('has-photo-width');
      }}
      onPointerUp={(event) => {
        if (drag.current === null) return;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        endDrag();
      }}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={() => change(null)}
      onKeyDown={(event) => {
        const limits = remeasure();
        const from = within(share ?? START_SHARE, limits);
        const step = event.shiftKey ? BIG_KEY_STEP : KEY_STEP;
        if (event.key === 'ArrowLeft') change(from + step, limits);
        else if (event.key === 'ArrowRight') change(from - step, limits);
        else if (event.key === 'Home') change(limits.min, limits);
        else if (event.key === 'End') change(limits.max, limits);
        else return;
        event.preventDefault();
      }}
    >
      <span className="photo-split-grip" aria-hidden="true" />
      <span className="photo-split-tip" aria-hidden="true">
        {t('Trage ca să schimbi lățimea · dublu clic: lățimea de început')}
      </span>
      {/* What the keys do, for the keyboard and screen readers: the tip
          above shows only under the pointer. */}
      <span className="sr-only" id="photo-split-keys">
        {t('Săgeata stânga lărgește lucrarea, săgeata dreapta o îngustează, cu Shift mai mult. Home: cea mai îngustă. End: cea mai lată. Dublu clic: lățimea de început.')}
      </span>
    </div>
  );
}
