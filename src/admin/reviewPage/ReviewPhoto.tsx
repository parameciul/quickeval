import { useState } from 'react';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { submissionFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { isZoomed, WHOLE_PAGE, type ZoomView } from './zoom.ts';
import { ZoomPhoto } from './ZoomPhoto.tsx';

// The middle pane of the review: one page of the paper at a time, with the
// page switch. A photo zooms inside the pane (ZoomPhoto); "Toată pagina", a
// right click or Esc shows the whole page again. A PDF shows in a frame.
export function ReviewPhoto({ submission, page, onPage }: { submission: SubmissionDetail; page: number; onPage: (page: number) => void }) {
  const { base } = useApi();
  const files = submission.files;
  const index = Math.min(Math.max(page, 0), Math.max(files.length - 1, 0));
  const file = files[index];
  // The zoom of the page shown: another page opens whole.
  const zoomKey = `${submission.id}:${file?.id ?? ''}`;
  const [zoom, setZoom] = useState<{ key: string; view: ZoomView } | null>(null);
  const view = zoom?.key === zoomKey ? zoom.view : WHOLE_PAGE;
  const setView = (next: ZoomView) => setZoom({ key: zoomKey, view: next });

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
  return (
    <figure className="review-photo">
      <div className="review-photo-top">
        <figcaption>{caption}</figcaption>
        {photo && isZoomed(view) && (
          <button type="button" className="button-quiet button-small" onClick={() => setView(WHOLE_PAGE)}>
            Toată pagina
          </button>
        )}
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
      </div>
      {photo ? (
        <ZoomPhoto src={url} alt={`Pagina ${index + 1} a lucrării`} view={view} onView={setView} />
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
