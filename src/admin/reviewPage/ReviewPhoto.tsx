import { useState } from 'react';
import type { SubmissionDetail } from '../../../shared/api.ts';
import type { AnswerArea } from '../../../shared/schemas.ts';
import { useMediaQuery } from '../../ui/useMediaQuery.ts';
import { submissionFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { AnswerFrame } from './AnswerFrame.tsx';
import { isZoomed, viewOfBox, WHOLE_PAGE, type ZoomView } from './zoom.ts';
import { ZoomPhoto } from './ZoomPhoto.tsx';

// The answer to check: `key` names it (the paper and the item), `label` is the
// exercise ("II.1"), `areas` are the ones the review can draw (drawnAreas).
export interface ReviewFocus {
  key: string;
  label: string;
  areas: AnswerArea[];
}

// The middle pane of the review: one page of the paper at a time, with the
// page switch. A photo zooms inside the pane (ZoomPhoto); "Toată pagina", a
// right click or Esc shows the whole page again. A PDF shows in a frame.
// While "Arată chenarul" is on, the answer to check opens zoomed on its first
// area with an orange border; an answer in more parts steps through them with
// the arrows beside the border's label.
export function ReviewPhoto({
  submission,
  page,
  onPage,
  focus,
  frames,
  onFrames,
}: {
  submission: SubmissionDetail;
  page: number;
  onPage: (page: number) => void;
  focus: ReviewFocus | null;
  frames: boolean;
  onFrames: (on: boolean) => void;
}) {
  const { base } = useApi();
  // A finger cannot hit the label's small controls, and the label may end near
  // the pane's edge on a narrow screen: on a phone the controls float inside
  // the pane instead (below).
  const touch = useMediaQuery('(pointer: coarse)');
  const files = submission.files;
  const index = Math.min(Math.max(page, 0), Math.max(files.length - 1, 0));
  const file = files[index];

  // The answer framed now: none while the switch is off or it has no area.
  const framed = frames && focus !== null && focus.areas.length > 0 ? focus : null;
  // Every answer has its own key, framed or not, so a zoom never follows the
  // teacher to the next answer.
  const focusKey = framed ? `framed:${framed.key}` : `plain:${focus?.key ?? ''}`;
  const [part, setPart] = useState<{ key: string; index: number } | null>(null);
  const partIndex = part !== null && part.key === focusKey ? Math.min(part.index, (framed?.areas.length ?? 1) - 1) : 0;
  const partArea = framed?.areas[partIndex];

  // The zoom of the page shown. An answer that opens shows its part zoomed;
  // a page the teacher picks herself opens whole.
  const fileKey = `${submission.id}:${file?.id ?? ''}`;
  const [zoom, setZoom] = useState<{ focusKey: string; fileKey: string; view: ZoomView } | null>(null);
  // Another page forgets the zoom, so coming back to a page shows it as it opens.
  const [shownFile, setShownFile] = useState(fileKey);
  if (shownFile !== fileKey) {
    setShownFile(fileKey);
    if (zoom !== null && zoom.fileKey !== fileKey) setZoom(null);
  }
  const view =
    zoom !== null && zoom.focusKey === focusKey
      ? zoom.fileKey === fileKey
        ? zoom.view
        : WHOLE_PAGE
      : partArea && partArea.page === index + 1
        ? viewOfBox(partArea)
        : WHOLE_PAGE;
  const setView = (next: ZoomView) => setZoom({ focusKey, fileKey, view: next });

  // The next or the previous part: its page, zoomed on it.
  const goPart = (next: number) => {
    const area = framed?.areas[next];
    const target = area && files[area.page - 1];
    if (!area || !target) return;
    setPart({ key: focusKey, index: next });
    setZoom({ focusKey, fileKey: `${submission.id}:${target.id}`, view: viewOfBox(area) });
    onPage(area.page - 1);
  };

  if (!file) {
    return (
      <div className="review-photo">
        <p className="hint">Elevul nu a încărcat niciun fișier.</p>
      </div>
    );
  }
  const url = submissionFileUrl(submission.id, file.id, base);
  const caption = `${submission.studentName} · pagina ${index + 1} din ${files.length}`;
  const photo = file.contentType.startsWith('image/');
  const parts = framed?.areas.length ?? 0;
  const partLabel = (number: number) => (parts > 1 ? `${framed!.label} · partea ${number + 1} din ${parts}` : framed!.label);
  // The controls of an answer in more parts: beside its label on a computer,
  // floating in the pane's corner on a phone. A press on one never reaches the
  // page under it, which would zoom there.
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  const partButtons =
    parts > 1 ? (
      <>
        <button type="button" className="button-quiet button-small" aria-label="Partea anterioară" disabled={partIndex === 0} onClick={() => goPart(partIndex - 1)}>
          ‹
        </button>
        <button
          type="button"
          className="button-quiet button-small"
          aria-label="Partea următoare"
          disabled={partIndex === parts - 1}
          onClick={() => goPart(partIndex + 1)}
        >
          ›
        </button>
      </>
    ) : undefined;
  const floatingParts =
    touch && partButtons !== undefined ? (
      <span className="answer-parts is-floating" role="group" aria-label="Părțile răspunsului" onPointerDown={stop} onPointerUp={stop} onClick={stop}>
        <span className="answer-parts-count">
          {partIndex + 1} din {parts}
        </span>
        {partButtons}
      </span>
    ) : undefined;
  return (
    <figure className="review-photo">
      <div className="review-photo-top">
        <figcaption>{caption}</figcaption>
        <div className="review-photo-actions">
          {files.length > 1 && (
            <span className="page-switch" role="group" aria-label="Paginile lucrării">
              {files.map((other, number) => (
                <button
                  key={other.id}
                  type="button"
                  className="page-switch-button"
                  aria-label={`Pagina ${number + 1}`}
                  aria-current={number === index ? 'true' : undefined}
                  onClick={() => onPage(number)}
                >
                  {number + 1}
                </button>
              ))}
            </span>
          )}
          {photo && isZoomed(view) && (
            <button type="button" className="button-quiet button-small" onClick={() => setView(WHOLE_PAGE)}>
              Toată pagina
            </button>
          )}
          {focus !== null && focus.areas.length > 0 && (
            <label className="check-label">
              <input type="checkbox" checked={frames} onChange={(event) => onFrames(event.target.checked)} />
              Arată chenarul
            </label>
          )}
        </div>
      </div>
      {photo ? (
        <ZoomPhoto src={url} alt={`Pagina ${index + 1} a lucrării`} view={view} onView={setView}>
          {framed?.areas.map((area, number) =>
            area.page === index + 1 ? (
              <AnswerFrame
                key={number}
                view={view}
                box={area}
                label={partLabel(number)}
                parts={!touch && number === partIndex ? partButtons : undefined}
              />
            ) : null,
          )}
          {floatingParts}
        </ZoomPhoto>
      ) : (
        <>
          <iframe className="pdf-frame" src={url} title={`Pagina ${index + 1} a lucrării`} />
          <a href={url} target="_blank" rel="noopener">
            Deschide PDF-ul
          </a>
        </>
      )}
    </figure>
  );
}
