import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SubmissionDetail } from '../../../shared/api.ts';
import type { AnswerArea } from '../../../shared/schemas.ts';
import { formatFileSize } from '../../ui/format.ts';
import { useMediaQuery } from '../../ui/useMediaQuery.ts';
import { submissionFileUrl } from '../api.ts';
import { PageDownload } from '../paperPage/PageDownload.tsx';
import { useApi } from '../ApiContext.tsx';
import { AnswerFrame } from './AnswerFrame.tsx';
import { isReviewKey } from './keys.ts';
import { WHOLE_PAGE, type ZoomView } from './zoom.ts';
import { ViewGroup, ZoomGroup, ZoomPhoto } from './ZoomPhoto.tsx';
import { t } from '../../i18n/t.ts';
import { tryName } from '../../../shared/quickTry.ts';

// The answer to check: `key` names it (the paper and the item), `label` is the
// exercise ("II.1"), `areas` are the ones the review can draw (drawnAreas).
// The paper's box, named by the bar that sets its width (PhotoSplit).
export const PAPER_PHOTO_ID = 'paper-photo';

// What Tab reaches inside the box over the whole screen.
const FOCUSABLE = 'button:not([disabled]), a[href], iframe, [tabindex]:not([tabindex="-1"])';

// The width, in rem, that the box's header needs to hold the view and the zoom
// buttons on its one line, beside the name (kept at 9rem at least), the
// download button, the page buttons and the ×. A narrower box keeps them over the page, so its header
// never grows a second line.
export function headWidth({ view, pages, hide }: { view: boolean; pages: number; hide: boolean }): number {
  const padding = 2;
  const name = 9;
  const zoom = 9.75;
  const gap = 0.75;
  const download = 2 + gap;
  return padding + name + gap + zoom + download + (view ? 2 + gap : 0) + (pages > 1 ? pages * 2.25 + gap : 0) + (hide ? 2 + gap : 0);
}

// A trackpad pinch (a wheel with ctrlKey) over the buttons that float over
// the page is not the browser's zoom of the whole web page.
function holdPinch(element: HTMLElement | null) {
  if (!element) return;
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey) event.preventDefault();
  };
  element.addEventListener('wheel', onWheel, { passive: false });
  return () => element.removeEventListener('wheel', onWheel);
}

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
//
// The box's header (the name, the page buttons, the ×) stays at the top of
// the box while the page scrolls under it, in its own box (`.zoom-scroll`). It also holds "Arată chenarul" and the
// zoom when its one line has the room for them (`headWidth`); else they float
// over the page's top corners, hung from the header, so they stay in sight too
// (on a touch screen they stand in the bar above the page instead).
//
// "Pe tot ecranul" shows the same box over the whole screen (`is-full`): the
// page as wide as the screen allows, scrolling between the header and the
// hint's line under it. The header holds the name and "Arată chenarul" on
// the left, the × in the middle, the zoom and the page buttons on the right;
// on a phone, the name and the page buttons, and a bar under it the view,
// the × in its middle and the zoom.
// Two arrows beside the page (and ← and →) turn to the previous and the next
// page; past the first or the last page they do nothing. The box stays the same element,
// so the zoom, the border and its part go with it. Esc, the button again or
// the × in place of "Ascunde lucrarea" bring it back; a spacer of its height
// keeps its place meanwhile, so the page under it never moves. Over the whole
// screen A, J and K do nothing, and Tab goes round its own controls: the
// decision and the other points are hidden under it. The page keys 1–9 still
// work. Whether it is open belongs to the caller (`full`): a phone turned
// sideways moves the paper from the open row to the column beside it, a new
// box, which opens over the whole screen again. A PDF page closes it: Esc
// typed in the PDF's own viewer never reaches the page.
export function ReviewPhoto({
  submission,
  page,
  onPage,
  focus,
  frames,
  onFrames,
  onHide,
  full,
  onFull,
}: {
  submission: SubmissionDetail;
  page: number;
  onPage: (page: number) => void;
  focus: ReviewFocus | null;
  frames: boolean;
  onFrames: (on: boolean) => void;
  // Folds the pane to a strip, for more room for the exercises.
  onHide?: () => void;
  // The box is over the whole screen; `onFull` opens and closes it.
  full: boolean;
  onFull: (on: boolean) => void;
}) {
  const { base } = useApi();
  // A finger cannot hit the label's small controls, and the label may end near
  // the pane's edge on a narrow screen: on a phone the controls stand in the
  // line under the page instead (below), never over the handwriting.
  const touch = useMediaQuery('(pointer: coarse)');
  // A phone's width: over the whole screen the view, the × and the zoom
  // take a bar of their own under the header (brand.css, the same width).
  const narrow = useMediaQuery('(max-width: 40rem)');
  const files = submission.files;
  const index = Math.min(Math.max(page, 0), Math.max(files.length - 1, 0));
  const file = files[index];
  const photo = file?.contentType.startsWith('image/') ?? false;
  // Over the whole screen only a photo, and the height the box left in the
  // page (none for a box that opened over the whole screen).
  const isFull = full && photo;
  const [spacer, setSpacer] = useState(0);
  // The controls under the page, not beside the border's label.
  const below = touch || isFull;

  // The answer framed now: none while the switch is off or it has no area.
  const framed = frames && focus !== null && focus.areas.length > 0 ? focus : null;
  // Every answer has its own key, so a zoom never follows the teacher to the
  // next answer. The key names the answer alone, not whether its border
  // shows: "Arată chenarul" only draws or hides the border, and keeps the zoom
  // and the place of the page in its box.
  const focusKey = `answer:${focus?.key ?? ''}`;
  const [part, setPart] = useState<{ key: string; index: number } | null>(null);
  // The border shown again starts at the first part: the page shown may have
  // changed while it was off, and the arrows must name the part on it.
  const [shownFrames, setShownFrames] = useState(frames);
  if (shownFrames !== frames) {
    setShownFrames(frames);
    if (part !== null) setPart(null);
  }
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
  // The focus goes to "Pe tot ecranul" each time the whole screen opens or
  // closes: with a mouse the button moves between the page and the bar above
  // it (a new element), and the × that closed it goes away.
  // A box that opens over the whole screen (the paper moved) takes it too.
  const refocus = useRef(isFull);
  const closeFull = () => {
    refocus.current = true;
    onFull(false);
  };
  const showFull = (on: boolean) => {
    if (!on) return closeFull();
    refocus.current = true;
    setSpacer(box.current?.getBoundingClientRect().height ?? 0);
    onFull(true);
  };
  const latestClose = useRef(closeFull);
  latestClose.current = closeFull;
  // The page before or after this one; none past the first or the last.
  const step = (delta: number) => {
    const next = index + delta;
    if (next >= 0 && next < files.length) onPage(next);
  };
  const latestStep = useRef(step);
  latestStep.current = step;
  // The box's width in rem: whether its header holds the zoom's buttons.
  // Unknown (0) where nothing is laid out: the buttons stay over the page.
  const [boxWidth, setBoxWidth] = useState(0);
  const hasFile = file !== undefined;
  useLayoutEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver !== 'function') return;
    const measure = () => {
      // Over the whole screen the box is the screen: its width says nothing
      // of the box beside the exercises, which closing it brings back.
      if (element.classList.contains('is-full')) return;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setBoxWidth(element.clientWidth / rem);
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(element);
    return () => watch.disconnect();
  }, [hasFile]);
  // A PDF page closes the whole screen too (below), and the button or arrow
  // that turned to it goes away: the focus goes to the page's own button.
  const wasFull = useRef(isFull);
  useLayoutEffect(() => {
    const closedByPage = wasFull.current && !isFull;
    wasFull.current = isFull;
    if (!refocus.current && !closedByPage) return;
    refocus.current = false;
    const own = box.current?.querySelector<HTMLElement>('.full-toggle') ?? box.current?.querySelector<HTMLElement>('.page-switch-button[aria-current="true"]');
    own?.focus({ preventScroll: true });
  }, [isFull]);
  // A phone turned over the whole screen moves the × between the bar and the
  // header (a new element): a focus left on it goes to the new one.
  const wasNarrow = useRef(narrow);
  useLayoutEffect(() => {
    const turned = wasNarrow.current !== narrow;
    wasNarrow.current = narrow;
    if (!turned || !isFull || (document.activeElement !== null && document.activeElement !== document.body)) return;
    box.current?.querySelector<HTMLElement>('.photo-hide')?.focus({ preventScroll: true });
  }, [narrow, isFull]);
  // An arrow that turned to the first or the last page is off now: the focus
  // goes to the other one, so it is not lost.
  const arrowFocus = useRef<'is-prev' | 'is-next' | null>(null);
  useLayoutEffect(() => {
    const other = arrowFocus.current;
    arrowFocus.current = null;
    if (other) box.current?.querySelector<HTMLElement>(`.page-step.${other}`)?.focus({ preventScroll: true });
  }, [index]);
  const stepArrow = (delta: number) => {
    const next = index + delta;
    if (next === 0 || next === files.length - 1) arrowFocus.current = delta < 0 ? 'is-next' : 'is-prev';
    step(delta);
  };
  // The page's box keeps the same room on its right as the box's padding on
  // its left, its scrollbar included: brand.css takes the scrollbar's width
  // (none while the page fits, or an overlay scrollbar) from the padding.
  useLayoutEffect(() => {
    const scroller = box.current?.querySelector<HTMLElement>('.zoom-scroll');
    if (!scroller) return;
    const gutter = () => scroller.style.setProperty('--scrollbar', `${Math.max(0, scroller.offsetWidth - scroller.clientWidth)}px`);
    gutter();
    if (typeof ResizeObserver !== 'function') return;
    const watch = new ResizeObserver(gutter);
    watch.observe(scroller);
    return () => watch.disconnect();
  }, [photo]);
  // A PDF page closes the whole screen (above): the caller learns it.
  useEffect(() => {
    if (full && file && !photo) onFull(false);
  }, [full, file, photo, onFull]);
  // Over the whole screen Esc brings the box back, before anything else takes
  // it (capture, and marked taken), so the zoom stays as it is. The page under
  // it does not scroll meanwhile.
  useEffect(() => {
    if (!isFull) return;
    const onKey = (event: KeyboardEvent) => {
      // Tab goes round the box's own controls: the buttons under it are out
      // of sight, and Enter on one ("Accept") would act unseen.
      if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        const own = box.current ? [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)] : [];
        const first = own[0];
        const last = own[own.length - 1];
        if (!first || !last) return;
        const inside = event.target instanceof Node && box.current!.contains(event.target);
        const next = !inside ? (event.shiftKey ? last : first) : event.shiftKey && event.target === first ? last : !event.shiftKey && event.target === last ? first : null;
        if (next === null) return;
        event.preventDefault();
        next.focus({ preventScroll: true });
        return;
      }
      if (!isReviewKey(event)) return;
      // A small menu open in the box (the download button's) takes Esc and
      // the arrows first, also when a click left the focus on the page
      // (Safari does not focus a clicked button).
      if (box.current?.querySelector('[aria-expanded="true"]')) return;
      const pressed = event.key.toLowerCase();
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
      if (event.key === 'Escape') {
        event.preventDefault();
        latestClose.current();
      } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && plain) {
        // ← and → turn the pages, like the arrows beside the page.
        event.preventDefault();
        latestStep.current(event.key === 'ArrowLeft' ? -1 : 1);
      } else if ((pressed === 'a' || pressed === 'j' || pressed === 'k') && !event.ctrlKey && !event.metaKey && !event.altKey) {
        // Marked taken: the review's keys leave it alone.
        event.preventDefault();
      }
    };
    document.addEventListener('keydown', onKey, true);
    const root = document.documentElement;
    root.classList.add('has-full-paper');
    return () => {
      document.removeEventListener('keydown', onKey, true);
      root.classList.remove('has-full-paper');
    };
  }, [isFull]);
  const pageNumber = index + 1;
  const placed = useRef<{ focusKey: string; fileKey: string; full: boolean } | null>(null);
  // The watch below lives on between renders: it reads the answer, its
  // border and its part from here, never as they were when it started.
  const latest = useRef({ framed, focus, partIndex, pageNumber });
  latest.current = { framed, focus, partIndex, pageNumber };
  useLayoutEffect(() => {
    // The page scrolls in its own box under the header, over the whole
    // screen and beside the exercises alike.
    const element = box.current?.querySelector<HTMLElement>('.zoom-scroll');
    if (!element) return;
    // The whole screen opened or closed is a new box: the answer comes to its
    // middle.
    const samePage = placed.current !== null && placed.current.focusKey === focusKey && placed.current.fileKey === fileKey && placed.current.full === isFull;
    placed.current = { focusKey, fileKey, full: isFull };
    const place = (reveal: boolean) => {
      if (element.scrollHeight <= element.clientHeight) return;
      const { framed, focus, partIndex, pageNumber } = latest.current;
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
    // Only the answer, its part, the page, the whole screen and a new size
    // move the box: not every render, and not the border shown or hidden.
  }, [focusKey, fileKey, partIndex, isFull]);

  const hide = isFull ? (
    <button
      type="button"
      className="button-quiet button-small icon-button photo-hide"
      aria-label={t('Ieși din ecranul complet')}
      title={t('Ieși din ecranul complet (Esc)')}
      onClick={closeFull}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </button>
  ) : onHide ? (
    <button type="button" className="button-quiet button-small icon-button photo-hide" aria-label={t('Ascunde lucrarea')} title={t('Ascunde lucrarea')} onClick={onHide}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </button>
  ) : null;

  if (!file) {
    return (
      <div className="review-photo is-empty" id={PAPER_PHOTO_ID}>
        {hide && <div className="review-photo-top is-end">{hide}</div>}
        <p className="hint">{t('Elevul nu a încărcat niciun fișier.')}</p>
      </div>
    );
  }
  const url = submissionFileUrl(submission.id, file.id, base);
  const caption = `${tryName(submission.studentName)} · ${index + 1}/${files.length}`;
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
    below && partButtons !== undefined ? (
      <span className="answer-parts is-below-page" role="group" aria-label={t('Părțile răspunsului')}>
        <span className="answer-parts-count">
          {t('{v1} din {parts}', { v1: partIndex + 1, parts })}
        </span>
        {partButtons}
      </span>
    ) : undefined;
  const tools =
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
    ) : undefined;
  // Where the view and the zoom stand. Over the whole screen: in the header,
  // or on a phone in the bar between the header and the page. Beside the
  // exercises: in the header when its one line has the room; else in the bar
  // above the page on a touch screen, and with a mouse over the page's top
  // corners, hung from the header so they stay in sight while the page
  // scrolls under it.
  const roomy = boxWidth >= headWidth({ view: tools !== undefined, pages: files.length, hide: hide !== null });
  const place = !photo ? null : isFull ? (narrow ? 'bar' : 'head') : roomy ? 'head' : touch ? 'bar' : 'float';
  const inHead = place === 'head';
  const groups = (
    <>
      <ViewGroup tools={tools} />
      <ZoomGroup view={view} onView={setView} full={isFull} onFull={showFull} />
    </>
  );
  return (
    <>
      {/* The box's place in the page while it is over the whole screen. */}
      {isFull && <div className="review-photo-spacer" style={{ height: spacer }} aria-hidden="true" />}
      <figure className={isFull ? 'review-photo is-full' : 'review-photo'} id={PAPER_PHOTO_ID} ref={box}>
        <div className={inHead ? 'review-photo-top has-tools' : 'review-photo-top'}>
          <div className="review-photo-start">
            <div className="review-photo-name">
              <figcaption>{caption}</figcaption>
              {/* The page's own file, as the student sent it. */}
              {file && (
                <span className="hint">
                  {file.name} · {formatFileSize(file.size)}
                </span>
              )}
            </div>
            {inHead && <ViewGroup tools={tools} />}
          </div>
          {/* Over the whole screen the × is in the middle of the header; on a
              phone, in the middle of the bar of the view and the zoom, away
              from the page buttons, which may be many. */}
          {isFull && !narrow && hide}
          <div className="review-photo-actions">
            {inHead && <ZoomGroup view={view} onView={setView} full={isFull} onFull={showFull} />}
            <PageDownload submission={submission} page={index} />
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
            {!isFull && hide}
          </div>
          {place === 'float' && (
            <div className="review-photo-float" ref={holdPinch}>
              {groups}
            </div>
          )}
        </div>
        {photo ? (
          <ZoomPhoto
            src={url}
            alt={t('Pagina {v1} a lucrării', { v1: index + 1 })}
            view={view}
            onView={setView}
            foot={footParts}
            full={isFull}
            onFull={showFull}
            buttons={place === 'bar'}
            barMiddle={isFull && narrow ? hide : undefined}
            tools={tools}
          >
            {framed?.areas.map((area, number) =>
              area.page === index + 1 ? (
                <AnswerFrame
                  key={number}
                  view={view}
                  box={area}
                  label={partLabel(number)}
                  parts={!below && number === partIndex ? partButtons : undefined}
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
        {/* Over the whole screen, the previous and the next page beside it,
            out of the page, so a click on one never zooms it. */}
        {isFull && files.length > 1 && (
          <>
            <button
              type="button"
              className="button-quiet icon-button page-step is-prev"
              aria-label={t('Pagina anterioară')}
              title={t('Pagina anterioară (←)')}
              disabled={index === 0}
              onClick={() => stepArrow(-1)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className="button-quiet icon-button page-step is-next"
              aria-label={t('Pagina următoare')}
              title={t('Pagina următoare (→)')}
              disabled={index === files.length - 1}
              onClick={() => stepArrow(1)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}
      </figure>
    </>
  );
}
