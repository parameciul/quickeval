import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import type { SubmissionFile } from '../../../shared/api.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { normalizeTestCode } from '../../../shared/tests.ts';
import { formatDateTime, formatFileSize, uploadStatusLabel } from '../../ui/format.ts';
import { submissionFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

// /teste/:code/elevi/:submissionId: one student's pages, in upload order.
// Plan 4 adds the graded result next to them.
export function SubmissionPage() {
  const params = useParams();
  const code = normalizeTestCode(params.code ?? '');
  const submissionId = parsePositiveId(params.submissionId);
  if (code === null || submissionId === null) return <NotFoundPage />;
  return <SubmissionDetails key={submissionId} code={code} submissionId={submissionId} />;
}

function SubmissionDetails({ code, submissionId }: { code: string; submissionId: number }) {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['submission', submissionId], queryFn: () => api.getSubmission(submissionId) });
  const reset = useMutation({
    mutationFn: () => api.resetSubmission(submissionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['test', code] });
      navigate(`/teste/${code}`);
    },
  });

  if (detail.isPending) return <p>Se încarcă…</p>;
  if (detail.error) return <ErrorMessage error={detail.error} />;
  const submission = detail.data;
  // The address names another test than the upload belongs to.
  if (submission.testCode !== code) return <NotFoundPage />;

  return (
    <section>
      <p>
        <Link to={`/teste/${code}`}>← {code}</Link>
      </p>
      <h1>{submission.studentName}</h1>
      <p className="lead-line">
        {submission.testCode} · {submission.testTitle} · {uploadStatusLabel(submission.status)}
        {submission.autoSubmitted && <span className="tag">Fără confirmare</span>}
      </p>
      <p className="hint">
        Început {formatDateTime(submission.startedAt)}
        {submission.submittedAt && ` · trimis ${formatDateTime(submission.submittedAt)}`}
      </p>

      <h2>Fișiere ({submission.files.length})</h2>
      {submission.files.length === 0 ? (
        <p className="hint">Elevul nu a încărcat încă niciun fișier.</p>
      ) : (
        <ol className="page-files">
          {submission.files.map((file, index) => (
            <PageFile key={file.id} submissionId={submissionId} file={file} number={index + 1} />
          ))}
        </ol>
      )}

      <h2>Resetează încărcarea</h2>
      <p className="hint">Se șterg fișierele, iar elevul poate lua încărcarea de la capăt, și de pe alt telefon.</p>
      <button
        type="button"
        className="button-quiet button-danger"
        disabled={reset.isPending}
        onClick={() => {
          if (window.confirm(`Ștergi încărcarea elevului ${submission.studentName}? Elevul o poate lua de la capăt.`)) reset.mutate();
        }}
      >
        Resetează
      </button>
      {reset.error && <ErrorMessage error={reset.error} />}
    </section>
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
      <a href={url} target="_blank" rel="noopener">
        Deschide PDF-ul
      </a>
      <p className="hint">{caption}</p>
    </li>
  );
}
