import type { ClaudeOutcome, ClaudeRunner } from './claude.ts';
import { log } from './log.ts';

// The Quick Try robot's two Claude accounts (spec: the backup account). It asks
// the main account first. When the main account answers at its plan's limit
// (usage_limit) or refuses its token (not_logged_in), the same task runs again
// at once on the backup account, a second subscription, and the run stays on
// the backup to its end: the main account is asked again only by the next run.
// Without a backup, the main account's outcome is the answer. The teachers'
// robot never uses this: the backup does Quick Try work only.

const CHANGES_ACCOUNT = new Set(['usage_limit', 'not_logged_in']);

// The backup account's runner: every answer it wrote says so, for the usage
// statistics. Also the one account of a run that has only the backup token.
export function backupRunner(backup: ClaudeRunner): ClaudeRunner {
  return async (task): Promise<ClaudeOutcome> => {
    const outcome = await backup(task);
    return outcome.ok ? { ...outcome, backup: true } : outcome;
  };
}

export function failoverRunner(primary: ClaudeRunner, backup: ClaudeRunner | null): ClaudeRunner {
  if (!backup) return primary;
  let usingBackup = false;
  const onBackup = backupRunner(backup);
  return async (task) => {
    if (usingBackup) return onBackup(task);
    const outcome = await primary(task);
    if (outcome.ok || !CHANGES_ACCOUNT.has(outcome.problem)) return outcome;
    if (!usingBackup) {
      usingBackup = true;
      log('claude account', { account: 'backup', reason: outcome.problem });
    }
    return onBackup(task);
  };
}
