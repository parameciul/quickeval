import { useLayoutEffect, useRef, useState } from 'react';
import type { SubmissionDetail } from '../../../shared/api.ts';
import type { AnswerArea } from '../../../shared/schemas.ts';
import { formatFileSize } from '../../ui/format.ts';
import { useMediaQuery } from '../../ui/useMediaQuery.ts';
import { submissionFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { AnswerFrame } from './AnswerFrame.tsx';
import { WHOLE_PAGE, type ZoomView } from './zoom.ts';
import { ZoomPhoto } from './ZoomPhoto.tsx';
import { t } from '../../i18n/t.ts';
import { tryName } from '../../../shared/quickTry.ts';

// The answer to check: `key` names it (the paper and the item), `label` is the
// exercise ("II.1"), `areas` are the ones the review can draw (drawnAreas).
// The paper's box, named by the bar that sets its width (PhotoSplit).
export const PAPER_PHOTO_ID = 'paper-photo';

export interface ReviewFocus {
  key: string;
  label: string;
  areas: AnswerArea[];
}

// The middle pane of the review: one page of the paper at a time, with the
// page switch ("2/3" beside the student's name, then a button per page). A
// photo zooms inside the pane (ZoomPhoto): Esc shows the whole page again,
// and a right click or "Micșorează" takes one step out. "Arată chenarul" is
// a toggle in the same floating bar over the photo, an orange dashed frame,
// shown while the open answer has an area. A PDF shows in a frame. While
// "Arată chenarul" is on, the answer to check opens on
// its page with an orange border around its first area, on the whole page: the
// page never zooms by itself. An answer in more parts steps through them with
// the arrows beside the border's label, each part opening on its page, whole.
export function ReviewPhoto({
  submission,
  page,
  onPage,
  focus,
  frames,
  onFrames,
  onHide,
}: {
  submission: SubmissionDetail;
  page: number;
  onPage: (page: number) => void;
  focus: ReviewFocus | null;
  frames: boolean;
  onFrames: (on: boolean) => void;
  // Folds the pane to a strip, for more room for the exercises.
  onHide?: () => void;
}) {
  const { base } = useApi();
  // A finger cannot hit the label's small controls, and the label may end near
  // the pane's edge on a narrow screen: on a phone the controls stand in the
  // line under the page instead (below), never over the handwriting.
  const touch = useMediaQuery('(pointer: coarse)');
  const files = submission.files;
  const index = Math.min(Math.max(page, 0), Math.max(files.length - 1, 0));
  const file = files[index];

  // The answer framed now: none while the switch is off or it has no area.
  const framed = frames && focus !== null && focus.areas.length > 0 ? focus : null;
  // Every answer has its own key, so a zoom never follows the teacher to the
  // next answer. The key names the answer alone, not whether its border
  // shows: "Arată chenarul" only draws or hides the border, and keeps the zoom
  // and the place of the page in its box.
  const focusKey = `answer:${focus?.key ?? ''}`;
  const [part, setPart] = useState<{ key: string; index: number } | null>(null);
  const partIndex = part !== null && part.key === focusKey ? Math.min(part.index, (framed?.areas.length ?? 1) - 1) : 0;

  // The zoom of the page shown. A page opens whole, also when it holds the
  // answer to check; only the teacher's own moves zoom it: a click, the
  // buttons over the page, or a pinch.
  const fileKey = `${submission.id}:${file?.id ?? ''}`;
  const [zoom, setZoom] = useState<{ focusKey: string; fileKey: string; view: ZoomView } | null>(null);
  // Another page forgets the zoom, so coming back to a page shows it as it opens.
  const [shownFile, setShownFile] = useState(fileKey);
  if (shownFile !== fileKey) {
    setShownFile(fileKey);
    if (zoom !== null && zoom.fileKey !== fileKey) setZoom(null);
  }
  const view = zoom !== null && zoom.focusKey === focusKey && zoom.fileKey === fileKey ? zoom.view : WHOLE_PAGE;
  const setView = (next: ZoomView) => setZoom({ focusKey, fileKey, view: next });

  // The next or the previous part: its page, shown whole. The teacher zooms
  // it herself if she wants to.
  const goPart = (next: number) => {
    const area = framed?.areas[next];
    const target = area && files[area.page - 1];
    if (!area || !target) return;
    setPart({ key: focusKey, index: next });
    onPage(area.page - 1);
  };

  // With a width of the teacher's own the page can be taller than its box,
  // which then scrolls (brand.css). Another answer or page brings the answer
  // on the page shown to the middle of the box (the part being stepped
  // through, else the answer's first area there), or the top of the page when
  // it has none; again once the photo has loaded and has its shape, and
  // whenever the box or the page changes size. A step to another part on the
  // same page leaves the box where it is while the part is already in sight,
  // so the arrows never move a page the teacher can read.
  const box = useRef<HTMLElement>(null);
  const pageNumber = index + 1;
  const placed = useRef<{ focusKey: string; fileKey: string } | null>(null);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const samePage = placed.current !== null && placed.current.focusKey === focusKey && placed.current.fileKey === fileKey;
    placed.current = { focusKey, fileKey };
    const place = (reveal: boolean) => {
      if (element.scrollHeight <= element.clientHeight) return;
      const pane = element.querySelector<HTMLElement>('.zoom-pane');
      const stepped = framed?.areas[partIndex];
      const area = stepped?.page === pageNumber ? stepped : focus?.areas.find((other) => other.page === pageNumber);
      if (!pane || !area) {
        element.scrollTop = 0;
        return;
      }
      const paneBox = pane.getBoundingClientRect();
      const paneTop = paneBox.top - element.getBoundingClientRect().top + element.scrollTop;
      const top = paneTop + area.y0 * paneBox.height;
      const bottom = paneTop + area.y1 * paneBox.height;
      if (reveal && top >= element.scrollTop && bottom <= element.scrollTop + element.clientHeight) return;
      element.scrollTop = Math.max(0, (top + bottom) / 2 - element.clientHeight / 2);
    };
    place(samePage);
    // Again when the box or the page in it changes size: the photo has loaded,
    // the teacher dragged the paper wider (the box may only now be taller than
    // the screen), or the window changed. A zoom moves the page inside the
    // pane and leaves the pane's size, so it never moves the box.
    const pane = element.querySelector('.zoom-pane');
    // The browser reports every size once as the watch starts: only a size
    // that really changed places the page again, so a step to another part
    // does not bring it to the middle after all.
    const sizes = new Map<Element, string>();
    const resized = (entries?: ResizeObserverEntry[]) =>
      !entries ||
      entries
        .map((entry) => {
          const size = `${entry.contentRect.width}x${entry.contentRect.height}`;
          const before = sizes.get(entry.target);
          sizes.set(entry.target, size);
          return before !== undefined && before !== size;
        })
        .some(Boolean);
    const watch = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => resized(entries) && place(false)) : null;
    if (watch) {
      watch.observe(element);
      if (pane) watch.observe(pane);
    }
    const image = element.querySelector('.zoom-pane img');
    const onLoad = () => requestAnimationFrame(() => place(false));
    const waits = image instanceof HTMLImageElement && !image.complete;
    if (waits) image.addEventListener('load', onLoad, { once: true });
    return () => {
      watch?.disconnect();
      if (waits) image.removeEventListener('load', onLoad);
    };
    // Only the answer, its part, the page and a new size move the box: not
    // every render, and not the border shown or hidden.
  }, [focusKey, fileKey, partIndex]);

  const hide = onHide ? (
    <button type="button" className="button-quiet button-small icon-button photo-hide" aria-label={t('Ascunde lucrarea')} title={t('Ascunde lucrarea')} onClick={onHide}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </button>
  ) : null;

  if (!file) {
    return (
      <div className="review-photo" id={PAPER_PHOTO_ID}>
        {hide && <div className="review-photo-top is-end">{hide}</div>}
        <p className="hint">{t('Elevul nu a încărcat niciun fișier.')}</p>
      </div>
    );
  }
  const url = submissionFileUrl(submission.id, file.id, base);
  const caption = `${tryName(submission.studentName)} · ${index + 1}/${files.length}`;
  const photo = file.contentType.startsWith('image/');
  const parts = framed?.areas.length ?? 0;
  const partLabel = (number: number) => (parts > 1 ? t('{label} · partea {v2} din {parts}', { label: framed!.label, v2: number + 1, parts }) : framed!.label);
  // The controls of an answer in more parts: beside its label on a computer,
  // in the line under the page on a phone.
  const partButtons =
    parts > 1 ? (
      <>
        <button type="button" className="button-quiet button-small" aria-label={t('Partea anterioară')} disabled={partIndex === 0} onClick={() => goPart(partIndex - 1)}>
          ‹
        </button>
        <button
          type="button"
          className="button-quiet button-small"
          aria-label={t('Partea următoare')}
          disabled={partIndex === parts - 1}
          onClick={() => goPart(partIndex + 1)}
        >
          ›
        </button>
      </>
    ) : undefined;
  const footParts =
    touch && partButtons !== undefined ? (
      <span className="answer-parts is-below-page" role="group" aria-label={t('Părțile răspunsului')}>
        <span className="answer-parts-count">
          {t('{v1} din {parts}', { v1: partIndex + 1, parts })}
        </span>
        {partButtons}
      </span>
    ) : undefined;
  return (
    <figure className="review-photo" id={PAPER_PHOTO_ID} ref={box}>
      <div className="review-photo-top">
        <div className="review-photo-name">
          <figcaption>{caption}</figcaption>
          {/* The page's own file, as the student sent it. */}
          {file && (
            <span className="hint">
              {file.name} · {formatFileSize(file.size)}
            </span>
          )}
        </div>
        <div className="review-photo-actions">
          {files.length > 1 && (
            <span className="page-switch" role="group" aria-label={t('Paginile lucrării')}>
              {files.map((other, number) => (
                <button
                  key={other.id}
                  type="button"
                  className="page-switch-button"
                  aria-label={t('Pagina {n}', { n: number + 1 })}
                  aria-current={number === index ? 'true' : undefined}
                  onClick={() => onPage(number)}
                >
                  {number + 1}
                </button>
              ))}
            </span>
          )}
          {hide}
        </div>
      </div>
      {photo ? (
        <ZoomPhoto
          src={url}
          alt={t('Pagina {v1} a lucrării', { v1: index + 1 })}
          view={view}
          onView={setView}
          foot={footParts}
          tools={
            focus !== null && focus.areas.length > 0 ? (
              <button
                type="button"
                className="button-quiet button-small icon-button frame-toggle"
                aria-label={t('Arată chenarul')}
                aria-pressed={frames}
                title={frames ? t('Ascunde chenarul răspunsului') : t('Arată chenarul răspunsului')}
                onClick={() => onFrames(!frames)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2.4" />
                </svg>
              </button>
            ) : undefined
          }
        >
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
        </ZoomPhoto>
      ) : (
        <>
          <iframe className="pdf-frame" src={url} title={t('Pagina {v1} a lucrării', { v1: index + 1 })} />
          <a href={url} target="_blank" rel="noopener">
            {t('Deschide PDF-ul')}
          </a>
        </>
      )}
    </figure>
  );
}
