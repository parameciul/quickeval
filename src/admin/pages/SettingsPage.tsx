import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { RobotStatus, Settings } from '../../../shared/api.ts';
import { MAX_PARALLEL_AGENTS, type RunSummary } from '../../../shared/runner.ts';
import { countLabel, formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { RobotLine } from '../testPage/RobotLine.tsx';

const PARALLEL_OPTIONS = Array.from({ length: MAX_PARALLEL_AGENTS }, (_, index) => index + 1);
// A page left open reads the robot's state again this often (the robot checks
// every 10 minutes, and the robot line moves on by itself).
const REFRESH_MS = 60_000;

// Setări (spec §9): how many uploads the robot grades at the same time, the
// robot's key, and what the robot did last.
export function SettingsPage() {
  const api = useApi();
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings(), refetchInterval: REFRESH_MS });

  return (
    <section>
      <h1>Setări</h1>
      {settings.isPending && <p>Se încarcă…</p>}
      {settings.error && <ErrorMessage error={settings.error} />}
      {settings.data && (
        <>
          <ParallelForm current={settings.data.maxParallelAgents} />
          <RobotKey hasKey={settings.data.hasRobotKey} />
          <RobotState settings={settings.data} />
        </>
      )}
    </section>
  );
}

function ParallelForm({ current }: { current: number }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(current);
  const save = useMutation({
    mutationFn: () => api.updateSettings(value),
    onSuccess: (saved) => queryClient.setQueryData(['settings'], saved),
  });

  return (
    <>
      <h2>Corectarea</h2>
      <form
        className="form-row"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label htmlFor="parallel">Lucrări corectate deodată</label>
        <select id="parallel" value={value} onChange={(event) => setValue(Number(event.target.value))}>
          {PARALLEL_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button className="button button-small" type="submit" disabled={save.isPending}>
          Salvează
        </button>
        {save.isSuccess && <span role="status">Salvat.</span>}
      </form>
      <p className="hint">Mai multe lucrări deodată termină mai repede, dar ajung mai repede la limita planului Claude.</p>
      {save.error && <ErrorMessage error={save.error} />}
    </>
  );
}

// The key is shown once, right after it is made: only its hash is stored.
function RobotKey({ hasKey }: { hasKey: boolean }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const create = useMutation({
    mutationFn: () => api.newRobotKey(),
    onSuccess: async () => {
      setCopied(null);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
  const key = create.data;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(key ?? '');
      setCopied('yes');
    } catch {
      setCopied('failed');
    }
  };

  return (
    <>
      <h2>Cheia robotului</h2>
      <p>{hasKey ? 'Robotul are o cheie.' : 'Robotul nu are încă o cheie.'}</p>
      <button
        type="button"
        className="button-quiet"
        disabled={create.isPending}
        onClick={() => {
          if (!hasKey || window.confirm('Faci o cheie nouă? Cheia de acum nu va mai funcționa.')) create.mutate();
        }}
      >
        {hasKey ? 'Fă o cheie nouă' : 'Fă cheia robotului'}
      </button>
      {create.error && <ErrorMessage error={create.error} />}
      {key && (
        <div className="warning">
          <p>
            Copiaz-o acum în GitHub, în secretul <code>QUICKEVAL_RUNNER_KEY</code>. După ce pleci de pe pagină, nu o mai vezi.
          </p>
          <div className="form-row">
            <label className="sr-only" htmlFor="robot-key">
              Cheia nouă a robotului
            </label>
            <input id="robot-key" type="text" value={key} readOnly onFocus={(event) => event.target.select()} />
            <button type="button" className="button button-small" onClick={copy}>
              Copiază cheia
            </button>
            {copied === 'yes' && <span role="status">Copiat!</span>}
            {copied === 'failed' && <span role="status">Nu am putut copia. Selectează cheia și copiaz-o de mână.</span>}
          </div>
        </div>
      )}
    </>
  );
}

const STOP: Record<RunSummary['stop'], string> = {
  done: 'A terminat toată munca.',
  budget: 'S-a oprit după 2 ore. Restul lucrărilor așteaptă până pornește robotul din nou.',
  usage_limit: 'S-a oprit la limita planului Claude; continuă mai târziu.',
  lease_lost: 'S-a oprit pentru că a pornit altă rulare.',
  claude_login: 'S-a oprit pentru că tokenul Claude nu mai merge. Fă un token nou (vezi mai jos).',
  error: 'S-a oprit din cauza unei erori. Detaliile sunt în rularea de pe GitHub.',
};

// "Ultima rulare s-a încheiat la …: 1 listă de exerciții, 25 de lucrări corectate, 0 lucrări eșuate."
export function lastRunText(robot: RobotStatus): string | null {
  const summary = robot.lastRunSummary;
  if (!robot.lastRunFinishedAt || !summary) return null;
  const parts = [
    countLabel(summary.exerciseLists, 'listă de exerciții', 'liste de exerciții'),
    countLabel(summary.graded, 'lucrare corectată', 'lucrări corectate'),
    countLabel(summary.failed, 'lucrare eșuată', 'lucrări eșuate'),
  ];
  if (summary.analyses > 0) parts.push(countLabel(summary.analyses, 'analiză de clasă', 'analize de clasă'));
  return `Ultima rulare s-a încheiat la ${formatDateTime(robot.lastRunFinishedAt)}: ${parts.join(', ')}. ${STOP[summary.stop]}`;
}

function RobotState({ settings }: { settings: Settings }) {
  const lastRun = lastRunText(settings.robot);
  return (
    <>
      <h2>Starea robotului</h2>
      {settings.robot.running && <p>Robotul lucrează acum.</p>}
      <RobotLine lastCheckAt={settings.robot.lastCheckAt} />
      <p>{lastRun ?? 'Robotul nu a terminat încă nicio rulare.'}</p>
      <p>
        {settings.lastGradedAt
          ? `Ultima lucrare corectată: ${formatDateTime(settings.lastGradedAt)}.`
          : 'Nicio lucrare nu a fost corectată încă.'}
      </p>
      <p className="hint">
        Robotul corectează cu planul Claude prin tokenul din secretul GitHub <code>CLAUDE_CODE_OAUTH_TOKEN</code>. Tokenul ține un an: dacă
        lucrările nu se mai corectează, fă unul nou.
      </p>
    </>
  );
}
