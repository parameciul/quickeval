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

export const WHOLE_PAGE: ZoomView = { scale: 1, cx: 0.5, cy: 0.5 };
// A click zooms this much: enough to read handwriting on a phone photo.
export const CLICK_SCALE = 2.5;
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

// A click on the whole page: zoom in, centred on the point clicked.
export function zoomInAt(view: ZoomView, px: number, py: number): ZoomView {
  const { x, y } = pageAt(view, px, py);
  return clampView({ scale: CLICK_SCALE, cx: x, cy: y });
}

// The wheel: a new scale, and the point under the pointer stays under it.
export function zoomAround(view: ZoomView, scale: number, px: number, py: number): ZoomView {
  const { x, y } = pageAt(view, px, py);
  const next = clamp(scale, 1, MAX_SCALE);
  return clampView({ scale: next, cx: x - (px - 0.5) / next, cy: y - (py - 0.5) / next });
}

// The wheel's step: about 1.0015 per pixel scrolled (a mouse notch of 100 px
// zooms by about 1.16), so a trackpad's many small steps zoom smoothly too.
export function wheelScale(scale: number, deltaPixels: number): number {
  return scale * Math.exp(-deltaPixels * 0.0015);
}

// A drag: the page follows the pointer. `dx`, `dy` are fractions of the pane.
export function panBy(view: ZoomView, dx: number, dy: number): ZoomView {
  return clampView({ ...view, cx: view.cx - dx / view.scale, cy: view.cy - dy / view.scale });
}

// The CSS transform of the page's layer (origin at its top left corner): a
// translate in % of the layer, which has the pane's size.
export function layerTransform(view: ZoomView): string {
  const tx = (0.5 - view.cx * view.scale) * 100;
  const ty = (0.5 - view.cy * view.scale) * 100;
  return `translate(${round(tx)}%, ${round(ty)}%) scale(${round(view.scale)})`;
}

const round = (value: number) => Math.round(value * 1000) / 1000;
