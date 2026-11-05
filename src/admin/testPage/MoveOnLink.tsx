import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { stageHash, type StageName } from '../stages.ts';

// The navigation state of a link inside a panel that opens another stage.
const MOVED_ON = { movedOn: true };

// A link inside a stage's panel that opens the panel of another stage
// ("Următoarea etapă", "Înlocuiește baremul"). It marks its navigation, so
// StagePanel then shows the top of the new panel and gives its heading the
// focus. A click with Ctrl or Shift opens a new tab and does not navigate
// here, so it marks nothing.
export function MoveOnLink({ stage, className, children }: { stage: StageName; className?: string; children: ReactNode }) {
  return (
    <Link className={className} to={{ hash: stageHash(stage) }} replace state={MOVED_ON}>
      {children}
    </Link>
  );
}

// Whether a navigation came from a MoveOnLink.
export function isMoveOn(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'movedOn' in state && state.movedOn === true;
}
