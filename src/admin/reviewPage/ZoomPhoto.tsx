import { type CSSProperties, type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { isReviewKey } from './keys.ts';
import { isZoomed, layerTransform, panBy, WHOLE_PAGE, wheelScale, zoomAround, zoomInAt, type ZoomView } from './zoom.ts';

// A page of the paper that zooms inside the middle pane: a left click zooms in
// on the point clicked, the wheel zooms around the pointer, a drag moves the
// zoomed page, and a right click or Esc shows the whole page again. The view
// belongs to the caller, who also shows "Toată pagina". `children` are drawn
// over the page (the border of an answer), in the pane's own coordinates.
export function ZoomPhoto({ src, alt, view, onView, children }: { src: string; alt: string; view: ZoomView; onView: (view: ZoomView) => void; children?: ReactNode }) {
  const pane = useRef<HTMLDivElement>(null);
  // Width / height of the photo: the pane takes its shape. A phone page until it
  // loads, also when another page comes in its place.
  const [loaded, setLoaded] = useState<{ src: string; ratio: number } | null>(null);
  const ratio = loaded !== null && loaded.src === src ? loaded.ratio : 3 / 4;
  const zoomed = isZoomed(view);
  // The drag under way: where it started, and whether it moved yet.
  const drag = useRef<{ id: number; x: number; y: number; view: ZoomView; moved: boolean } | null>(null);
  // The handlers below are set once; they read the current view here.
  const current = useRef({ view, onView });
  current.current = { view, onView };

  // The point of the pane under the pointer, as fractions of the pane.
  const at = (clientX: number, clientY: number) => {
    const rect = pane.current!.getBoundingClientRect();
    return { px: rect.width ? (clientX - rect.left) / rect.width : 0.5, py: rect.height ? (clientY - rect.top) / rect.height : 0.5, rect };
  };

  // The wheel zooms; the page scrolls only at the whole page, wheeling out.
  useEffect(() => {
    const element = pane.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      const { view: now, onView: set } = current.current;
      const { px, py, rect } = at(event.clientX, event.clientY);
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height || 800 : 1;
      const next = zoomAround(now, wheelScale(now.scale, event.deltaY * unit, event.ctrlKey), px, py);
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
    if (event.button !== 0) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, view, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // A few pixels of a shaking hand are still a click.
    if (!start.moved && Math.hypot(dx, dy) < 4) return;
    start.moved = true;
    if (!isZoomed(start.view)) return;
    const { rect } = at(event.clientX, event.clientY);
    if (rect.width && rect.height) onView(panBy(start.view, dx / rect.width, dy / rect.height));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    drag.current = null;
    // A click zooms in on the whole page; on a zoomed page it does nothing.
    if (!start.moved && !isZoomed(start.view)) {
      const { px, py } = at(event.clientX, event.clientY);
      onView(zoomInAt(start.view, px, py));
    }
  };

  const style = { '--page-ratio': ratio } as CSSProperties;
  return (
    <div
      ref={pane}
      className={zoomed ? 'zoom-pane is-zoomed' : 'zoom-pane'}
      style={style}
      title={zoomed ? undefined : 'Clic pentru mărire'}
      data-testid="zoom-pane"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        if (zoomed) onView(WHOLE_PAGE);
      }}
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
      {children}
    </div>
  );
}
