// An error answer from the API, with its Romanian message. Both apps use it.
import { t } from '../i18n/t.ts';
import { translateMessage } from '../../shared/i18n/messages.ts';
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    // A message of the shared code, checked in the page, in the page's
    // language; the API's own answers come translated already.
    super(translateMessage(message));
    this.status = status;
    this.code = code;
  }
}

export const NETWORK_MESSAGE = t('Nu mă pot conecta la server. Verifică internetul și încearcă din nou.');
export const BAD_RESPONSE_MESSAGE = t('Serverul nu a răspuns corect. Încearcă din nou.');
export const GENERIC_MESSAGE = t('A apărut o eroare. Încearcă din nou.');

// The Romanian text of a failed request; a generic one for errors that did
// not come from the API, so the browser's English text never shows.
export function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : GENERIC_MESSAGE;
}

// Turns a JSON answer into its data, or into an ApiError with the server's message.
export async function readAnswer<T>(res: Response): Promise<T> {
  if (!(res.headers.get('Content-Type') ?? '').includes('application/json')) {
    throw new ApiError(res.status, 'bad_response', BAD_RESPONSE_MESSAGE);
  }
  let data: { error?: string; message?: string };
  try {
    data = (await res.json()) as { error?: string; message?: string };
  } catch {
    throw new ApiError(res.status, 'bad_response', BAD_RESPONSE_MESSAGE);
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message ?? GENERIC_MESSAGE);
  return data as T;
}
