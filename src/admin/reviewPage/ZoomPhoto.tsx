import { type CSSProperties, type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../../ui/useMediaQuery.ts';
import { isReviewKey } from './keys.ts';
import { isZoomed, layerTransform, MAX_SCALE, panBy, pinchScale, WHOLE_PAGE, zoomAround, zoomInAt, zoomOutAt, type ZoomView } from './zoom.ts';
import { t } from '../../i18n/t.ts';

// A page of the paper that zooms inside the middle pane: a left click zooms in
// one step on the point clicked, a right click zooms out as much, a drag moves
// the zoomed page, and the two buttons over the page take the same step. The
// wheel is left to the page, which scrolls with it; only a trackpad pinch (a
// wheel with ctrlKey) zooms, around the pointer, and two fingers pinch on a
// touch screen. Esc, or "Micșorează" down to 100%, shows the whole page again.
// The view belongs to the caller. `children` are drawn over the page (the
// border of an answer), in the pane's own coordinates. Two groups of buttons:
// the view of the page (the caller's `tools`, none when it gives none) and
// the zoom. With a mouse they float over the page's top corners, close to the
// edges, the view on the left and the zoom on the right. On a touch screen the
// buttons are a finger's size and would cover a third of a phone's page, so
// they stand in a bar above the page instead, and the page is left whole.
//
// While the page is whole, a line says what a click does, worded for the
// pointer at hand: a phone has no right button, so there a tap and two fingers
// do the work. With a mouse it sits over the page's bottom left; on a touch
// screen it is a line under the page, beside the caller's `foot` (the parts of
// an answer). Once the page is zoomed the line goes, so the handwriting is
// left alone; the title says what a drag and a right click do. On a touch
// screen the line only turns invisible and keeps its room: the page under it
// never moves when the zoom changes.
//
// "Pe tot ecranul" (after the zoom's +, when the caller gives `onFull`) asks
// the caller to show the page over the whole screen. There the hint stands in
// the line under the page, also with a mouse: the page fills the screen's
// width and scrolls inside `.zoom-scroll`, and buttons over its top corners
// would scroll away with it. A caller with a header of its own draws the two
// groups there itself (`buttons={false}`, `ViewGroup`, `ZoomGroup`).
export function ZoomPhoto({
  src,
  alt,
  view,
  onView,
  tools,
  foot,
  full = false,
  onFull,
  buttons = true,
  barMiddle,
  children,
}: {
  src: string;
  alt: string;
  view: ZoomView;
  onView: (view: ZoomView) => void;
  tools?: ReactNode;
  // Drawn in the line under the page on a touch screen.
  foot?: ReactNode;
  // The page is over the whole screen; `onFull` turns it on and off.
  full?: boolean;
  onFull?: (on: boolean) => void;
  // False when the caller draws the two groups itself (`ViewGroup`,
  // `ZoomGroup`), in its own header: then none stands over or above the page.
  buttons?: boolean;
  // Drawn in the middle of the bar above the page, between the two groups.
  barMiddle?: ReactNode;
  children?: ReactNode;
}) {
  const pane = useRef<HTMLDivElement>(null);
  // A finger cannot right-click, and cannot read a tooltip.
  const touch = useMediaQuery('(pointer: coarse)');
  // The buttons above the page and the line under it, not over the page.
  const bars = touch || full;
  // Width / height of the photo: the pane takes its shape. A phone page until it
  // loads, also when another page comes in its place.
  const [loaded, setLoaded] = useState<{ src: string; ratio: number } | null>(null);
  const ratio = loaded !== null && loaded.src === src ? loaded.ratio : 3 / 4;
  const zoomed = isZoomed(view);
  // The fingers down on the page, where each of them is: two of them pinch.
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  // The drag under way: where it started, with which button, and whether it moved.
  const drag = useRef<{ id: number; button: number; x: number; y: number; view: ZoomView; moved: boolean } | null>(null);
  // The pinch under way: the gap between the fingers and the view it started on.
  const pinch = useRef<{ gap: number; view: ZoomView } | null>(null);
  // The handlers below are set once; they read the current view here.
  const current = useRef({ view, onView });
  current.current = { view, onView };

  // The point of the pane under the pointer, as fractions of the pane.
  const at = (clientX: number, clientY: number) => {
    const rect = pane.current!.getBoundingClientRect();
    return { px: rect.width ? (clientX - rect.left) / rect.width : 0.5, py: rect.height ? (clientY - rect.top) / rect.height : 0.5, rect };
  };

  // A trackpad pinch zooms around the pointer. A plain wheel belongs to the
  // page: it scrolls the page, and the photo may pass under it meanwhile.
  useEffect(() => {
    const element = pane.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      const { view: now, onView: set } = current.current;
      const { px, py, rect } = at(event.clientX, event.clientY);
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height || 800 : 1;
      const next = zoomAround(now, pinchScale(now.scale, event.deltaY * unit), px, py);
      if (!isZoomed(now) && !isZoomed(next)) return;
      event.preventDefault();
      set(next);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  // Esc shows the whole page, unless it was typed in a field or closes a panel.
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isReviewKey(event)) return;
      event.preventDefault();
      current.current.onView(WHOLE_PAGE);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomed]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 2) return;
    fingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    // Two fingers on the page: a pinch, and the press under way is no click.
    if (fingers.current.size === 2) {
      const [one, two] = [...fingers.current.values()];
      drag.current = null;
      pinch.current = { gap: Math.hypot(two!.x - one!.x, two!.y - one!.y), view };
      return;
    }
    drag.current = { id: event.pointerId, button: event.button, x: event.clientX, y: event.clientY, view, moved: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!fingers.current.has(event.pointerId)) return;
    fingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // Two fingers: the gap between them sets the zoom, around their middle.
    const two = pinch.current;
    if (two !== null && fingers.current.size >= 2) {
      const [one, other] = [...fingers.current.values()];
      if (two.gap < 1) return;
      const gap = Math.hypot(other!.x - one!.x, other!.y - one!.y);
      const { px, py } = at((one!.x + other!.x) / 2, (one!.y + other!.y) / 2);
      onView(zoomAround(two.view, two.view.scale * (gap / two.gap), px, py));
      return;
    }
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // A few pixels of a shaking hand are still a click.
    if (!start.moved && Math.hypot(dx, dy) < 4) return;
    start.moved = true;
    // Only the left button moves the page, and only a zoomed one.
    if (start.button !== 0 || !isZoomed(start.view)) return;
    const { rect } = at(event.clientX, event.clientY);
    if (rect.width && rect.height) onView(panBy(start.view, dx / rect.width, dy / rect.height));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const pinching = pinch.current !== null;
    fingers.current.delete(event.pointerId);
    if (pinching) {
      // A pinch never ends as a click; with one finger left, the next press
      // starts the drag again.
      if (fingers.current.size < 2) pinch.current = null;
      drag.current = null;
      return;
    }
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    drag.current = null;
    if (start.moved) return;
    // A click with no drag zooms one step: in with the left button, out with
    // the right one, as the two buttons over the page do.
    const { px, py } = at(event.clientX, event.clientY);
    onView(start.button === 2 ? zoomOutAt(start.view, px, py) : zoomInAt(start.view, px, py));
  };

  const style = { '--page-ratio': ratio } as CSSProperties;
  const viewGroup = !buttons ? null : <ViewGroup tools={tools} />;
  const zoomGroup = !buttons ? null : <ZoomGroup view={view} onView={onView} full={full} onFull={onFull} />;
  const hintText = touch ? t('Atinge: mărește · ciupește: micșorează') : t('Clic stânga: mărește · clic dreapta: micșorează');
  const hint = zoomed ? null : <p className="zoom-hint">{hintText}</p>;
  const pagePane = (
    <div
      ref={pane}
      className={zoomed ? 'zoom-pane is-zoomed' : 'zoom-pane'}
      style={style}
      title={zoomed ? t('Trage pentru a muta; clic dreapta pentru micșorare') : undefined}
      data-testid="zoom-pane"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(event) => {
        fingers.current.delete(event.pointerId);
        drag.current = null;
        pinch.current = null;
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="zoom-layer" style={{ transform: layerTransform(view) }}>
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth > 0 && naturalHeight > 0) setLoaded({ src, ratio: naturalWidth / naturalHeight });
          }}
        />
      </div>
      {!bars && hint}
      {children}
      {!bars && viewGroup}
      {!bars && zoomGroup}
    </div>
  );
  // A touch screen puts the buttons above the page and the hint and the
  // caller's foot under it, so a finger-sized control never covers the
  // handwriting; so does the whole screen. The pane keeps its place in the
  // tree in every layout (a missing bar is an empty slot, and `.zoom-scroll`
  // is always there), so a screen that switches between a finger and a mouse,
  // or a page shown over the whole screen, keeps the same pane, with its
  // wheel listener and its zoom.
  return (
    <div className={['zoom-photo', touch && 'is-touch', full && 'is-full'].filter(Boolean).join(' ')}>
      {bars && buttons && (
        <div className="zoom-bar">
          {viewGroup}
          {barMiddle}
          {zoomGroup}
        </div>
      )}
      <div className="zoom-scroll">{pagePane}</div>
      {bars && (
        <div className="zoom-foot">
          {zoomed ? (
            <p className="zoom-hint is-hidden" aria-hidden="true">
              {hintText}
            </p>
          ) : (
            hint
          )}
          {foot}
        </div>
      )}
    </div>
  );
}

// A press on a button of the groups is never a press on the page under them.
const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

// The view of the page: the caller's own buttons ("Arată chenarul"), none when
// it gives none.
export function ViewGroup({ tools }: { tools?: ReactNode }) {
  if (tools === undefined) return null;
  return (
    <span className="zoom-controls is-left" role="group" aria-label={t('Vederea paginii')} onPointerDown={stop} onPointerUp={stop} onClick={stop}>
      {tools}
    </span>
  );
}

// The zoom: −, the level, + and, when the caller gives `onFull`, "Pe tot ecranul".
export function ZoomGroup({ view, onView, full = false, onFull }: { view: ZoomView; onView: (view: ZoomView) => void; full?: boolean; onFull?: (on: boolean) => void }) {
  return (
    <span className="zoom-controls" role="group" aria-label={t('Mărirea paginii')} onPointerDown={stop} onPointerUp={stop} onClick={stop}>
      <button type="button" className="button-quiet button-small" aria-label={t('Micșorează')} disabled={!isZoomed(view)} onClick={() => onView(zoomOutAt(view, 0.5, 0.5))}>
        −
      </button>
      <span className="zoom-level" aria-hidden="true">
        {Math.round(view.scale * 100)}%
      </span>
      <button
        type="button"
        className="button-quiet button-small"
        aria-label={t('Mărește')}
        disabled={view.scale >= MAX_SCALE}
        onClick={() => onView(zoomInAt(view, 0.5, 0.5))}
      >
        +
      </button>
      {onFull && (
        <button
          type="button"
          className="button-quiet button-small icon-button full-toggle"
          aria-label={t('Pe tot ecranul')}
          aria-pressed={full}
          title={full ? t('Ieși din ecranul complet (Esc)') : t('Pe tot ecranul')}
          onClick={() => onFull(!full)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d={full ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </span>
  );
}
