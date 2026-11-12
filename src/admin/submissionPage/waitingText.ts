import type { SubmissionDetail } from '../../../shared/api.ts';
import { HELD_BACK_HINT, heldBack } from '../testPage/paperCounts.ts';

// Where an upload without a result is. `heldBackText` says why a held-back
// paper waits (`heldBackHint` of the account).
export function waitingText(submission: SubmissionDetail, heldBackText: string = HELD_BACK_HINT): string {
  if (heldBack(submission.status, submission.files.length, submission.testStatus)) return heldBackText;
  if (submission.status === 'uploading') return 'Elevul nu a trimis încă lucrarea.';
  if (submission.status === 'grading') return 'Robotul corectează acum lucrarea.';
  if (submission.testStatus === 'evaluating') return 'Lucrarea așteaptă robotul.';
  return 'Lucrarea se corectează după ce pornești evaluarea.';
}
