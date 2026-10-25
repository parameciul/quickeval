import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { normalizeTestCode } from '../../../shared/tests.ts';
import { formatDateTime, robotStartMessage, uploadStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { GradedResult } from '../submissionPage/GradedResult.tsx';
import { PageFiles } from '../submissionPage/PageFiles.tsx';
import { PdfActions } from '../pdf/PdfActions.tsx';
import { studentPdf, studentPdfFileName, studentPdfInput } from '../pdf/studentPdf.ts';
import { ResultLink } from '../testPage/ResultLink.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

// While the robot grades the upload, the page asks for news every 10 seconds.
export function resultRefreshInterval(submission: SubmissionDetail | undefined): number | false {
  if (!submission) return false;
  const waits = submission.status === 'grading' || (submission.status === 'submitted' && submission.testStatus === 'evaluating');
  return waits ? 10_000 : false;
}

// /teste/:code/elevi/:submissionId: one student's pages and the graded result
// (spec §14.1). On a wide screen the pages stand left of the result.
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
  // What happened after Recorectează or Reîncearcă.
  const [notice, setNotice] = useState<string | null>(null);
  // The files start hidden, leaving the full width to the result. Opening
  // them always starts the list at the top.
  const [filesOpen, setFilesOpen] = useState(false);
  const filesScroll = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (filesOpen && filesScroll.current) filesScroll.current.scrollTop = 0;
  }, [filesOpen, submissionId]);
  const detail = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => api.getSubmission(submissionId),
    refetchInterval: (query) => resultRefreshInterval(query.state.data),
  });
  // The test page and the test list count grades and items to check.
  const refreshLists = async () => {
    await queryClient.invalidateQueries({ queryKey: ['test', code] });
    await queryClient.invalidateQueries({ queryKey: ['tests'] });
  };
  const saved = async (submission: SubmissionDetail) => {
    queryClient.setQueryData(['submission', submissionId], submission);
    await refreshLists();
  };
  const gradeAgain = async (message: string | null) => {
    setNotice(message);
    await queryClient.invalidateQueries({ queryKey: ['submission', submissionId] });
    await refreshLists();
  };
  // Resetează and Reîncearcă name the upload the page shows (`startedAt`).
  const reset = useMutation({
    mutationFn: (startedAt: string) => api.resetSubmission(submissionId, startedAt),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['submission', submissionId] });
      await refreshLists();
      navigate(`/teste/${code}`);
    },
  });
  const regrade = useMutation({
    mutationFn: (gradedAt: string) => api.regradeSubmission(submissionId, gradedAt),
    onSuccess: (answer) =>
      gradeAgain(answer.robot ? robotStartMessage(answer.robot) : 'Lucrarea se corectează din nou după ce pornești evaluarea.'),
  });
  const retry = useMutation({
    mutationFn: (startedAt: string) => api.retrySubmission(submissionId, startedAt),
    onSuccess: (robot) => gradeAgain(robot ? robotStartMessage(robot) : null),
  });

  if (detail.isPending) return <p>Se încarcă…</p>;
  // A failed refresh keeps the page and says why above it.
  if (detail.data === undefined) return <ErrorMessage error={detail.error} />;
  const submission = detail.data;
  // The address names another test than the upload belongs to.
  if (submission.testCode !== code) return <NotFoundPage />;
  // The news after Recorectează or Reîncearcă holds only until the result is back.
  const showNotice = notice !== null && (submission.status === 'submitted' || submission.status === 'grading');
  // The student's PDF, only for a graded result.
  const pdfInput = studentPdfInput(submission);
  // Recorectează names the grading the page shows.
  const gradedAt = submission.status === 'graded' ? (submission.evaluation?.gradedAt ?? null) : null;

  return (
    <section>
      <p className="back-link">
        <Link to={`/teste/${code}`}>← {code}</Link>
      </p>
      {detail.isRefetchError && <ErrorMessage error={detail.error} />}
      <h1>{submission.studentName}</h1>
      <p>
        <Link to={`/elevi/${submission.studentId}`}>Toate notele elevului</Link>
      </p>
      <p className="lead-line">
        {submission.testCode} · {submission.testTitle} · {uploadStatusLabel(submission.status)}
        {submission.autoSubmitted && submission.status !== 'graded' && <span className="tag">Fără confirmare</span>}
      </p>
      <p className="hint">
        Început {formatDateTime(submission.startedAt)}
        {submission.submittedAt && ` · trimis ${formatDateTime(submission.submittedAt)}`}
      </p>
      {/* The result link only once the student sent the upload, like the
          uploads table: while uploading there is nothing to share yet. */}
      {submission.status !== 'uploading' && (
        <div className="result-link-row hint">
          <span>Linkul cu rezultatul elevului:</span>
          <ResultLink
            submissionId={submission.id}
            startedAt={submission.startedAt}
            resultToken={submission.resultToken}
            testCode={submission.testCode}
            studentName={submission.studentName}
          />
          <span>{submission.resultsOpen ? 'Rezultatele sunt publicate.' : 'Rezultatele nu sunt publicate încă.'}</span>
        </div>
      )}
      {pdfInput && (
        <PdfActions
          pdf={{
            build: () => studentPdf(pdfInput),
            fileName: studentPdfFileName(pdfInput),
            title: `${pdfInput.testCode} · ${pdfInput.studentName}`,
          }}
        />
      )}
      {showNotice && <p role="status">{notice}</p>}

      <div className={filesOpen ? 'result-layout' : 'result-layout is-collapsed'}>
        <div className={filesOpen ? 'result-files' : 'result-files is-collapsed'}>
          <div className="files-head">
            <h2>Fișiere ({submission.files.length})</h2>
            <button
              type="button"
              className="button-quiet button-small"
              aria-expanded={filesOpen}
              onClick={() => setFilesOpen(!filesOpen)}
            >
              {filesOpen ? 'Ascunde fișierele' : 'Arată fișierele'}
            </button>
          </div>
          {filesOpen && (
            <div className="result-files-scroll" ref={filesScroll}>
              <PageFiles submissionId={submissionId} files={submission.files} />
            </div>
          )}
        </div>
        <div className="result-main">
          <h2>Rezultatul</h2>
          {submission.status === 'graded' && submission.evaluation ? (
            <GradedResult submissionId={submissionId} evaluation={submission.evaluation} onSaved={saved} />
          ) : submission.status === 'failed' ? (
            <div className="warning">
              <p>Corectarea a eșuat. {submission.lastError}</p>
              <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate(submission.startedAt)}>
                Reîncearcă
              </button>
              {retry.error && <ErrorMessage error={retry.error} />}
            </div>
          ) : (
            <p className="hint">{waitingText(submission)}</p>
          )}
        </div>
      </div>

      <div className="final-actions">
        {gradedAt !== null && (
          <div className="final-row">
            <button
              type="button"
              className="button-quiet button-small"
              disabled={regrade.isPending}
              onClick={() => {
                if (window.confirm(`Recorectezi lucrarea elevului ${submission.studentName}? Corecturile tale se pierd.`)) regrade.mutate(gradedAt);
              }}
            >
              Recorectează
            </button>
            <p className="hint">Robotul corectează lucrarea din nou. Punctajele și comentariile schimbate de tine se pierd.</p>
            {regrade.error && <ErrorMessage error={regrade.error} />}
          </div>
        )}

        <div className="final-row">
          <button
            type="button"
            className="button-quiet button-small button-danger"
            disabled={reset.isPending}
            onClick={() => {
              if (window.confirm(`Ștergi încărcarea elevului ${submission.studentName}? Elevul o poate lua de la capăt.`)) reset.mutate(submission.startedAt);
            }}
          >
            Resetează
          </button>
          <p className="hint">Se șterg fișierele, iar elevul poate lua încărcarea de la capăt, și de pe alt telefon.</p>
          {reset.error && <ErrorMessage error={reset.error} />}
        </div>
      </div>
    </section>
  );
}

// Where an upload without a result is.
function waitingText(submission: SubmissionDetail): string {
  if (submission.status === 'uploading') return 'Elevul nu a trimis încă lucrarea.';
  if (submission.status === 'grading') return 'Robotul corectează acum lucrarea.';
  if (submission.testStatus === 'evaluating') return 'Lucrarea așteaptă robotul.';
  return 'Lucrarea se corectează după ce pornești evaluarea.';
}
