import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { RobotSettings, RobotStatus, Settings } from '../../../shared/api.ts';
import { MAX_PARALLEL_AGENTS, type RunSummary } from '../../../shared/runner.ts';
import { countLabel, formatDate, formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { AccountsSection } from '../settingsPage/AccountsSection.tsx';
import { agoText, RobotLine } from '../testPage/RobotLine.tsx';

const PARALLEL_OPTIONS = Array.from({ length: MAX_PARALLEL_AGENTS }, (_, index) => index + 1);
// A page left open reads the robot's state again this often (the robot checks
// every 10 minutes, and the robot line moves on by itself).
const REFRESH_MS = 60_000;

type Tab = 'conturi' | 'corectarea' | 'robotul';
const TABS: { id: Tab; label: string }[] = [
  { id: 'conturi', label: 'Conturi' },
  { id: 'corectarea', label: 'Corectarea' },
  { id: 'robotul', label: 'Robotul' },
];

// The tab in the address: `?tab=corectarea` or `?tab=robotul`; none (or one it
// does not know) is "Conturi".
function tabOf(value: string | null): Tab {
  return value === 'corectarea' || value === 'robotul' ? value : 'conturi';
}

// Setări (redesign spec §11.8), for the administrators only: three tabs, the
// teachers' accounts first (with a red count of those that wait), how the
// robot grades, and the robot's state and key.
export function SettingsPage() {
  const api = useApi();
  const [params, setParams] = useSearchParams();
  const tab = tabOf(params.get('tab'));
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
  const isAdmin = me.data?.role === 'admin';
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
    refetchInterval: REFRESH_MS,
    enabled: isAdmin,
  });
  // On every tab: the count of "Conturi" comes from it.
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api.listAccounts(), enabled: isAdmin });
  const waiting = accounts.data?.filter((account) => account.status === 'pending').length ?? 0;

  if (me.data && !isAdmin) {
    return (
      <section>
        <h1>Setări</h1>
        <p>Doar administratorii au acces la Setări.</p>
      </section>
    );
  }

  const show = (next: Tab) => setParams(next === 'conturi' ? {} : { tab: next }, { replace: true });

  return (
    <section className="settings-page">
      <h1>Setări</h1>
      <p className="settings-sub">Doar administratorii văd această pagină.</p>
      <div className="class-tabs" role="tablist" aria-label="Setări">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`settings-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="settings-panel"
            className="class-tab"
            onClick={() => show(id)}
          >
            {label}
            {id === 'conturi' && waiting > 0 && (
              <>
                {' '}
                <span className="tag tag-urgent settings-count">
                  {waiting} <span className="sr-only">așteaptă aprobarea</span>
                </span>
              </>
            )}
          </button>
        ))}
      </div>
      <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab}`} className="settings-panel">
        {me.isPending && <p>Se încarcă…</p>}
        {isAdmin && tab === 'conturi' && <AccountsSection />}
        {isAdmin && tab !== 'conturi' && (
          <>
            {settings.isPending && <p>Se încarcă…</p>}
            {settings.error && <ErrorMessage error={settings.error} />}
            {settings.data && tab === 'corectarea' && <GradingCard settings={settings.data} />}
            {settings.data && tab === 'robotul' && (
              <>
                <RobotState settings={settings.data} />
                <RobotKey hasKey={settings.data.hasRobotKey} madeAt={settings.data.robotKeyAt} />
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// "Corectarea": one row per setting, with its sentence and its control. Each
// control saves as soon as it changes.
function GradingCard({ settings }: { settings: Settings }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const parallel = useMutation({
    mutationFn: (value: number) => api.updateSettings(value),
    onSuccess: (saved) => queryClient.setQueryData(['settings'], saved),
  });
  const model = useMutation({
    mutationFn: (show: boolean) => api.setShowModelColumn(show),
    onSuccess: (saved) => queryClient.setQueryData(['settings'], saved),
  });

  return (
    <section className="class-card" aria-label="Corectarea">
      <div className="settings-row">
        <div>
          <label htmlFor="parallel">Lucrări corectate deodată</label>
          <p id="parallel-hint">Mai multe lucrări deodată termină mai repede, dar ajung mai repede la limita planului Claude.</p>
        </div>
        <div className="settings-control">
          <select
            id="parallel"
            aria-describedby="parallel-hint"
            value={settings.maxParallelAgents}
            disabled={parallel.isPending}
            onChange={(event) => parallel.mutate(Number(event.target.value))}
          >
            {PARALLEL_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {parallel.isSuccess && <span role="status">Salvat.</span>}
        </div>
      </div>
      {parallel.error && <ErrorMessage error={parallel.error} />}
      <div className="settings-row">
        <div>
          <b id="model-title">Coloana Model</b>
          <p id="model-hint">Arată în tabelul lucrărilor cu ce model a fost corectată fiecare lucrare.</p>
        </div>
        <label className="check-label settings-control">
          <input
            type="checkbox"
            aria-describedby="model-hint"
            checked={settings.showModelColumn}
            disabled={model.isPending}
            onChange={(event) => model.mutate(event.target.checked)}
          />
          Arată coloana Model
        </label>
      </div>
      {model.error && <ErrorMessage error={model.error} />}
    </section>
  );
}

// The key is shown once, right after it is made: only its hash is stored.
function RobotKey({ hasKey, madeAt }: { hasKey: boolean; madeAt: string | null }) {
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
    <section className="class-card" aria-labelledby="robot-key-title">
      <div className="class-card-head">
        <h2 id="robot-key-title">Cheia robotului</h2>
      </div>
      <div className="settings-row">
        <div>
          <b>{hasKey ? 'Robotul are o cheie.' : 'Robotul nu are încă o cheie.'}</b>
          {hasKey && madeAt && <p>Făcută pe {formatDate(madeAt)}.</p>}
        </div>
        <button
          type="button"
          className="button-quiet settings-control"
          disabled={create.isPending}
          onClick={() => {
            if (!hasKey || window.confirm('Faci o cheie nouă? Cheia de acum nu va mai funcționa.')) create.mutate();
          }}
        >
          {hasKey ? 'Fă o cheie nouă' : 'Fă cheia robotului'}
        </button>
      </div>
      {create.error && <ErrorMessage error={create.error} />}
      {key && (
        <div className="warning settings-key">
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
    </section>
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

function modelLine(label: string, model: string | null, effort: string | null): string | null {
  if (!model) return null;
  return effort ? `${label}: ${model}, efort ${effort}` : `${label}: ${model}`;
}

// The model and effort of the latest grading and class analysis.
export function modelLines(models: RobotSettings): string[] {
  return [
    modelLine('Ultima corectare', models.gradingModel, models.gradingEffort),
    modelLine('Ultima analiză a clasei', models.analysisModel, models.analysisEffort),
  ].filter((text): text is string => text !== null);
}

// "Starea robotului": a tag in the head says whether it works now; then
// today's lines.
function RobotState({ settings }: { settings: Settings }) {
  const lastRun = lastRunText(settings.robot);
  return (
    <section className="class-card" aria-labelledby="robot-state-title">
      <div className="class-card-head">
        <h2 id="robot-state-title">Starea robotului</h2>
        {settings.robot.running ? <span className="tag tag-ok">lucrează acum</span> : <span className="tag">nu lucrează acum</span>}
      </div>
      <div className="settings-body">
        <RobotLine lastCheckAt={settings.robot.lastCheckAt} />
        {settings.configuredModel !== null && (
          <p>
            Setat pentru robot: {settings.configuredModel}
            {settings.configuredEffort ? `, efort ${settings.configuredEffort}` : ''}
            {settings.configuredAt ? ` (la ultima verificare, ${agoText(settings.configuredAt, Date.now())})` : ''}
          </p>
        )}
        <p>{lastRun ?? 'Robotul nu a terminat încă nicio rulare.'}</p>
        <p>
          {settings.lastGradedAt
            ? `Ultima lucrare corectată: ${formatDateTime(settings.lastGradedAt)}.`
            : 'Nicio lucrare nu a fost corectată încă.'}
        </p>
        {modelLines(settings.lastModels).map((text) => (
          <p key={text}>{text}</p>
        ))}
        <p className="hint">
          Robotul corectează cu planul Claude prin tokenul din secretul GitHub <code>CLAUDE_CODE_OAUTH_TOKEN</code>. Tokenul ține un an: dacă
          lucrările nu se mai corectează, fă unul nou.
        </p>
      </div>
    </section>
  );
}
