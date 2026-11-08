import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api.ts';
import { createFakeApi, FAKE_ROBOT_KEY, fakeAccount, fakeSettings } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
import { lastRunText } from './SettingsPage.tsx';

const withSettings = (settings = fakeSettings()) => createFakeApi({ classes: [], students: {}, settings });
const ROBOT = '/setari?tab=robotul';
const GRADING = '/setari?tab=corectarea';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SettingsPage', () => {
  it('reads the robot state again every minute while the page is open', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const api = withSettings();
    renderAdmin(ROBOT, api);
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
    expect(screen.getByText('Doar administratorii văd această pagină.')).toBeInTheDocument();
  });

  it('opens on Conturi, and keeps the chosen tab in the address', async () => {
    renderAdmin('/setari', withSettings(), <LocationProbe />);
    const tabs = await screen.findByRole('tablist', { name: 'Setări' });
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Conturi', 'Corectarea', 'Robotul']);
    expect(within(tabs).getByRole('tab', { name: 'Conturi' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Robotul' }));
    await expectLocation('/setari?tab=robotul');
    expect(within(tabs).getByRole('tab', { name: 'Robotul' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Robotul' })).toHaveTextContent('Starea robotului');
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Conturi' }));
    await expectLocation(/^\/setari$/);
  });

  it('keeps a new robot key while the teacher looks at another tab', async () => {
    const user = userEvent.setup();
    renderAdmin(ROBOT, withSettings());
    await user.click(await screen.findByRole('button', { name: 'Fă cheia robotului' }));
    expect(await screen.findByLabelText('Cheia nouă a robotului')).toHaveValue(FAKE_ROBOT_KEY);
    await user.click(screen.getByRole('tab', { name: 'Conturi' }));
    expect(screen.getByRole('tabpanel', { name: 'Conturi' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Robotul' }));
    expect(screen.getByLabelText('Cheia nouă a robotului')).toHaveValue(FAKE_ROBOT_KEY);
  });

  it('shows no tabs to a teacher who is not an administrator, not even while it loads', async () => {
    const api = createFakeApi({ classes: [], students: {}, me: { ...fakeAccount(), role: 'teacher' } });
    renderAdmin('/setari', api);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByText('Doar administratorii văd această pagină.')).not.toBeInTheDocument();
    expect(await screen.findByText('Doar administratorii au acces la Setări.')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('opens the tab the address names, and Conturi for one it does not know', async () => {
    const first = renderAdmin(GRADING, withSettings());
    expect(await screen.findByRole('tab', { name: 'Corectarea' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByLabelText('Lucrări corectate deodată')).toBeInTheDocument();
    first.unmount();
    renderAdmin('/setari?tab=altceva', withSettings());
    expect(await screen.findByRole('tab', { name: 'Conturi' })).toHaveAttribute('aria-selected', 'true');
  });

  it('counts the accounts that wait on Conturi, on every tab', async () => {
    const pending = (id: number, name: string) =>
      fakeAccount({ id, name, email: `${id}@example.com`, role: 'teacher', demo: true, status: 'pending' });
    const api = createFakeApi({ classes: [], students: {}, settings: fakeSettings(), accounts: [fakeAccount(), pending(2, 'Ana'), pending(3, 'Radu')] });
    renderAdmin(ROBOT, api);
    expect(await screen.findByRole('tab', { name: 'Conturi 2 așteaptă aprobarea' })).toBeInTheDocument();
  });

  it('shows no count on Conturi when no account waits', async () => {
    renderAdmin(ROBOT, withSettings());
    await screen.findByText('Robotul nu a terminat încă nicio rulare.');
    expect(screen.getByRole('tab', { name: 'Conturi' })).toBeInTheDocument();
  });

  it('changes how many uploads the robot grades at the same time, as soon as it is chosen', async () => {
    const api = withSettings();
    renderAdmin(GRADING, api);
    const select = await screen.findByLabelText('Lucrări corectate deodată');
    expect(select).toHaveValue('1');
    expect(select).toHaveAccessibleDescription('Mai multe lucrări deodată termină mai repede, dar ajung mai repede la limita planului Claude.');
    await userEvent.selectOptions(select, '3');
    expect(api.updateSettings).toHaveBeenCalledWith(3);
    expect(await screen.findByRole('status')).toHaveTextContent('Salvat.');
    expect(screen.getByLabelText('Lucrări corectate deodată')).toHaveValue('3');
  });

  it('shows the chosen number at once and keeps the select on while it saves', async () => {
    const api = withSettings();
    api.updateSettings.mockImplementationOnce(() => new Promise(() => {}));
    renderAdmin(GRADING, api);
    const select = await screen.findByLabelText('Lucrări corectate deodată');
    await userEvent.selectOptions(select, '2');
    expect(select).toHaveValue('2');
    expect(select).toBeEnabled();
    expect(select).toHaveFocus();
  });

  it('goes back to the saved number when the save is refused', async () => {
    const api = withSettings();
    api.updateSettings.mockRejectedValueOnce(new ApiError(400, 'bad_request', 'Alege între 1 și 4.'));
    renderAdmin(GRADING, api);
    const select = await screen.findByLabelText('Lucrări corectate deodată');
    await userEvent.selectOptions(select, '4');
    expect(await screen.findByRole('alert')).toHaveTextContent('Alege între 1 și 4.');
    expect(select).toHaveValue('1');
  });

  it('shows the model and effort of the latest grading and class analysis, and nothing when there are none', async () => {
    const none = withSettings();
    renderAdmin(ROBOT, none);
    await screen.findByText('Robotul nu a terminat încă nicio rulare.');
    expect(screen.queryByText(/Ultima corectare/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ultima analiză a clasei/)).not.toBeInTheDocument();
  });

  it('shows the latest grading, and the analysis model without an effort', async () => {
    const lastModels = { gradingModel: 'claude-opus-5-5', gradingEffort: 'high', analysisModel: 'claude-sonnet-5-5', analysisEffort: null };
    renderAdmin(ROBOT, withSettings(fakeSettings({ lastModels })));
    expect(await screen.findByText('Ultima corectare: claude-opus-5-5, efort high')).toBeInTheDocument();
    expect(screen.getByText('Ultima analiză a clasei: claude-sonnet-5-5')).toBeInTheDocument();
  });

  it('shows the model and effort the robot is set to use, with the age', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:32:00.000Z'));
    const configured = { configuredModel: 'opus', configuredEffort: 'high', configuredAt: '2026-10-10T12:00:00.000Z' };
    renderAdmin(ROBOT, withSettings(fakeSettings(configured)));
    expect(await screen.findByText('Setat pentru robot: opus, efort high (la ultima verificare, acum 32 min)')).toBeInTheDocument();
  });

  it('shows the configured model alone when there is no effort, and nothing when it is unknown', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:05:00.000Z'));
    const configured = { configuredModel: 'sonnet', configuredEffort: null, configuredAt: '2026-10-10T12:00:00.000Z' };
    const first = renderAdmin(ROBOT, withSettings(fakeSettings(configured)));
    expect(await screen.findByText('Setat pentru robot: sonnet (la ultima verificare, acum 5 min)')).toBeInTheDocument();
    first.unmount();
    renderAdmin(ROBOT, withSettings());
    await screen.findByText('Robotul nu a terminat încă nicio rulare.');
    expect(screen.queryByText(/Setat pentru robot/)).not.toBeInTheDocument();
  });

  it('has the Model column checkbox off by default, and saves it', async () => {
    const user = userEvent.setup();
    const api = withSettings();
    renderAdmin(GRADING, api);
    const box = await screen.findByRole('checkbox', { name: 'Arată coloana Model' });
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription('Arată în tabelul lucrărilor cu ce model a fost corectată fiecare lucrare.');
    await user.click(box);
    expect(api.setShowModelColumn).toHaveBeenCalledWith(true);
    expect(await screen.findByRole('checkbox', { name: 'Arată coloana Model' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Arată coloana Model' }));
    expect(api.setShowModelColumn).toHaveBeenLastCalledWith(false);
  });

  it('makes the first robot key and shows it once, to copy', async () => {
    const user = userEvent.setup();
    const api = withSettings();
    renderAdmin(ROBOT, api);
    expect(await screen.findByText('Robotul nu are încă o cheie.')).toBeInTheDocument();
    expect(screen.queryByText(/^Făcută pe/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fă cheia robotului' }));
    expect(api.newRobotKey).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText('Cheia nouă a robotului')).toHaveValue(FAKE_ROBOT_KEY);
    expect(await screen.findByText('Robotul are o cheie.')).toBeInTheDocument();
    expect(screen.getByText('Făcută pe 12 octombrie 2026.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copiază cheia' }));
    expect(await navigator.clipboard.readText()).toBe(FAKE_ROBOT_KEY);
  });

  it('asks before it replaces a key', async () => {
    const api = withSettings(fakeSettings({ hasRobotKey: true }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin(ROBOT, api);
    expect(await screen.findByText('Robotul are o cheie.')).toBeInTheDocument();
    expect(screen.queryByText(/^Făcută pe/)).not.toBeInTheDocument();
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
        lastRunSummary: { exerciseLists: 1, graded: 25, failed: 0, analyses: 0, prints: 0, barems: 0, stop: 'usage_limit' },
      },
      lastGradedAt: '2026-10-07T08:55:00.000Z',
    });
    renderAdmin(ROBOT, withSettings(settings));
    const state = await screen.findByRole('region', { name: 'Starea robotului' });
    expect(within(state).getByText('lucrează acum')).toHaveClass('tag-ok');
    expect(screen.getByText('Robotul a verificat acum 3 min.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Ultima rulare s-a încheiat la 7 oct. 2026, 12:00: 1 listă de exerciții, 25 de lucrări corectate, 0 lucrări eșuate. S-a oprit la limita planului Claude; continuă mai târziu.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Ultima lucrare corectată: 7 oct. 2026, 11:55.')).toBeInTheDocument();
  });

  it('says when the robot never ran', async () => {
    renderAdmin(ROBOT, withSettings());
    expect(await screen.findByText('Robotul nu a terminat încă nicio rulare.')).toBeInTheDocument();
    expect(screen.getByText('nu lucrează acum')).not.toHaveClass('tag-ok');
    expect(screen.getByText('Nicio lucrare nu a fost corectată încă.')).toBeInTheDocument();
    expect(screen.getByText('Robotul nu a verificat încă dacă are lucrări de corectat.')).toBeInTheDocument();
  });
});

describe('lastRunText', () => {
  it('counts the class analyses only when there were some', () => {
    const robot = fakeSettings().robot;
    const summary = { exerciseLists: 0, graded: 2, failed: 1, analyses: 1, prints: 0, barems: 0, stop: 'done' } as const;
    expect(lastRunText({ ...robot, lastRunFinishedAt: '2026-10-07T09:00:00.000Z', lastRunSummary: summary })).toBe(
      'Ultima rulare s-a încheiat la 7 oct. 2026, 12:00: 0 liste de exerciții, 2 lucrări corectate, 1 lucrare eșuată, 1 analiză de clasă. A terminat toată munca.',
    );
    expect(lastRunText(robot)).toBeNull();
  });

  it('says when the run stopped because Claude refused the token', () => {
    const robot = fakeSettings().robot;
    const summary = { exerciseLists: 0, graded: 0, failed: 0, analyses: 0, prints: 0, barems: 0, stop: 'claude_login' } as const;
    expect(lastRunText({ ...robot, lastRunFinishedAt: '2026-10-07T09:00:00.000Z', lastRunSummary: summary })).toBe(
      'Ultima rulare s-a încheiat la 7 oct. 2026, 12:00: 0 liste de exerciții, 0 lucrări corectate, 0 lucrări eșuate. S-a oprit pentru că tokenul Claude nu mai merge. Fă un token nou (vezi mai jos).',
    );
  });

  it('says when the run stopped because of an error', () => {
    const robot = fakeSettings().robot;
    const summary = { exerciseLists: 1, graded: 0, failed: 0, analyses: 0, prints: 0, barems: 0, stop: 'error' } as const;
    expect(lastRunText({ ...robot, lastRunFinishedAt: '2026-10-07T09:00:00.000Z', lastRunSummary: summary })).toMatch(
      /1 listă de exerciții, 0 lucrări corectate, 0 lucrări eșuate\. S-a oprit din cauza unei erori\. Detaliile sunt în rularea de pe GitHub\.$/,
    );
  });

  it('says the other uploads wait after the run stopped at its time limit', () => {
    const robot = fakeSettings().robot;
    const summary = { exerciseLists: 0, graded: 30, failed: 0, analyses: 0, prints: 0, barems: 0, stop: 'budget' } as const;
    expect(lastRunText({ ...robot, lastRunFinishedAt: '2026-10-07T09:00:00.000Z', lastRunSummary: summary })).toBe(
      'Ultima rulare s-a încheiat la 7 oct. 2026, 12:00: 0 liste de exerciții, 30 de lucrări corectate, 0 lucrări eșuate. S-a oprit după 2 ore. Restul lucrărilor așteaptă până pornește robotul din nou.',
    );
  });
});
