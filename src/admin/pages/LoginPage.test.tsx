import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakeApi, fakeTeacher } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { ApiError } from '../api.ts';

const loginRequired = () => new ApiError(401, 'login_required', 'Intră în cont ca să continui.');

describe('the login form', () => {
  it('takes the place of every page while nobody is logged in, and opens the page after the login', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValueOnce(loginRequired());
    renderAdmin('/clase', api);
    expect(await screen.findByRole('heading', { name: 'Intră în cont' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Meniu' })).not.toBeInTheDocument();
    expect(api.listClasses).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Email'), 'profesor@example.com');
    await userEvent.type(screen.getByLabelText('Parola'), 'parola-buna');
    await userEvent.click(screen.getByRole('button', { name: 'Intră' }));
    expect(api.login).toHaveBeenCalledWith('profesor@example.com', 'parola-buna');
    expect(await screen.findByRole('heading', { name: /^Clase/ })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Meniu' })).toBeInTheDocument();
  });

  it('shows the reason a login is refused', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValueOnce(loginRequired());
    api.login.mockRejectedValueOnce(new ApiError(403, 'account_pending', 'Contul tău așteaptă aprobarea unui administrator.'));
    renderAdmin('/', api);
    await userEvent.type(await screen.findByLabelText('Email'), 'nou@example.com');
    await userEvent.type(screen.getByLabelText('Parola'), 'parola-buna');
    await userEvent.click(screen.getByRole('button', { name: 'Intră' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Contul tău așteaptă aprobarea unui administrator.');
  });

  it('asks for a new account, which waits for an administrator', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValueOnce(loginRequired());
    renderAdmin('/', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Vreau cont nou' }));
    expect(screen.getByRole('heading', { name: 'Cont nou' })).toBeInTheDocument();
    expect(screen.getByText(/cont demo: poți trimite teste la corectare de 5 ori/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Numele tău'), 'Ana Pop');
    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText(/^Parola/), 'parola-lunga');
    await userEvent.click(screen.getByRole('button', { name: 'Cere contul' }));
    expect(api.signup).toHaveBeenCalledWith({ name: 'Ana Pop', email: 'ana@example.com', password: 'parola-lunga' });
    expect(await screen.findByRole('status')).toHaveTextContent('Ți-am trimis un email cu un link.');
  });

  it('shows other errors of the first request as they are', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValueOnce(new ApiError(503, 'down', 'Serverul nu răspunde.'));
    renderAdmin('/', api);
    expect(await screen.findByRole('alert')).toHaveTextContent('Serverul nu răspunde.');
    expect(screen.queryByRole('heading', { name: 'Intră în cont' })).not.toBeInTheDocument();
  });
});

describe('the menu by role', () => {
  it('shows Setări to an administrator', async () => {
    renderAdmin('/clase', createFakeApi());
    const menu = await screen.findByRole('navigation', { name: 'Meniu' });
    expect(within(menu).getByRole('link', { name: 'Setări' })).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: 'Contul meu' })).toBeInTheDocument();
  });

  it('hides Setări from a teacher, and the page refuses them', async () => {
    const api = createFakeApi({ classes: [], students: {}, me: fakeTeacher({ id: 2, role: 'teacher' }) });
    renderAdmin('/setari', api);
    const menu = await screen.findByRole('navigation', { name: 'Meniu' });
    expect(within(menu).queryByRole('link', { name: 'Setări' })).not.toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: 'Teste' })).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: 'Clase' })).toBeInTheDocument();
    expect(await screen.findByText('Doar administratorii au acces la Setări.')).toBeInTheDocument();
    expect(api.getSettings).not.toHaveBeenCalled();
    expect(api.listAccounts).not.toHaveBeenCalled();
  });

  it('tells a demo account how many evaluations it has left', async () => {
    const api = createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', demo: true, testsEvaluated: 2 }) });
    renderAdmin('/clase', api);
    expect(await screen.findByText(/^Cont demo: mai ai 3 din 5 evaluări\./)).toBeInTheDocument();
  });

  it('reads the demo line again after a change, so it shows the evaluations left', async () => {
    const teacher = fakeTeacher({ role: 'teacher', demo: true, testsEvaluated: 2 });
    const api = createFakeApi({ classes: [], students: {}, me: teacher });
    renderAdmin('/cont', api);
    expect(await screen.findByText(/^Cont demo: mai ai 3 din 5 evaluări\./)).toBeInTheDocument();
    teacher.testsEvaluated = 3;
    await userEvent.type(screen.getByLabelText('Parola de acum'), 'parola-veche');
    await userEvent.type(screen.getByLabelText(/^Parola nouă/), 'parola-noua');
    await userEvent.click(screen.getByRole('button', { name: 'Schimbă parola' }));
    expect(await screen.findByText(/^Cont demo: mai ai 2 din 5 evaluări\./)).toBeInTheDocument();
  });

  it('tells a demo account when its evaluations are used up', async () => {
    const api = createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', demo: true, testsEvaluated: 5 }) });
    renderAdmin('/clase', api);
    expect(await screen.findByText(/ai folosit toate cele 5 evaluări ale contului/)).toBeInTheDocument();
  });

  it('shows no demo line to a complete account', async () => {
    renderAdmin('/clase', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher' }) }));
    await screen.findByRole('heading', { name: /^Clase/ });
    expect(screen.queryByText(/Cont demo/)).not.toBeInTheDocument();
  });
});
