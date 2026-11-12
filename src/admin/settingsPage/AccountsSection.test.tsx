import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, FAKE_TEMPORARY_PASSWORD, fakeAccount } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { accountKind, accountUse } from './AccountsSection.tsx';

const laura = fakeAccount();
const ana = fakeAccount({ id: 2, name: 'Ana Pop', email: 'ana@example.com', role: 'teacher', demo: true, status: 'pending' });
const bogdan = fakeAccount({ id: 3, name: 'Bogdan', email: 'bogdan@example.com', role: 'teacher', demo: true, testsEvaluated: 1, papersGraded: 20 });

const mihai = fakeAccount({ id: 4, name: 'Mihai', email: 'mihai@example.com', role: 'admin' });

const withAccounts = () =>
  createFakeApi({ classes: [], students: {}, accounts: [structuredClone(ana), structuredClone(laura), structuredClone(bogdan), structuredClone(mihai)] });

afterEach(() => {
  vi.restoreAllMocks();
});

const card = (name: string | RegExp) => screen.findByRole('region', { name });
const row = (within_: HTMLElement, name: string) => within(within_).getByRole('rowheader', { name: new RegExp(`^${name}`) }).closest('tr')!;

// Opens ⋯ of a teacher's row and picks an item.
async function pick(name: string, item: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Mai multe pentru ${name}` }));
  await userEvent.click(screen.getByRole('menuitem', { name: item }));
}

describe('the accounts on Setări', () => {
  it('lists the accounts that wait in their own card, and approves one', async () => {
    const api = withAccounts();
    renderAdmin('/setari', api);
    const waiting = await card('1 cont așteaptă aprobarea');
    const line = row(waiting, 'Ana Pop');
    expect(line).toHaveTextContent('ana@example.com');
    expect(line).toHaveTextContent('6 oct. 2026, 11:00');
    expect(within(line).getByText('confirmat')).toHaveClass('tag-ok');
    expect(waiting).toHaveTextContent('Un cont aprobat este un cont demo: un test, cel mult 35 de lucrări. Îl faci complet din lista de mai jos.');
    await userEvent.click(within(waiting).getByRole('button', { name: 'Aprobă Ana Pop' }));
    expect(api.approveAccount).toHaveBeenCalledWith(2, ana.createdAt);
    expect(await within(await card('Toate conturile')).findByRole('rowheader', { name: /^Ana Pop/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /așteaptă aprobarea/ })).not.toBeInTheDocument();
    // The card went with the focused button: the focus moves to the list.
    expect(screen.getByRole('heading', { name: 'Toate conturile' })).toHaveFocus();
  });

  it('names its tables after their cards', async () => {
    renderAdmin('/setari', withAccounts());
    expect(await screen.findByRole('table', { name: '1 cont așteaptă aprobarea' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Toate conturile' })).toBeInTheDocument();
  });

  it('keeps the focus in the card when one of several waiting accounts is approved', async () => {
    const carmen = fakeAccount({ id: 5, name: 'Carmen', email: 'carmen@example.com', role: 'teacher', demo: true, status: 'pending' });
    renderAdmin('/setari', createFakeApi({ classes: [], students: {}, accounts: [structuredClone(ana), structuredClone(carmen), structuredClone(laura)] }));
    await userEvent.click(await screen.findByRole('button', { name: 'Aprobă Ana Pop' }));
    expect(await screen.findByRole('heading', { name: '1 cont așteaptă aprobarea' })).toHaveFocus();
  });

  it('refuses an account after a confirmation', async () => {
    const api = withAccounts();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/setari', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Refuză Ana Pop' }));
    expect(api.rejectAccount).toHaveBeenCalledWith(2, ana.createdAt);
    await screen.findByRole('region', { name: 'Toate conturile' });
    await vi.waitFor(() => expect(screen.queryByRole('region', { name: /așteaptă aprobarea/ })).not.toBeInTheDocument());
  });

  it('refuses every account that waits at once, after a confirmation', async () => {
    const carmen = fakeAccount({ id: 5, name: 'Carmen', email: 'carmen@example.com', role: 'teacher', demo: true, status: 'pending' });
    const api = createFakeApi({ classes: [], students: {}, accounts: [structuredClone(ana), structuredClone(carmen), structuredClone(laura)] });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/setari', api);
    const waiting = await card('2 conturi așteaptă aprobarea');
    await userEvent.click(within(waiting).getByRole('button', { name: 'Refuză toate' }));
    expect(confirm).toHaveBeenCalledWith('Refuzi toate cele 2 conturi care așteaptă? Cererile se șterg.');
    expect(api.rejectAllAccounts).toHaveBeenCalledWith([
      { id: 2, createdAt: ana.createdAt },
      { id: 5, createdAt: carmen.createdAt },
    ]);
    await vi.waitFor(() => expect(screen.queryByRole('region', { name: /așteaptă aprobarea/ })).not.toBeInTheDocument());
  });

  it('offers no "Refuză toate" for a single account that waits', async () => {
    renderAdmin('/setari', withAccounts());
    await screen.findByRole('button', { name: 'Aprobă Ana Pop' });
    expect(screen.queryByRole('button', { name: 'Refuză toate' })).not.toBeInTheDocument();
  });

  it('shows no card of waiting accounts when none waits', async () => {
    renderAdmin('/setari', createFakeApi({ classes: [], students: {}, accounts: [structuredClone(laura), structuredClone(bogdan)] }));
    expect(await card('Toate conturile')).toHaveTextContent('2 conturi');
    expect(screen.queryByRole('region', { name: /așteaptă aprobarea/ })).not.toBeInTheDocument();
  });

  it('shows the kind of each account and what it used, and makes a demo account complete', async () => {
    const api = withAccounts();
    renderAdmin('/setari', api);
    const all = await card('Toate conturile');
    expect(all).toHaveTextContent('3 conturi');
    expect(row(all, 'Laura Miron')).toHaveTextContent('administrator');
    expect(row(all, 'Laura Miron')).toHaveTextContent('0 teste · 0 lucrări');
    expect(within(row(all, 'Bogdan')).getByText('demo')).toHaveClass('tag');
    expect(row(all, 'Bogdan')).toHaveTextContent('1 test · 20 din 35 de lucrări');
    await pick('Bogdan', 'Fă cont complet');
    expect(api.updateAccount).toHaveBeenCalledWith(3, { demo: false });
    expect(await within(all).findByText('complet')).toHaveClass('tag-ok');
    expect(row(all, 'Bogdan')).toHaveTextContent('1 test · 20 de lucrări');
    expect(screen.getByRole('button', { name: 'Mai multe pentru Bogdan' })).toHaveFocus();
  });

  it('closes an account after a confirmation, and opens it again', async () => {
    const api = withAccounts();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/setari', api);
    await pick('Bogdan', 'Închide contul');
    expect(confirm).toHaveBeenCalledWith('Închizi contul lui Bogdan? Nu va mai putea intra, dar datele rămân.');
    expect(api.updateAccount).toHaveBeenCalledWith(3, { status: 'disabled' });
    const all = await card('Toate conturile');
    expect(await within(all).findByText('închis')).toBeInTheDocument();
    expect(row(all, 'Bogdan')).toHaveClass('is-muted');
    await userEvent.click(screen.getByRole('button', { name: 'Mai multe pentru Bogdan' }));
    expect(screen.queryByRole('menuitem', { name: 'Închide contul' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^Fă cont/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Redeschide contul' }));
    expect(api.updateAccount).toHaveBeenLastCalledWith(3, { status: 'active' });
    expect(await within(row(all, 'Bogdan')).findByText('demo')).toBeInTheDocument();
    expect(row(all, 'Bogdan')).not.toHaveClass('is-muted');
    expect(screen.getByRole('button', { name: 'Mai multe pentru Bogdan' })).toHaveFocus();
  });

  it('gives the focus back to ⋯ before it asks', async () => {
    let focused: string | null = null;
    vi.spyOn(window, 'confirm').mockImplementation(() => {
      focused = document.activeElement?.getAttribute('aria-label') ?? null;
      return false;
    });
    renderAdmin('/setari', withAccounts());
    await pick('Bogdan', 'Parolă nouă');
    expect(focused).toBe('Mai multe pentru Bogdan');
  });

  it('keeps an account open when the closing is not confirmed', async () => {
    const api = withAccounts();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin('/setari', api);
    await pick('Bogdan', 'Închide contul');
    expect(api.updateAccount).not.toHaveBeenCalled();
  });

  it('makes a new password for a teacher and shows it once, under the row', async () => {
    const api = withAccounts();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/setari', api);
    await pick('Bogdan', 'Parolă nouă');
    expect(api.resetPassword).toHaveBeenCalledWith(3);
    const all = await card('Toate conturile');
    const under = row(all, 'Bogdan').nextElementSibling as HTMLElement;
    expect(await within(under).findByRole('status')).toHaveTextContent(`Parola nouă a lui Bogdan: ${FAKE_TEMPORARY_PASSWORD}`);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('keeps a new password while the teacher looks at another tab', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/setari', withAccounts());
    await pick('Bogdan', 'Parolă nouă');
    expect(await screen.findByText(FAKE_TEMPORARY_PASSWORD)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Robotul' }));
    await userEvent.click(screen.getByRole('tab', { name: /^Conturi/ }));
    expect(screen.getByText(FAKE_TEMPORARY_PASSWORD)).toBeVisible();
  });

  it('closes ⋯ on Esc and gives the focus back to it', async () => {
    renderAdmin('/setari', withAccounts());
    const more = await screen.findByRole('button', { name: 'Mai multe pentru Bogdan' });
    await userEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it('offers no ⋯ for an administrator, oneself included', async () => {
    renderAdmin('/setari', withAccounts());
    const all = await card('Toate conturile');
    expect(row(all, 'Mihai')).toHaveTextContent('mihai@example.com');
    expect(within(all).queryByRole('button', { name: 'Mai multe pentru Laura Miron' })).not.toBeInTheDocument();
    expect(within(all).queryByRole('button', { name: 'Mai multe pentru Mihai' })).not.toBeInTheDocument();
  });

  it('opens the details of an account: the robot work, what it made, and its history', async () => {
    const bogdan = fakeAccount({
      id: 3,
      name: 'Bogdan',
      email: 'bogdan@example.com',
      role: 'teacher',
      demo: true,
      testsEvaluated: 1,
      papersGraded: 20,
      papersWaiting: 2,
      lastLoginAt: '2026-10-27T10:00:00.000Z',
      baremsGenerated: 4,
      exerciseListsMade: 2,
      analysesMade: 1,
      printsMade: 3,
    });
    const api = createFakeApi({
      classes: [],
      students: {},
      accounts: [structuredClone(laura), structuredClone(bogdan)],
      accountDetails: {
        3: {
          account: structuredClone(bogdan),
          events: [
            { kind: 'created', at: '2026-10-06T08:00:00.000Z', by: null },
            { kind: 'approved', at: '2026-10-07T09:00:00.000Z', by: { id: 1, name: 'Laura Miron' } },
            { kind: 'password', at: '2026-10-27T09:55:00.000Z', by: { id: 3, name: 'Bogdan' } },
          ],
          counts: { classes: 2, students: 30, tests: 3 },
          activity: { testsLast30Days: 1, papersLast30Days: 20, r2Bytes: 2 * 1024 * 1024 },
          robot: {
            grading: { done: 20, failed: 2, tokens: 41_500 },
            exercise_list: { done: 2, failed: 0, tokens: 3_200 },
            analysis: { done: 1, failed: 1, tokens: 5_000 },
            barem: { done: 4, failed: 0, tokens: 9_000 },
            print: { done: 3, failed: 0, tokens: 0 },
          },
          tests: [
            {
              code: '6E2-26T1',
              title: 'Testul 1',
              className: '10B',
              createdAt: '2026-10-06T08:00:00.000Z',
              papers: 20,
              pointsChanged: 3,
              robot: { barems: 1, exerciseLists: 1, analyses: 1, prints: 1, gradings: 20, failures: 2, tokens: 40_000 },
            },
          ],
        },
      },
    });
    renderAdmin('/setari', api);
    const all = await card('Toate conturile');
    const details = within(row(all, 'Bogdan')).getByRole('button', { name: 'Detalii pentru Bogdan' });
    expect(details).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(details);
    expect(api.getAccount).toHaveBeenCalledWith(3);
    expect(details).toHaveAttribute('aria-expanded', 'true');
    const heading = await screen.findByRole('heading', { name: 'Activitatea contului' });
    const panel = heading.closest('td')!;
    const stat = (label: string) => [...panel.querySelectorAll('dt')].find((dt) => dt.textContent === label)!.nextElementSibling;
    expect(stat('Teste trimise la corectare')).toHaveTextContent('1 test');
    expect(stat('Lucrări corectate')).toHaveTextContent('20 de lucrări');
    expect(stat('Lucrări în lucru acum')).toHaveTextContent('2 lucrări');
    expect(stat('Bareme generate de robot')).toHaveTextContent('4 bareme');
    expect(stat('Liste de exerciții generate')).toHaveTextContent('2 liste');
    expect(stat('Analize ale clasei generate')).toHaveTextContent('1 analiză');
    expect(stat('Teste pregătite pentru tipărire')).toHaveTextContent('3 teste');
    expect(stat('Clase')).toHaveTextContent('2 clase');
    expect(stat('Elevi')).toHaveTextContent('30 de elevi');
    expect(stat('Teste create')).toHaveTextContent('3 teste');
    expect(stat('Teste corectate în ultimele 30 de zile')).toHaveTextContent('1 test');
    expect(stat('Lucrări corectate în ultimele 30 de zile')).toHaveTextContent('20 de lucrări');
    expect(stat('Spațiul lucrărilor')).toHaveTextContent('2 MB');
    expect(stat('Ultima intrare')).toHaveTextContent('27 oct. 2026, 12:00');

    const history = panel.querySelector('.account-history')!;
    expect(within(history as HTMLElement).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Cont creat6 oct. 2026, 11:00',
      'Cont aprobat de Laura Miron7 oct. 2026, 12:00',
      'Parolă schimbată27 oct. 2026, 11:55',
    ]);
  });

  it('shows the robot work by kind, its failure rate, and each test', async () => {
    const bogdan = fakeAccount({ id: 3, name: 'Bogdan', email: 'bogdan@example.com', role: 'teacher' });
    const api = createFakeApi({
      classes: [],
      students: {},
      accounts: [structuredClone(laura), structuredClone(bogdan)],
      accountDetails: {
        3: {
          account: structuredClone(bogdan),
          events: [],
          counts: { classes: 0, students: 0, tests: 1 },
          activity: { testsLast30Days: 0, papersLast30Days: 0, r2Bytes: 0 },
          robot: {
            grading: { done: 20, failed: 2, tokens: 41_500 },
            exercise_list: { done: 2, failed: 1, tokens: 3_200 },
            analysis: { done: 1, failed: 0, tokens: 5_000 },
            barem: { done: 4, failed: 0, tokens: 9_000 },
            print: { done: 3, failed: 0, tokens: 0 },
          },
          tests: [
            {
              code: '6E2-26T1',
              title: 'Testul 1',
              className: '10B',
              createdAt: '2026-10-06T08:00:00.000Z',
              papers: 20,
              pointsChanged: 3,
              robot: { barems: 1, exerciseLists: 1, analyses: 1, prints: 1, gradings: 20, failures: 2, tokens: 40_000 },
            },
            {
              code: '6E2-26T2',
              title: 'Testul 2',
              className: '10B',
              createdAt: '2026-10-20T08:00:00.000Z',
              papers: 0,
              pointsChanged: 0,
              robot: { barems: 0, exerciseLists: 0, analyses: 0, prints: 0, gradings: 0, failures: 0, tokens: 0 },
            },
          ],
        },
      },
    });
    renderAdmin('/setari', api);
    const all = await card('Toate conturile');
    await userEvent.click(within(row(all, 'Bogdan')).getByRole('button', { name: 'Detalii pentru Bogdan' }));
    const robot = await screen.findByRole('heading', { name: 'Consumul robotului' });
    const robotPanel = robot.parentElement!;
    const line = (label: string) => within(within(robotPanel).getByRole('table')).getByRole('rowheader', { name: label }).closest('tr')!;
    expect(line('Corectări')).toHaveTextContent('20');
    expect(line('Corectări')).toHaveTextContent('2');
    expect(line('Corectări')).toHaveTextContent('41.500');
    expect(line('Teste pentru tipărire').textContent).toContain('—');
    expect(within(robotPanel).getByText(/Rata eșecurilor: 9% \(3 încercări ratate din 33\)/)).toBeInTheDocument();

    const tests = await screen.findByRole('heading', { name: 'Fiecare test' });
    const table = within(tests.parentElement!).getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    const first = within(table).getByRole('rowheader', { name: /^Testul 1/ }).closest('tr')!;
    expect(first).toHaveTextContent('10B');
    expect(first).toHaveTextContent('20');
    expect(first).toHaveTextContent('26');
    expect(first).toHaveTextContent('3');
    expect(first).toHaveTextContent('40.000');
    const second = within(table).getByRole('rowheader', { name: /^Testul 2/ }).closest('tr')!;
    expect(second).toHaveTextContent('0');
  });

  it('says when the robot has not worked for an account yet', async () => {
    renderAdmin('/setari', withAccounts());
    const all = await card('Toate conturile');
    await userEvent.click(within(row(all, 'Bogdan')).getByRole('button', { name: 'Detalii pentru Bogdan' }));
    const robot = await screen.findByRole('heading', { name: 'Consumul robotului' });
    expect(within(robot.parentElement!).getByText('Robotul nu a lucrat încă pentru acest cont.')).toBeInTheDocument();
    const tests = await screen.findByRole('heading', { name: 'Fiecare test' });
    expect(within(tests.parentElement!).getByText('Niciun test încă.')).toBeInTheDocument();
  });

  it('lists the requests that were refused, with who asked and who said no', async () => {
    const api = createFakeApi({
      classes: [],
      students: {},
      accounts: [structuredClone(laura)],
      refusedAccounts: [
        { name: 'Cineva', email: 'cineva@example.com', askedAt: '2026-10-20T08:00:00.000Z', refusedAt: '2026-10-21T09:00:00.000Z', by: 'Laura Miron' },
        { name: 'Altcineva', email: 'alt@example.com', askedAt: '2026-10-19T08:00:00.000Z', refusedAt: '2026-10-21T09:10:00.000Z', by: null },
      ],
    });
    renderAdmin('/setari', api);
    const refused = await card('Conturi refuzate');
    expect(refused).toHaveTextContent('2 cereri');
    const line = row(refused, 'Cineva');
    expect(line).toHaveTextContent('cineva@example.com');
    expect(line).toHaveTextContent('20 oct. 2026, 11:00');
    expect(line).toHaveTextContent('21 oct. 2026, 12:00');
    expect(line).toHaveTextContent('Laura Miron');
    expect(row(refused, 'Altcineva')).toHaveTextContent('—');
  });

  it('shows no card of refused accounts when none was refused', async () => {
    renderAdmin('/setari', withAccounts());
    await card('Toate conturile');
    expect(screen.queryByRole('region', { name: /Conturi refuzate/ })).not.toBeInTheDocument();
  });

  it('closes the details of an account again', async () => {
    renderAdmin('/setari', withAccounts());
    const all = await card('Toate conturile');
    const details = within(row(all, 'Bogdan')).getByRole('button', { name: 'Detalii pentru Bogdan' });
    await userEvent.click(details);
    expect(await screen.findByRole('heading', { name: 'Activitatea contului' })).toBeInTheDocument();
    await userEvent.click(details);
    expect(details).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('heading', { name: 'Activitatea contului' })).not.toBeInTheDocument();
  });

  it('makes up the history of an account from the times it keeps', async () => {
    const approved = fakeAccount({ id: 3, name: 'Bogdan', email: 'bogdan@example.com', role: 'teacher', approvedAt: '2026-10-28T10:00:00.000Z' });
    renderAdmin('/setari', createFakeApi({ classes: [], students: {}, accounts: [structuredClone(laura), structuredClone(approved)] }));
    const all = await card('Toate conturile');
    await userEvent.click(within(row(all, 'Bogdan')).getByRole('button', { name: 'Detalii pentru Bogdan' }));
    const heading = await screen.findByRole('heading', { name: 'Istoricul contului' });
    const history = heading.closest('div')!.querySelector('.account-history')!;
    expect(within(history as HTMLElement).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Cont creat6 oct. 2026, 11:00',
      'Cont aprobat de Laura Miron28 oct. 2026, 12:00',
    ]);
  });

  it('offers the details of an administrator too', async () => {
    renderAdmin('/setari', withAccounts());
    const all = await card('Toate conturile');
    expect(within(row(all, 'Mihai')).getByRole('button', { name: 'Detalii pentru Mihai' })).toBeInTheDocument();
  });
});

describe('accountKind and accountUse', () => {
  it.each([
    [fakeAccount({ role: 'teacher', testsEvaluated: 1, papersGraded: 1 }), 'complet', '1 test · 1 lucrare'],
    [fakeAccount({ role: 'teacher', testsEvaluated: 7, papersGraded: 19 }), 'complet', '7 teste · 19 lucrări'],
    [fakeAccount({ role: 'teacher', testsEvaluated: 51, papersGraded: 900 }), 'complet', '51 de teste · 900 de lucrări'],
    [fakeAccount({ role: 'teacher', demo: true, testsEvaluated: 0, papersGraded: 0 }), 'demo', '0 teste · 0 din 35 de lucrări'],
    [fakeAccount({ role: 'teacher', demo: true, testsEvaluated: 3, papersGraded: 40 }), 'demo', '3 teste · 35 din 35 de lucrări'],
    [fakeAccount({ role: 'teacher', demo: true, status: 'disabled', testsEvaluated: 1, papersGraded: 2 }), 'închis', '1 test · 2 lucrări'],
    [fakeAccount({ testsEvaluated: 4, papersGraded: 88 }), 'administrator', '4 teste · 88 de lucrări'],
  ])('describes %j', (account, kind, use) => {
    expect(accountKind(account).label).toBe(kind);
    expect(accountUse(account)).toBe(use);
  });
});
