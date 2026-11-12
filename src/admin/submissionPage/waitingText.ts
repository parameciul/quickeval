import type { SubmissionDetail } from '../../../shared/api.ts';
import { HELD_BACK_HINT, heldBack } from '../testPage/paperCounts.ts';

// Where an upload without a result is.
export function waitingText(submission: SubmissionDetail): string {
  if (heldBack(submission.status, submission.files.length, submission.testStatus)) return HELD_BACK_HINT;
  if (submission.status === 'uploading') return 'Elevul nu a trimis încă lucrarea.';
  if (submission.status === 'grading') return 'Robotul corectează acum lucrarea.';
  if (submission.testStatus === 'evaluating') return 'Lucrarea așteaptă robotul.';
  return 'Lucrarea se corectează după ce pornești evaluarea.';
}
