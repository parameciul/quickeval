import { boxInPane, type PageBox, type ZoomView } from './zoom.ts';

// Room above a border, as a share of the pane, for its label to sit outside it.
const LABEL_ROOM = 0.08;

const percent = (value: number) => `${Math.round(value * 100000) / 1000}%`;

// The border of the answer to check, drawn over the page in the pane's own
// coordinates, so it moves and grows with the zoom: an orange dashed line
// that looks drawn by hand, with its label outside it, above (or below when
// there is no room above), never over the student's work.
export function AnswerFrame({ view, box, label }: { view: ZoomView; box: PageBox; label: string }) {
  const shown = boxInPane(view, box);
  const below = shown.y0 < LABEL_ROOM;
  return (
    <div
      className="answer-frame"
      data-testid="answer-frame"
      aria-hidden="true"
      style={{ left: percent(shown.x0), top: percent(shown.y0), width: percent(shown.x1 - shown.x0), height: percent(shown.y1 - shown.y0) }}
    >
      <span className={below ? 'answer-frame-label is-below' : 'answer-frame-label'}>{label}</span>
    </div>
  );
}
