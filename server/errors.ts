import type { ContentfulStatusCode } from 'hono/utils/http-status';

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

export function isUniqueViolation(err: unknown): boolean {
  return /UNIQUE constraint failed/i.test(String(err instanceof Error ? err.message : err));
}
