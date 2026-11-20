import type { SubmissionDetail } from '../../../shared/api.ts';
import { HELD_BACK_HINT, heldBack } from '../testPage/paperCounts.ts';
import { t } from '../../i18n/t.ts';

// Where an upload without a result is. `heldBackText` says why a held-back
// paper waits (`heldBackHint` of the account).
export function waitingText(submission: SubmissionDetail, heldBackText: string = HELD_BACK_HINT): string {
  if (heldBack(submission.status, submission.files.length, submission.testStatus)) return heldBackText;
  if (submission.status === 'uploading') return t('Elevul nu a trimis încă lucrarea.');
  if (submission.status === 'grading') return t('Robotul corectează acum lucrarea.');
  if (submission.testStatus === 'evaluating') return t('Lucrarea așteaptă robotul.');
  return t('Lucrarea se corectează după ce pornești evaluarea.');
}
