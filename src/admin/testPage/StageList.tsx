import { Link } from 'react-router';
import { stageHash, type Stage, type StageName, type StageState } from '../stages.ts';

// What the dot of a stage says, for a screen reader.
const STATE_WORDS: Record<StageState, string> = {
  done: 'gata',
  wait: 'te așteaptă',
  now: 'în lucru',
  later: 'urmează',
};

// The six stages of the test page as a vertical list (redesign spec §6): a dot
// per stage, its name, and its note. Each stage is a link to its panel, kept in
// the address without a new step in the history; the chosen one is marked.
export function StageList({ stages, chosen }: { stages: Stage[]; chosen: StageName }) {
  return (
    <nav className="stage-list" aria-label="Etapele testului">
      <ol>
        {stages.map((stage) => (
          <li key={stage.name} className={`is-${stage.state}`}>
            <Link to={{ hash: stageHash(stage.name) }} replace aria-current={stage.name === chosen ? 'step' : undefined}>
              <span className="stage-dot" aria-hidden="true">
                {stage.state === 'done' && <TickIcon />}
              </span>
              <span className="stage-name">{stage.name}</span>{' '}
              <span className="stage-note">
                {stage.note === '' ? (
                  STATE_WORDS[stage.state]
                ) : (
                  <>
                    <span className="sr-only">{STATE_WORDS[stage.state]}:</span> {stage.note}
                  </>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function TickIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5l3 3 6-6.5" />
    </svg>
  );
}
