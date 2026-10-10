import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { normalizeTestCode } from '../../../shared/tests.ts';
import { formatDateTime, robotStartMessage, uploadStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { GradedResult } from '../submissionPage/GradedResult.tsx';
import { PageFiles } from '../submissionPage/PageFiles.tsx';
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
  const reset = useMutation({
    mutationFn: () => api.resetSubmission(submissionId),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['submission', submissionId] });
      await refreshLists();
      navigate(`/teste/${code}`);
    },
  });
  const regrade = useMutation({
    mutationFn: () => api.regradeSubmission(submissionId),
    onSuccess: (answer) =>
      gradeAgain(answer.robot ? robotStartMessage(answer.robot) : 'Lucrarea se corectează din nou după ce pornești evaluarea.'),
  });
  const retry = useMutation({
    mutationFn: () => api.retrySubmission(submissionId),
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

  return (
    <section>
      <p>
        <Link to={`/teste/${code}`}>← {code}</Link>
      </p>
      {detail.isRefetchError && <ErrorMessage error={detail.error} />}
      <h1>{submission.studentName}</h1>
      <p>
        <Link to={`/elevi/${submission.studentId}`}>Toate notele elevului</Link>
      </p>
      <p className="lead-line">
        {submission.testCode} · {submission.testTitle} · {uploadStatusLabel(submission.status)}
        {submission.autoSubmitted && <span className="tag">Fără confirmare</span>}
      </p>
      <p className="hint">
        Început {formatDateTime(submission.startedAt)}
        {submission.submittedAt && ` · trimis ${formatDateTime(submission.submittedAt)}`}
      </p>
      {showNotice && <p role="status">{notice}</p>}

      <div className="result-layout">
        <div className="result-files">
          <h2>Fișiere ({submission.files.length})</h2>
          <PageFiles submissionId={submissionId} files={submission.files} />
        </div>
        <div>
          <h2>Rezultatul</h2>
          {submission.status === 'graded' && submission.evaluation ? (
            <GradedResult submissionId={submissionId} evaluation={submission.evaluation} onSaved={saved} />
          ) : submission.status === 'failed' ? (
            <div className="warning">
              <p>Corectarea a eșuat. {submission.lastError}</p>
              <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate()}>
                Reîncearcă
              </button>
              {retry.error && <ErrorMessage error={retry.error} />}
            </div>
          ) : (
            <p className="hint">{waitingText(submission)}</p>
          )}
        </div>
      </div>

      {submission.status === 'graded' && (
        <>
          <h2>Recorectează</h2>
          <p className="hint">Robotul corectează lucrarea din nou. Punctajele și comentariile schimbate de tine se pierd.</p>
          <button
            type="button"
            className="button-quiet"
            disabled={regrade.isPending}
            onClick={() => {
              if (window.confirm(`Recorectezi lucrarea elevului ${submission.studentName}? Corecturile tale se pierd.`)) regrade.mutate();
            }}
          >
            Recorectează
          </button>
          {regrade.error && <ErrorMessage error={regrade.error} />}
        </>
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

// Where an upload without a result is.
function waitingText(submission: SubmissionDetail): string {
  if (submission.status === 'uploading') return 'Elevul nu a trimis încă lucrarea.';
  if (submission.status === 'grading') return 'Robotul corectează acum lucrarea.';
  if (submission.testStatus === 'evaluating') return 'Lucrarea așteaptă robotul.';
  return 'Lucrarea se corectează după ce pornești evaluarea.';
}
