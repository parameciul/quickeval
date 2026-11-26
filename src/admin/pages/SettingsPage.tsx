import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { RobotSettings, RobotStatus, Settings } from '../../../shared/api.ts';
import { MAX_PARALLEL_AGENTS, MAX_PARALLEL_TRIES, type RunSummary } from '../../../shared/runner.ts';
import { countLabel, formatDate, formatDateTime } from '../../ui/format.ts';
import { onTabKeyDown } from '../../ui/tabKeys.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { AccountsSection } from '../settingsPage/AccountsSection.tsx';
import { UsageSection } from '../settingsPage/UsageSection.tsx';
import { agoText, RobotLine, robotLine } from '../testPage/RobotLine.tsx';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { takeEndedName } from '../shell/viewing.ts';
import { t } from '../../i18n/t.ts';

const PARALLEL_OPTIONS = Array.from({ length: MAX_PARALLEL_AGENTS }, (_, index) => index + 1);
const TRIES_OPTIONS = Array.from({ length: MAX_PARALLEL_TRIES }, (_, index) => index + 1);
// A page left open reads the robot's state again this often (the robot checks
// every 10 minutes, and the robot line moves on by itself).
const REFRESH_MS = 60_000;

type Tab = 'accounts' | 'grading' | 'robot' | 'stats';
const TABS: { id: Tab; label: string }[] = [
  { id: 'accounts', label: t('Conturi') },
  { id: 'grading', label: t('Corectarea') },
  { id: 'robot', label: t('Robotul') },
  { id: 'stats', label: t('Statistici') },
];
const TAB_IDS = TABS.map(({ id }) => id);

// The tab in the address: `?tab=grading`, `?tab=robot` or `?tab=stats`; none
// (or one it does not know) is "Conturi".
function tabOf(value: string | null): Tab {
  return value === 'grading' || value === 'robot' || value === 'stats' ? value : 'accounts';
}

// Setări (redesign spec §11.8), for the administrators only: four tabs, the
// teachers' accounts first (with a red count of those that wait), how the
// robot grades, the robot's state and key, and the usage statistics. The
// panels stay drawn (the others hidden), so a new key or password shown once,
// or a statistic made, survives a look at another tab.
export function SettingsPage() {
  const api = useApi();
  const [params, setParams] = useSearchParams();
  const tab = tabOf(params.get('tab'));
  // Read once: the key is gone after it, so the notice shows for this visit only.
  const [endedName] = useState(takeEndedName);
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
        <h1>{t('Setări')}</h1>
        {endedName !== null && <p role="status">{t('Vizualizarea contului lui {name} s-a încheiat.', { name: endedName })}</p>}
        <p>{t('Doar administratorii au acces la Setări.')}</p>
      </section>
    );
  }

  const show = (next: Tab) => setParams(next === 'accounts' ? {} : { tab: next }, { replace: true });

  return (
    <section className="settings-page">
      <h1>{t('Setări')}</h1>
      {endedName !== null && <p role="status">{t('Vizualizarea contului lui {name} s-a încheiat.', { name: endedName })}</p>}
      <p className="settings-sub">{t('Doar administratorii văd această pagină.')}</p>
      <div
        className="class-tabs"
        role="tablist"
        aria-label={t('Setări')}
        onKeyDown={(event) => onTabKeyDown(event, TAB_IDS, tab, show, (id) => `settings-tab-${id}`)}
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`settings-tab-${id}`}
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            aria-controls={`settings-panel-${id}`}
            className="class-tab"
            onClick={() => show(id)}
          >
            {label}
            {id === 'accounts' && waiting > 0 && (
              <>
                {' '}
                <span className="tag tag-urgent settings-count">
                  {waiting} <span className="sr-only">{t('așteaptă aprobarea')}</span>
                </span>
              </>
            )}
          </button>
        ))}
      </div>
      {me.isPending && <p>{t('Se încarcă…')}</p>}
      {TABS.map(({ id }) => (
        <div
          key={id}
          id={`settings-panel-${id}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${id}`}
          className="settings-panel"
          hidden={tab !== id}
        >
          {isAdmin && id === 'accounts' && <AccountsSection />}
          {isAdmin && id === 'stats' && <UsageSection />}
          {isAdmin && (id === 'grading' || id === 'robot') && (
            <>
              {settings.isPending && <p>{t('Se încarcă…')}</p>}
              {settings.error && <ErrorMessage error={settings.error} />}
              {settings.data && id === 'grading' && <GradingCard settings={settings.data} />}
              {settings.data && id === 'robot' && (
                <>
                  <RobotState settings={settings.data} />
                  <RobotKey hasKey={settings.data.hasRobotKey} madeAt={settings.data.robotKeyAt} />
                </>
              )}
            </>
          )}
        </div>
      ))}
    </section>
  );
}

// "Corectarea": one row per setting, with its sentence and its control. Each
// control saves as soon as it changes: it shows the new value at once and
// stays on while it saves (a control turned off loses the keyboard's focus);
// a refusal puts back the value that was saved.
function useSettingSave<Value>(save: (value: Value) => Promise<Settings>, change: (settings: Settings, value: Value) => Settings) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: save,
    onMutate: (value: Value) => {
      const before = queryClient.getQueryData<Settings>(['settings']);
      if (before) queryClient.setQueryData(['settings'], change(before, value));
      return { before };
    },
    onError: (_error, _value, context) => {
      if (context?.before) queryClient.setQueryData(['settings'], context.before);
    },
    onSuccess: (saved) => queryClient.setQueryData(['settings'], saved),
  });
}

function GradingCard({ settings }: { settings: Settings }) {
  const api = useApi();
  const parallel = useSettingSave(
    (value: number) => api.updateSettings(value),
    (before, value) => ({ ...before, maxParallelAgents: value }),
  );
  const tries = useSettingSave(
    (value: number) => api.setMaxParallelTries(value),
    (before, value) => ({ ...before, maxParallelTries: value }),
  );
  const model = useSettingSave(
    (show: boolean) => api.setShowModelColumn(show),
    (before, show) => ({ ...before, showModelColumn: show }),
  );

  return (
    <section className="class-card" aria-label={t('Corectarea')}>
      <div className="settings-row">
        <div>
          <label htmlFor="parallel">{t('Lucrări corectate deodată')}</label>
          <p id="parallel-hint">{t('Mai multe lucrări deodată termină mai repede, dar ajung mai repede la limita planului Claude.')}</p>
        </div>
        <div className="settings-control">
          <select
            id="parallel"
            aria-describedby="parallel-hint"
            value={settings.maxParallelAgents}
            aria-busy={parallel.isPending}
            onChange={(event) => parallel.mutate(Number(event.target.value))}
          >
            {PARALLEL_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {parallel.isSuccess && <span role="status">{t('Salvat.')}</span>}
        </div>
      </div>
      {parallel.error && <ErrorMessage error={parallel.error} />}
      <div className="settings-row">
        <div>
          <label htmlFor="parallel-tries">{t('Încercări rapide deodată')}</label>
          <p id="parallel-tries-hint">
            {t('Câte încercări rapide face robotul lor în același timp. Mai multe deodată răspund mai repede, dar ajung mai repede la limita planului Claude.')}
          </p>
        </div>
        <div className="settings-control">
          <select
            id="parallel-tries"
            aria-describedby="parallel-tries-hint"
            value={settings.maxParallelTries}
            aria-busy={tries.isPending}
            onChange={(event) => tries.mutate(Number(event.target.value))}
          >
            {TRIES_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {tries.isSuccess && <span role="status">{t('Salvat.')}</span>}
        </div>
      </div>
      {tries.error && <ErrorMessage error={tries.error} />}
      <div className="settings-row">
        <div>
          <b id="model-title">{t('Coloana Model')}</b>
          <p id="model-hint">{t('Arată în tabelul lucrărilor cu ce model a fost corectată fiecare lucrare.')}</p>
        </div>
        <label className="check-label settings-control">
          <input
            type="checkbox"
            aria-describedby="model-hint"
            checked={settings.showModelColumn}
            aria-busy={model.isPending}
            onChange={(event) => model.mutate(event.target.checked)}
          />
          {t('Arată coloana Model')}
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
        <h2 id="robot-key-title">{t('Cheia robotului')}</h2>
      </div>
      <div className="settings-row">
        <div>
          <b>{hasKey ? t('Robotul are o cheie.') : t('Robotul nu are încă o cheie.')}</b>
          {hasKey && madeAt && <p>{t('Făcută pe {formatDate}.', { formatDate: formatDate(madeAt) })}</p>}
        </div>
        <button
          type="button"
          className="button-quiet settings-control"
          disabled={create.isPending}
          onClick={() => {
            if (!hasKey || window.confirm(t('Faci o cheie nouă? Cheia de acum nu va mai funcționa.'))) create.mutate();
          }}
        >
          <ActionIcon name="key" />
          {hasKey ? t('Fă o cheie nouă') : t('Fă cheia robotului')}
        </button>
      </div>
      {create.error && <ErrorMessage error={create.error} />}
      {key && (
        <div className="warning settings-key">
          <p>
            {t('Copiaz-o acum în GitHub, în secretul')}{' '}<code>{t('QUICKEVAL_RUNNER_KEY')}</code>{t('. După ce pleci de pe pagină, nu o mai vezi.')}
          </p>
          <div className="form-row">
            <label className="sr-only" htmlFor="robot-key">
              {t('Cheia nouă a robotului')}
            </label>
            <input id="robot-key" type="text" value={key} readOnly onFocus={(event) => event.target.select()} />
            <button type="button" className="button button-small" onClick={copy}>
              <ActionIcon name="copy" />
              {t('Copiază cheia')}
            </button>
            {copied === 'yes' && <span role="status">{t('Copiat!')}</span>}
            {copied === 'failed' && <span role="status">{t('Nu am putut copia. Selectează cheia și copiaz-o de mână.')}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

const STOP: Record<RunSummary['stop'], string> = {
  done: t('A terminat toată munca.'),
  budget: t('S-a oprit după 2 ore. Restul lucrărilor așteaptă până pornește robotul din nou.'),
  usage_limit: t('S-a oprit la limita planului Claude; continuă mai târziu.'),
  lease_lost: t('S-a oprit pentru că a pornit altă rulare.'),
  claude_login: t('S-a oprit pentru că tokenul Claude nu mai merge. Fă un token nou (vezi mai jos).'),
  error: t('S-a oprit din cauza unei erori. Detaliile sunt în rularea de pe GitHub.'),
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
  return t('Ultima rulare s-a încheiat la {formatDateTime}: {join}. {v3}', { formatDateTime: formatDateTime(robot.lastRunFinishedAt), join: parts.join(', '), v3: STOP[summary.stop] });
}

function modelLine(label: string, model: string | null, effort: string | null): string | null {
  if (!model) return null;
  return effort ? t('{label}: {model}, efort {effort}', { label, model, effort }) : `${label}: ${model}`;
}

// The model and effort of the latest grading and class analysis.
export function modelLines(models: RobotSettings): string[] {
  return [
    modelLine(t('Ultima corectare'), models.gradingModel, models.gradingEffort),
    modelLine(t('Ultima analiză a clasei'), models.analysisModel, models.analysisEffort),
  ].filter((text): text is string => text !== null);
}

function RunningTag({ running }: { running: boolean }) {
  return running ? <span className="tag tag-ok">{t('lucrează acum')}</span> : <span className="tag">{t('nu lucrează acum')}</span>;
}

// "Starea robotului": the two robots, each with a tag that says whether it
// works now, then its lines: the teachers' robot, and the Quick Try robot,
// which starts again by itself from a waiting try's page (no button here).
function RobotState({ settings }: { settings: Settings }) {
  const lastRun = lastRunText(settings.robot);
  const tryLastRun = lastRunText(settings.tryRobot);
  return (
    <section className="class-card" aria-labelledby="robot-state-title">
      <div className="class-card-head">
        <h2 id="robot-state-title">{t('Starea robotului')}</h2>
      </div>
      <section className="settings-body robot-lane" aria-labelledby="robot-main-title">
        <div className="robot-lane-head">
          <h3 id="robot-main-title">{t('Robotul pentru profesori')}</h3>
          <RunningTag running={settings.robot.running} />
        </div>
        <RobotLine lastCheckAt={settings.robot.lastCheckAt} />
        {settings.configuredModel !== null && (
          <p>
            {t('Setat pentru robot:')}{' '}{settings.configuredModel}
            {settings.configuredEffort ? t(', efort {effort}', { effort: settings.configuredEffort }) : ''}
            {settings.configuredAt ? t(' (la ultima verificare, {agoText})', { agoText: agoText(settings.configuredAt, Date.now()) }) : ''}
          </p>
        )}
        <p>{lastRun ?? t('Robotul nu a terminat încă nicio rulare.')}</p>
        <p>
          {settings.lastGradedAt
            ? t('Ultima lucrare corectată: {formatDateTime}.', { formatDateTime: formatDateTime(settings.lastGradedAt) })
            : t('Nicio lucrare nu a fost corectată încă.')}
        </p>
        {modelLines(settings.lastModels).map((text) => (
          <p key={text}>{text}</p>
        ))}
      </section>
      <section className="settings-body robot-lane" aria-labelledby="robot-try-title">
        <div className="robot-lane-head">
          <h3 id="robot-try-title">{t('Robotul pentru încercări rapide')}</h3>
          <RunningTag running={settings.tryRobot.running} />
        </div>
        {/* No late warning: this robot runs only when a try waits, and a
            waiting try's page starts it again by itself. */}
        <p className="hint">{robotLine(settings.tryRobot.lastCheckAt, Date.now()).text}</p>
        <p className="hint">{t('Pornește singur când o încercare rapidă așteaptă.')}</p>
        <p>{tryLastRun ?? t('Robotul nu a terminat încă nicio rulare.')}</p>
      </section>
      <div className="settings-body">
        <p className="hint">
          {t('Robotul corectează cu planul Claude prin tokenul din secretul GitHub')}{' '}<code>{t('CLAUDE_CODE_OAUTH_TOKEN')}</code>{t('. Tokenul ține un an: dacă lucrările nu se mai corectează, fă unul nou.')}
        </p>
        <p className="hint">
          {t('Robotul pentru încercări rapide trece la contul Claude de rezervă, din secretul GitHub')}{' '}<code>{t('CLAUDE_CODE_OAUTH_TOKEN_BACKUP')}</code>
          {t(', când primul cont e la limită sau nu merge. Când el se oprește pentru token, verifică ambele secrete.')}
        </p>
      </div>
    </section>
  );
}
