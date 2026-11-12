import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { formatDateTime, robotStartMessage, uploadStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { PdfActions } from '../pdf/PdfActions.tsx';
import { studentPdf, studentPdfFileName, studentPdfInput } from '../pdf/studentPdf.ts';
import { useSmallMenu } from '../shell/useSmallMenu.ts';
import { heldBack, PAPER_PART_LABEL } from '../testPage/paperCounts.ts';
import { ResultLink } from '../testPage/ResultLink.tsx';

// Recorectează, Resetează and Reîncearcă of the paper page, and the news after
// the first and the last. The test page and the test list count grades and
// items to check: they are read again after each. The list of the year is
// read on every page (the shell): read it again, but do not wait for it.
export function usePaperActions(code: string, submissionId: number) {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const refreshLists = async () => {
    void queryClient.invalidateQueries({ queryKey: ['tests'] });
    await queryClient.invalidateQueries({ queryKey: ['test', code] });
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
  return { reset, regrade, retry, notice };
}

type PaperActions = ReturnType<typeof usePaperActions>;

// The head of the paper page (from the paper's page before it): the student,
// the test and the state, and the times; on the right what the
// teacher takes away (all the student's grades, the PDF) and "Alte acțiuni";
// under it the student's result link, once the upload is sent.
export function PaperHead({ submission, actions }: { submission: SubmissionDetail; actions: PaperActions }) {
  const { regrade, reset } = actions;
  // The student's PDF, only for a graded result.
  const pdfInput = studentPdfInput(submission);
  // Recorectează names the grading the page shows.
  const gradedAt = submission.status === 'graded' ? (submission.evaluation?.gradedAt ?? null) : null;

  const paperActions: PaperAction[] = [];
  if (gradedAt !== null) {
    paperActions.push({
      label: 'Recorectează',
      hint: 'Robotul corectează lucrarea din nou. Punctajele și comentariile schimbate de tine se pierd.',
      busy: regrade.isPending,
      onChoose: () => {
        if (window.confirm(`Recorectezi lucrarea elevului ${submission.studentName}? Corecturile tale se pierd.`)) regrade.mutate(gradedAt);
      },
    });
  }
  paperActions.push({
    label: 'Resetează',
    hint: 'Se șterg fișierele, iar elevul poate lua încărcarea de la capăt, și de pe alt telefon.',
    danger: true,
    busy: reset.isPending,
    onChoose: () => {
      if (window.confirm(`Ștergi încărcarea elevului ${submission.studentName}? Elevul o poate lua de la capăt.`)) reset.mutate(submission.startedAt);
    },
  });

  return (
    <>
      <header className="submission-head">
        <div className="submission-title">
          <h1>{submission.studentName}</h1>
          <p className="submission-sub">
            <span>
              {submission.testCode} · {submission.testTitle} ·{' '}
              {heldBack(submission.status, submission.files.length, submission.testStatus) ? PAPER_PART_LABEL.waiting : uploadStatusLabel(submission.status)}
            </span>
            {submission.autoSubmitted && submission.status !== 'graded' && <span className="tag">Fără confirmare</span>}
          </p>
          <p className="hint">
            Început {formatDateTime(submission.startedAt)}
            {submission.submittedAt && ` · trimis ${formatDateTime(submission.submittedAt)}`}
          </p>
        </div>
        <div className="submission-tools">
          <Link className="button-quiet button-small" to={`/elevi/${submission.studentId}`}>
            Toate notele elevului
          </Link>
          {pdfInput && (
            <PdfActions
              pdf={{
                build: () => studentPdf(pdfInput),
                fileName: studentPdfFileName(pdfInput),
                title: `${pdfInput.testCode} · ${pdfInput.studentName}`,
              }}
            />
          )}
          <PaperActionsMenu actions={paperActions} />
        </div>
      </header>
      {regrade.error && <ErrorMessage error={regrade.error} />}
      {reset.error && <ErrorMessage error={reset.error} />}
      {/* The result link only once the student sent the upload, like the
          uploads table: while uploading there is nothing to share yet. */}
      {submission.status !== 'uploading' && (
        <div className="result-link-row">
          <span className="result-link-label">Linkul cu rezultatul elevului</span>
          <span className={submission.resultsOpen ? 'tag tag-ok' : 'tag'}>
            {submission.resultsOpen ? 'Rezultatele sunt publicate.' : 'Rezultatele nu sunt publicate încă.'}
          </span>
          <ResultLink
            submissionId={submission.id}
            startedAt={submission.startedAt}
            resultToken={submission.resultToken}
            testCode={submission.testCode}
            studentName={submission.studentName}
          />
        </div>
      )}
      {/* The news after Recorectează or Reîncearcă holds only until the result is back. */}
      {actions.notice !== null && (submission.status === 'submitted' || submission.status === 'grading') && <p role="status">{actions.notice}</p>}
    </>
  );
}

type PaperAction = { label: string; hint: string; danger?: boolean; busy: boolean; onChoose: () => void };

// "Alte acțiuni": the rare actions that undo the teacher's work (Recorectează,
// Resetează), in a menu at the top of the page. Each item says what it
// deletes before it is chosen; choosing it still asks for a confirmation.
function PaperActionsMenu({ actions }: { actions: PaperAction[] }) {
  const { open, toggle, box, button } = useSmallMenu<HTMLDivElement>();
  const run = (action: PaperAction) => () => {
    toggle();
    button.current?.focus();
    action.onChoose();
  };
  return (
    <div className="paper-actions" ref={box}>
      <button
        ref={button}
        type="button"
        className="button-quiet button-small"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'paper-actions-menu' : undefined}
        onClick={toggle}
      >
        Alte acțiuni
        <svg className="paper-actions-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="class-menu paper-actions-menu" id="paper-actions-menu" role="menu" aria-label="Alte acțiuni">
          {actions.map((action, index) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={action.danger ? 'paper-action is-danger' : 'paper-action'}
              aria-label={action.label}
              aria-describedby={`paper-action-hint-${index}`}
              disabled={action.busy}
              onClick={run(action)}
            >
              <span className="paper-action-label">{action.label}</span>
              <span className="paper-action-hint" id={`paper-action-hint-${index}`}>
                {action.hint}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
