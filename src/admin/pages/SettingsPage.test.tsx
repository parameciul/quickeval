import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, FAKE_ROBOT_KEY, fakeSettings } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { lastRunText } from './SettingsPage.tsx';

const withSettings = (settings = fakeSettings()) => createFakeApi({ classes: [], students: {}, settings });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SettingsPage', () => {
  it('reads the robot state again every minute while the page is open', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const api = withSettings();
    renderAdmin('/setari', api);
    expect(await screen.findByText('Robotul nu a terminat încă nicio rulare.')).toBeInTheDocument();
    expect(api.getSettings).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(api.getSettings).toHaveBeenCalledTimes(2);
  });

  it('is in the menu', async () => {
    renderAdmin('/setari', withSettings());
    const menu = await screen.findByRole('navigation', { name: 'Meniu' });
    expect(within(menu).getByRole('link', { name: 'Setări' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('heading', { name: 'Setări' })).toBeInTheDocument();
  });

  it('changes how many uploads the robot grades at the same time', async () => {
    const api = withSettings();
    renderAdmin('/setari', api);
    const select = await screen.findByLabelText('Lucrări corectate deodată');
    expect(select).toHaveValue('1');
    await userEvent.selectOptions(select, '3');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.updateSettings).toHaveBeenCalledWith(3);
    expect(await screen.findByRole('status')).toHaveTextContent('Salvat.');
  });

  it('shows the model and effort of the latest grading and class analysis, and nothing when there are none', async () => {
    const none = withSettings();
    renderAdmin('/setari', none);
    await screen.findByText('Robotul nu a terminat încă nicio rulare.');
    expect(screen.queryByText(/Ultima corectare/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ultima analiză a clasei/)).not.toBeInTheDocument();
  });

  it('shows the latest grading, and the analysis model without an effort', async () => {
    const lastModels = { gradingModel: 'claude-opus-5-5', gradingEffort: 'high', analysisModel: 'claude-sonnet-5-5', analysisEffort: null };
    renderAdmin('/setari', withSettings(fakeSettings({ lastModels })));
    expect(await screen.findByText('Ultima corectare: claude-opus-5-5, efort high')).toBeInTheDocument();
    expect(screen.getByText('Ultima analiză a clasei: claude-sonnet-5-5')).toBeInTheDocument();
  });

  it('shows the model and effort the robot is set to use, with the age', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:32:00.000Z'));
    const configured = { configuredModel: 'opus', configuredEffort: 'high', configuredAt: '2026-10-10T12:00:00.000Z' };
    renderAdmin('/setari', withSettings(fakeSettings(configured)));
    expect(await screen.findByText('Setat pentru robot: opus, efort high (la ultima verificare, acum 32 min)')).toBeInTheDocument();
  });

  it('shows the configured model alone when there is no effort, and nothing when it is unknown', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:05:00.000Z'));
    const configured = { configuredModel: 'sonnet', configuredEffort: null, configuredAt: '2026-10-10T12:00:00.000Z' };
    const first = renderAdmin('/setari', withSettings(fakeSettings(configured)));
    expect(await screen.findByText('Setat pentru robot: sonnet (la ultima verificare, acum 5 min)')).toBeInTheDocument();
    first.unmount();
    renderAdmin('/setari', withSettings());
    await screen.findByText('Robotul nu a terminat încă nicio rulare.');
    expect(screen.queryByText(/Setat pentru robot/)).not.toBeInTheDocument();
  });

  it('has the Model column checkbox off by default, and saves it', async () => {
    const user = userEvent.setup();
    const api = withSettings();
    renderAdmin('/setari', api);
    const box = await screen.findByRole('checkbox', { name: 'Arată coloana Model în tabelul elevilor' });
    expect(box).not.toBeChecked();
    await user.click(box);
    expect(api.setShowModelColumn).toHaveBeenCalledWith(true);
    expect(await screen.findByRole('checkbox', { name: 'Arată coloana Model în tabelul elevilor' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Arată coloana Model în tabelul elevilor' }));
    expect(api.setShowModelColumn).toHaveBeenLastCalledWith(false);
  });

  it('makes the first robot key and shows it once, to copy', async () => {
    const user = userEvent.setup();
    const api = withSettings();
    renderAdmin('/setari', api);
    expect(await screen.findByText('Robotul nu are încă o cheie.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fă cheia robotului' }));
    expect(api.newRobotKey).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText('Cheia nouă a robotului')).toHaveValue(FAKE_ROBOT_KEY);
    expect(await screen.findByText('Robotul are o cheie.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copiază cheia' }));
    expect(await navigator.clipboard.readText()).toBe(FAKE_ROBOT_KEY);
  });

  it('asks before it replaces a key', async () => {
    const api = withSettings(fakeSettings({ hasRobotKey: true }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin('/setari', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Fă o cheie nouă' }));
    expect(confirm).toHaveBeenCalledWith('Faci o cheie nouă? Cheia de acum nu va mai funcționa.');
    expect(api.newRobotKey).not.toHaveBeenCalled();
  });

  it('shows what the robot did last', async () => {
    const settings = fakeSettings({
      robot: {
        running: true,
        lastCheckAt: new Date(Date.now() - 3 * 60_000).toISOString(),
        lastRunFinishedAt: '2026-10-07T09:00:00.000Z',
        lastRunSummary: { exerciseLists: 1, graded: 25, failed: 0, analyses: 0, stop: 'usage_limit' },
      },
      lastGradedAt: '2026-10-07T08:55:00.000Z',
    });
    renderAdmin('/setari', withSettings(settings));
    expect(await screen.findByText('Robotul lucrează acum.')).toBeInTheDocument();
    expect(screen.getByText('Robotul a verificat acum 3 min.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Ultima rulare s-a încheiat la 7 oct. 2026, 12:00: 1 listă de exerciții, 25 de lucrări corectate, 0 lucrări eșuate. S-a oprit la limita planului Claude; continuă mai târziu.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Ultima lucrare corectată: 7 oct. 2026, 11:55.')).toBeInTheDocument();
  });

  it('says when the robot never ran', async () => {
    renderAdmin('/setari', withSettings());
    expect(await screen.findByText('Robotul nu a terminat încă nicio rulare.')).toBeInTheDocument();
    expect(screen.getByText('Nicio lucrare nu a fost corectată încă.')).toBeInTheDocument();
    expect(screen.getByText('Robotul nu a verificat încă dacă are lucrări de corectat.')).toBeInTheDocument();
  });
});

describe('lastRunText', () => {
  it('counts the class analyses only when there were some', () => {
    const robot = fakeSettings().robot;
    const summary = { exerciseLists: 0, graded: 2, failed: 1, analyses: 1, stop: 'done' } as const;
    expect(lastRunText({ ...robot, lastRunFinishedAt: '2026-10-07T09:00:00.000Z', lastRunSummary: summary })).toBe(
      'Ultima rulare s-a încheiat la 7 oct. 2026, 12:00: 0 liste de exerciții, 2 lucrări corectate, 1 lucrare eșuată, 1 analiză de clasă. A terminat toată munca.',
    );
    expect(lastRunText(robot)).toBeNull();
  });

  it('says when the run stopped because Claude refused the token', () => {
    const robot = fakeSettings().robot;
    const summary = { exerciseLists: 0, graded: 0, failed: 0, analyses: 0, stop: 'claude_login' } as const;
    expect(lastRunText({ ...robot, lastRunFinishedAt: '2026-10-07T09:00:00.000Z', lastRunSummary: summary })).toBe(
      'Ultima rulare s-a încheiat la 7 oct. 2026, 12:00: 0 liste de exerciții, 0 lucrări corectate, 0 lucrări eșuate. S-a oprit pentru că tokenul Claude nu mai merge. Fă un token nou (vezi mai jos).',
    );
  });

  it('says when the run stopped because of an error', () => {
    const robot = fakeSettings().robot;
    const summary = { exerciseLists: 1, graded: 0, failed: 0, analyses: 0, stop: 'error' } as const;
    expect(lastRunText({ ...robot, lastRunFinishedAt: '2026-10-07T09:00:00.000Z', lastRunSummary: summary })).toMatch(
      /1 listă de exerciții, 0 lucrări corectate, 0 lucrări eșuate\. S-a oprit din cauza unei erori\. Detaliile sunt în rularea de pe GitHub\.$/,
    );
  });

  it('says the other uploads wait after the run stopped at its time limit', () => {
    const robot = fakeSettings().robot;
    const summary = { exerciseLists: 0, graded: 30, failed: 0, analyses: 0, stop: 'budget' } as const;
    expect(lastRunText({ ...robot, lastRunFinishedAt: '2026-10-07T09:00:00.000Z', lastRunSummary: summary })).toBe(
      'Ultima rulare s-a încheiat la 7 oct. 2026, 12:00: 0 liste de exerciții, 30 de lucrări corectate, 0 lucrări eșuate. S-a oprit după 2 ore. Restul lucrărilor așteaptă până pornește robotul din nou.',
    );
  });
});
