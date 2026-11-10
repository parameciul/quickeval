import { QUICK_TRY_CLEANUP_BATCH } from '../shared/quickTry.ts';
import { deleteTries, expiredTries } from './db/quickTry.ts';
import type { Env } from './env.ts';

// Deletes a few tries whose 7 days are over (spec §5): their R2 files first,
// then their rows. When R2 fails, the rows stay and the next call finds the
// files again. Each try's rows go in their own batch, so a try that cannot be
// deleted keeps only its own rows. Answers how many tries it deleted.
export async function cleanUpTries(env: Env, now: string): Promise<number> {
  const { teacherIds, keys } = await expiredTries(env.DB, now, QUICK_TRY_CLEANUP_BATCH);
  if (teacherIds.length === 0) return 0;
  if (keys.length > 0) await env.FILES.delete(keys);
  const done = await Promise.allSettled(teacherIds.map((id) => deleteTries(env.DB, [id])));
  for (const one of done) {
    if (one.status === 'rejected') console.warn('A Quick Try could not be deleted.', one.reason);
  }
  return done.filter((one) => one.status === 'fulfilled').length;
}
