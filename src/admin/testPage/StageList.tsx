import { Link } from 'react-router';
import { ActionIcon, type ActionIconName } from '../../ui/ActionIcon.tsx';
import { stageHash, STATE_WORDS, type Stage, type StageName } from '../stages.ts';

// The icon of each stage: the landing page's, so the stages look the same in
// the app.
export const STAGE_ICONS: Record<StageName, ActionIconName> = {
  Pregătire: 'doc',
  Tipărire: 'print',
  'În clasă': 'phone',
  Corectare: 'edit',
  Verificare: 'eye',
  Rezultate: 'link',
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
                <ActionIcon name={STAGE_ICONS[stage.name]} />
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
    <svg className="stage-tick" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5l3 3 6-6.5" />
    </svg>
  );
}
