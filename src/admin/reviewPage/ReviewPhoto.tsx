import type { SubmissionDetail } from '../../../shared/api.ts';
import { submissionFileUrl } from '../api.ts';

// The middle pane of the review: one page of the paper at a time, with the
// page switch. No marks on the photo: the robot does not say where an answer
// is (redesign spec §7, decision 27). A photo opens full size on a click.
export function ReviewPhoto({ submission, page, onPage }: { submission: SubmissionDetail; page: number; onPage: (page: number) => void }) {
  const files = submission.files;
  if (files.length === 0) {
    return (
      <div className="review-photo">
        <p className="hint">Elevul nu a încărcat niciun fișier.</p>
      </div>
    );
  }
  const index = Math.min(Math.max(page, 0), files.length - 1);
  const file = files[index]!;
  const url = submissionFileUrl(submission.id, file.id);
  const caption = `${submission.studentName} · pagina ${index + 1} din ${files.length}`;
  return (
    <figure className="review-photo">
      <div className="review-photo-top">
        <figcaption>{caption}</figcaption>
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
      {file.contentType.startsWith('image/') ? (
        <a href={url} target="_blank" rel="noopener" title="Deschide poza mare">
          <img src={url} alt={`Pagina ${index + 1} a lucrării`} />
        </a>
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
