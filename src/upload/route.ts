import { isResultToken, isUploadToken } from '../../shared/tests.ts';

export type StudentRoute = { kind: 'upload'; token: string | null } | { kind: 'result'; resultToken: string | null };

// /u/<token>: the token is the second part of the path.
// /u/result/<resultToken>: one student's result page. Its first address,
// /u/rezultat/<resultToken>, is in the QR code of tickets that students
// saved and printed, so it opens the same page for ever.
const RESULT_PARTS = ['result', 'rezultat'];

export function routeOf(pathname: string): StudentRoute {
  const parts = pathname.split('/');
  if (RESULT_PARTS.includes(parts[2] ?? '')) {
    return { kind: 'result', resultToken: parts[3] && isResultToken(parts[3]) ? parts[3] : null };
  }
  const token = parts[2] ?? '';
  return { kind: 'upload', token: isUploadToken(token) ? token : null };
}
