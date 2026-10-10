import type { SubmissionFile } from '../../../shared/api.ts';
import { formatFileSize } from '../../ui/format.ts';
import { submissionFileUrl } from '../api.ts';

// A student's pages in upload order, numbered as the robot numbers them:
// photos inline (a click opens them full size, to zoom), PDFs in a frame with
// a link that opens them.
export function PageFiles({ submissionId, files }: { submissionId: number; files: SubmissionFile[] }) {
  if (files.length === 0) return <p className="hint">Elevul nu a încărcat încă niciun fișier.</p>;
  return (
    <ol className="page-files">
      {files.map((file, index) => (
        <PageFile key={file.id} submissionId={submissionId} file={file} number={index + 1} />
      ))}
    </ol>
  );
}

function PageFile({ submissionId, file, number }: { submissionId: number; file: SubmissionFile; number: number }) {
  const url = submissionFileUrl(submissionId, file.id);
  const caption = `Pagina ${number}: ${file.name} · ${formatFileSize(file.size)}`;
  if (file.contentType.startsWith('image/')) {
    return (
      <li>
        <a href={url} target="_blank" rel="noopener">
          <img src={url} alt={`Pagina ${number}`} loading="lazy" />
        </a>
        <p className="hint">{caption}</p>
      </li>
    );
  }
  return (
    <li>
      <iframe className="pdf-frame" src={url} title={`Pagina ${number}`} loading="lazy" />
      <a href={url} target="_blank" rel="noopener">
        Deschide PDF-ul
      </a>
      <p className="hint">{caption}</p>
    </li>
  );
}
