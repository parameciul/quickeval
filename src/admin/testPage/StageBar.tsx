import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { STATE_WORDS, type Stage, type StageName } from '../stages.ts';
import { MoveOnLink } from './MoveOnLink.tsx';

const NEXT: Partial<Record<StageName, StageName>> = {
  Pregătire: 'Tipărire',
  Tipărire: 'În clasă',
  'În clasă': 'Corectare',
  Corectare: 'Verificare',
  Verificare: 'Rezultate',
};

// The stage the bar leads to; none after the last.
export function nextStageName(chosen: StageName): StageName | undefined {
  return NEXT[chosen];
}

// The bar at the foot of the test page (design A, bar C2): the stage on show,
// what waits in the next one, and one small button into it. It sticks to the
// bottom of the window while the page is longer than the window, so the next
// stage never needs a scroll to the end. The button is a quiet outline, so it
// never competes with the main action of the panel above, and filled orange
// when the next stage waits on the teacher (as in "De făcut").
export function StageBar({ stages, chosen }: { stages: Stage[]; chosen: StageName }) {
  const next = nextStageName(chosen);
  if (!next) return null;
  const here = stages.find((stage) => stage.name === chosen);
  const ahead = stages.find((stage) => stage.name === next);
  if (!here || !ahead) return null;
  const waits = ahead.state === 'wait';
  return (
    <nav className="stage-bar" aria-label="Etapa următoare">
      <span className={here.state === 'done' ? 'stage-bar-state is-done' : 'stage-bar-state'}>
        <span className="stage-bar-mark" aria-hidden="true">
          {here.state === 'done' && <ActionIcon name="check" />}
        </span>
        <span>
          {chosen} · {STATE_WORDS[here.state]}
        </span>
      </span>
      {waits && ahead.note !== '' && <span className="stage-bar-wait">{ahead.note}</span>}
      <MoveOnLink stage={next} className={waits ? 'button button-small button-wait' : 'button-quiet button-small'}>
        {next === 'În clasă' ? 'Mergi la etapa În clasă' : `Mergi la ${next}`}
        <ActionIcon name="arrow" />
      </MoveOnLink>
    </nav>
  );
}
