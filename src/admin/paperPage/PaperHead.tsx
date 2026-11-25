import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { formatDateTime, formatFileSize, robotStartMessage, uploadStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ActionsMenu, type MenuAction } from '../ActionsMenu.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { studentPdf, studentPdfFileName, studentPdfInput } from '../pdf/studentPdf.ts';
import { heldBack, PAPER_PART_LABEL } from '../testPage/paperCounts.ts';
import { FilesNoteLine } from './PageDownload.tsx';
import { totalSize, usePaperFiles } from './paperFiles.ts';
import { ResultMenu } from './ResultMenu.tsx';
import { t } from '../../i18n/t.ts';
import { tryName } from '../../../shared/quickTry.ts';

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
      navigate(`/tests/${code}`);
    },
  });
  const regrade = useMutation({
    mutationFn: (gradedAt: string) => api.regradeSubmission(submissionId, gradedAt),
    onSuccess: (answer) =>
      gradeAgain(answer.robot ? robotStartMessage(answer.robot) : t('Lucrarea se corectează din nou după ce pornești evaluarea.')),
  });
  const retry = useMutation({
    mutationFn: (startedAt: string) => api.retrySubmission(submissionId, startedAt),
    onSuccess: (robot) => gradeAgain(robot ? robotStartMessage(robot) : null),
  });
  return { reset, regrade, retry, notice };
}

type PaperActions = ReturnType<typeof usePaperActions>;

// The head of the paper page: the student, the test and the state, the times
// and a link to all the student's grades; on the right, once the paper is
// graded, "Rezultatul elevului" (the result link and the PDF, with whether the
// result is published), and "Alte acțiuni" (⋯ on a phone). Nothing under the
// head depends on the paper's state, so the page does not move between a
// graded paper and one that is not.
export function PaperHead({ submission, actions }: { submission: SubmissionDetail; actions: PaperActions }) {
  const { regrade, reset } = actions;
  // The student's PDF, only for a graded result.
  const pdfInput = studentPdfInput(submission);
  // Recorectează names the grading the page shows.
  const gradedAt = submission.status === 'graded' ? (submission.evaluation?.gradedAt ?? null) : null;

  // The pages, in every state of the paper: those sent so far while the
  // student still sends, and none to take before the first page.
  const pages = usePaperFiles(submission);
  const count = submission.files.length;
  const size = formatFileSize(totalSize(submission));
  const paperActions: MenuAction[] = [
    {
      label: count === 0 ? t('Descarcă paginile') : t('Descarcă paginile ({count})', { count }),
      hint:
        count === 0
          ? t('Elevul nu a trimis nicio pagină încă.')
          : count === 1
            ? t('Pagina, așa cum a trimis-o elevul · {size}', { size })
            : submission.status === 'uploading'
              ? t('Paginile trimise până acum, într-o arhivă ZIP · {size}', { size })
              : t('Toate paginile, într-o arhivă ZIP · {size}', { size }),
      icon: 'download',
      apart: true,
      busy: count === 0 || pages.note?.kind === 'busy',
      onChoose: () => void pages.saveAll(),
    },
  ];
  if (gradedAt !== null) {
    paperActions.push({
      label: t('Recorectează'),
      hint: t('Robotul corectează lucrarea din nou. Punctajele și comentariile schimbate de tine se pierd.'),
      icon: 'retry',
      busy: regrade.isPending,
      onChoose: () => {
        if (window.confirm(t('Recorectezi lucrarea elevului {studentName}? Corecturile tale se pierd.', { studentName: submission.studentName }))) regrade.mutate(gradedAt);
      },
    });
  }
  paperActions.push({
    label: t('Resetează'),
    hint: t('Se șterg fișierele, iar elevul poate lua încărcarea de la capăt, și de pe alt telefon.'),
    icon: 'trash',
    danger: true,
    busy: reset.isPending,
    onChoose: () => {
      if (window.confirm(t('Ștergi încărcarea elevului {studentName}? Elevul o poate lua de la capăt.', { studentName: submission.studentName }))) reset.mutate(submission.startedAt);
    },
  });

  return (
    <>
      <header className="submission-head">
        <div className="submission-title">
          <h1>{tryName(submission.studentName)}</h1>
          <p className="submission-sub">
            <span>
              {submission.testCode} · {tryName(submission.testTitle)} ·{' '}
              {heldBack(submission.status, submission.files.length, submission.testStatus) ? PAPER_PART_LABEL.waiting : uploadStatusLabel(submission.status)}
            </span>
            {submission.autoSubmitted && submission.status !== 'graded' && <span className="tag">{t('Fără confirmare')}</span>}
          </p>
          <p className="hint">
            {t('Început')}{' '}{formatDateTime(submission.startedAt)}
            {submission.submittedAt && t(' · trimis {formatDateTime}', { formatDateTime: formatDateTime(submission.submittedAt) })}
            {' · '}
            <Link className="submission-grades-link" to={`/students/${submission.studentId}`}>
              {t('Toate notele elevului')}
            </Link>
          </p>
        </div>
        <div className="submission-tools">
          {pdfInput && (
            <ResultMenu
              submission={submission}
              pdf={{
                build: () => studentPdf(pdfInput),
                fileName: studentPdfFileName(pdfInput),
                title: `${pdfInput.testCode} · ${pdfInput.studentName}`,
              }}
            />
          )}
          <ActionsMenu label={t('Alte acțiuni')} menuId="paper-actions-menu" actions={paperActions} compact />
        </div>
      </header>
      <FilesNoteLine note={pages.note} className="paper-files-note" />
      {regrade.error && <ErrorMessage error={regrade.error} />}
      {reset.error && <ErrorMessage error={reset.error} />}
      {/* The news after Recorectează or Reîncearcă holds only until the result is back. */}
      {actions.notice !== null && (submission.status === 'submitted' || submission.status === 'grading') && <p role="status">{actions.notice}</p>}
    </>
  );
}
