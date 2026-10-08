import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, FAKE_ROBOT_KEY, fakeSettings } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { lastRunText } from './SettingsPage.tsx';

const withSettings = (settings = fakeSettings()) => createFakeApi({ classes: [], students: {}, settings });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SettingsPage', () => {
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
});
