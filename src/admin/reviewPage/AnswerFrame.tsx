import type { ReactNode } from 'react';
import { boxInPane, type PageBox, type ZoomView } from './zoom.ts';

// Room above a border, as a share of the pane, for its label to sit outside it.
const LABEL_ROOM = 0.08;

const percent = (value: number) => `${Math.round(value * 100000) / 1000}%`;

// The border of the answer to check, drawn over the page in the pane's own
// coordinates, so it moves and grows with the zoom: an orange dashed line
// that looks drawn by hand, with its label outside it, above (or below when
// there is no room above), never over the student's work. `parts` are the
// controls of an answer in more parts, right beside the label.
export function AnswerFrame({ view, box, label, parts }: { view: ZoomView; box: PageBox; label: string; parts?: ReactNode }) {
  const shown = boxInPane(view, box);
  const below = shown.y0 < LABEL_ROOM;
  // A press on a control beside the label never reaches the page under it:
  // the pane would zoom in on that point.
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  return (
    <div
      className="answer-frame"
      data-testid="answer-frame"
      style={{ left: percent(shown.x0), top: percent(shown.y0), width: percent(shown.x1 - shown.x0), height: percent(shown.y1 - shown.y0) }}
    >
      <span className={below ? 'answer-frame-label is-below' : 'answer-frame-label'}>
        {label}
        {parts !== undefined && (
          <span className="answer-parts" role="group" aria-label="Părțile răspunsului" onPointerDown={stop} onPointerUp={stop} onClick={stop}>
            {parts}
          </span>
        )}
      </span>
    </div>
  );
}
