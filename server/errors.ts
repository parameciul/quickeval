import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { DEMO_TEST_LIMIT } from '../shared/accounts.ts';

// An error the API reports to the browser as { error, message } with this status.
// The message is Romanian text the teacher or student can read.
export class ApiError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;

  constructor(status: ContentfulStatusCode, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFound(): ApiError {
  return new ApiError(404, 'not_found', 'Nu am găsit ce cauți.');
}

// The teacher may not change a result while the robot grades the upload
// again, nor a result that a regrade replaced after the page was opened.
export function notGraded(): ApiError {
  return new ApiError(409, 'not_graded', 'Lucrarea se corectează din nou. Reîncarcă pagina.');
}

// A page opened before its upload was reset names an upload that is gone;
// the id may belong to a new upload of another student by now.
export function uploadChanged(): ApiError {
  return new ApiError(409, 'upload_changed', 'Încărcarea s-a schimbat. Reîncarcă pagina.');
}

// A demo account used all its evaluations (a regrade counts as one too).
export function demoLimit(): ApiError {
  return new ApiError(
    403,
    'demo_limit',
    `Contul demo poate trimite teste la evaluare de cel mult ${DEMO_TEST_LIMIT} ori, cu tot cu recorectări. Cere unui administrator să-ți facă un cont complet.`,
  );
}

export function isUniqueViolation(err: unknown): boolean {
  return /UNIQUE constraint failed/i.test(String(err instanceof Error ? err.message : err));
}
