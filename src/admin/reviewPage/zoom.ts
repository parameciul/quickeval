// The zoom of a page in the review's middle pane. A view is the zoom `scale`
// (1 shows the whole page) and the point of the page at the middle of the
// pane (`cx`, `cy`), as fractions (0 to 1) of the page's width and height.
// The pane has the page's own shape, so a fraction of the page is also a
// fraction of the pane at scale 1, and nothing here needs pixels.
export interface ZoomView {
  scale: number;
  cx: number;
  cy: number;
}

// A box on the page, as fractions of its width and height (AnswerArea without
// its page).
export interface PageBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const WHOLE_PAGE: ZoomView = { scale: 1, cx: 0.5, cy: 0.5 };
// One step of the zoom: a left click, a right click and the two buttons all
// take this same step, so the page grows or shrinks a little at a time and
// never jumps. A quarter more is enough to read a line of handwriting on a
// phone photo after two clicks.
export const ZOOM_STEP = 1.25;
export const MAX_SCALE = 6;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// The page always covers the pane: its middle stays far enough from the edges.
export function clampView(view: ZoomView): ZoomView {
  const scale = clamp(view.scale, 1, MAX_SCALE);
  const half = 0.5 / scale;
  return { scale, cx: clamp(view.cx, half, 1 - half), cy: clamp(view.cy, half, 1 - half) };
}

export const isZoomed = (view: ZoomView) => view.scale > 1;

// The point of the page under a point of the pane (fractions of the pane).
function pageAt(view: ZoomView, px: number, py: number): { x: number; y: number } {
  return { x: view.cx + (px - 0.5) / view.scale, y: view.cy + (py - 0.5) / view.scale };
}

// A click on the page: one step in, centred on the point clicked.
export function zoomInAt(view: ZoomView, px: number, py: number): ZoomView {
  return zoomAround(view, view.scale * ZOOM_STEP, px, py);
}

// A right click or the button "−": one step out, centred on the same point.
// At the whole page there is nothing to take away: the view stays whole.
export function zoomOutAt(view: ZoomView, px: number, py: number): ZoomView {
  return zoomAround(view, view.scale / ZOOM_STEP, px, py);
}

// The new scale, with the point under the pointer staying under it.
export function zoomAround(view: ZoomView, scale: number, px: number, py: number): ZoomView {
  const { x, y } = pageAt(view, px, py);
  const next = clamp(scale, 1, MAX_SCALE);
  return clampView({ scale: next, cx: x - (px - 0.5) / next, cy: y - (py - 0.5) / next });
}

// A trackpad pinch, which the browser sends as a wheel with ctrlKey: about
// 1.01 per pixel, so the many small steps of a pinch zoom smoothly. A plain
// wheel never zooms the page: it scrolls the page, as it should.
export function pinchScale(scale: number, deltaPixels: number): number {
  return scale * Math.exp(-deltaPixels * 0.01);
}

// A drag: the page follows the pointer. `dx`, `dy` are fractions of the pane.
export function panBy(view: ZoomView, dx: number, dy: number): ZoomView {
  return clampView({ ...view, cx: view.cx - dx / view.scale, cy: view.cy - dy / view.scale });
}

// Where a box of the page is in the pane, as fractions of the pane.
export function boxInPane(view: ZoomView, box: PageBox): PageBox {
  const at = (value: number, middle: number) => 0.5 + (value - middle) * view.scale;
  return { x0: at(box.x0, view.cx), y0: at(box.y0, view.cy), x1: at(box.x1, view.cx), y1: at(box.y1, view.cy) };
}

// The CSS transform of the page's layer (origin at its top left corner): a
// translate in % of the layer, which has the pane's size.
export function layerTransform(view: ZoomView): string {
  const tx = (0.5 - view.cx * view.scale) * 100;
  const ty = (0.5 - view.cy * view.scale) * 100;
  return `translate(${round(tx)}%, ${round(ty)}%) scale(${round(view.scale)})`;
}

const round = (value: number) => Math.round(value * 1000) / 1000;
