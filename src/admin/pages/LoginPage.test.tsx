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
    // Logged out, the top bar has the lockup and the theme, no school year.
    expect(screen.queryByLabelText('Anul școlar')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Weekendul tău, fără teancul de lucrări.' })).toBeInTheDocument();
    expect(screen.getByText('Elevii nu au nevoie de cont: trimit lucrarea de pe linkul testului.')).toBeInTheDocument();
    expect(api.listClasses).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Adresa de email'), 'profesor@example.com');
    await userEvent.type(screen.getByLabelText('Parola'), 'parola-buna');
    await userEvent.click(screen.getByRole('button', { name: 'Intră' }));
    expect(api.login).toHaveBeenCalledWith('profesor@example.com', 'parola-buna');
    expect(await screen.findByText('Nu ai nicio clasă în acest an școlar.')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Meniu' })).toBeInTheDocument();
  });

  it('shows the reason a login is refused under the form', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValueOnce(loginRequired());
    api.login.mockRejectedValueOnce(new ApiError(403, 'email_unconfirmed', 'Confirmă mai întâi adresa de email, cu linkul primit pe email.'));
    renderAdmin('/', api);
    await userEvent.type(await screen.findByLabelText('Adresa de email'), 'nou@example.com');
    await userEvent.type(screen.getByLabelText('Parola'), 'parola-buna');
    await userEvent.click(screen.getByRole('button', { name: 'Intră' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Confirmă mai întâi adresa de email');
    expect(screen.getByRole('heading', { name: 'Intră în cont' })).toBeInTheDocument();
  });

  it('tells an account that waits for approval, and "Ieși" goes back to the login', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValueOnce(loginRequired());
    api.login.mockRejectedValueOnce(new ApiError(403, 'account_pending', 'Contul tău așteaptă aprobarea unui administrator.'));
    renderAdmin('/', api);
    await userEvent.type(await screen.findByLabelText('Adresa de email'), ' nou@example.com ');
    await userEvent.type(screen.getByLabelText('Parola'), 'parola-buna');
    await userEvent.click(screen.getByRole('button', { name: 'Intră' }));
    const heading = await screen.findByRole('heading', { name: 'Contul tău așteaptă aprobarea' });
    expect(heading).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Adresa nou@example.com este confirmată.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ieși' }));
    expect(screen.getByRole('heading', { name: 'Intră în cont' })).toHaveFocus();
    expect(screen.getByLabelText('Adresa de email')).toHaveValue('');
  });

  it('asks for a new account, which waits for an administrator', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValueOnce(loginRequired());
    renderAdmin('/', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Cere un cont de profesor' }));
    expect(screen.getByRole('heading', { name: 'Cont nou de profesor' })).toHaveFocus();
    expect(screen.getByText(/poți corecta un test, cu cel mult 35 de lucrări\. Întâi confirmi adresa de email/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Numele tău'), 'Ana Pop');
    await userEvent.type(screen.getByLabelText('Adresa de email'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText(/^Parola/), 'parola-lunga');
    await userEvent.click(screen.getByRole('button', { name: 'Cere contul' }));
    expect(api.signup).toHaveBeenCalledWith({ name: 'Ana Pop', email: 'ana@example.com', password: 'parola-lunga' });
    expect(await screen.findByRole('heading', { name: 'Verifică-ți emailul' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Ți-am trimis un email cu un link.');
    await userEvent.click(screen.getByRole('button', { name: 'Înapoi la pagina de intrare' }));
    expect(screen.getByRole('heading', { name: 'Intră în cont' })).toBeInTheDocument();
  });

  it('opens on the new account form from the link "#cont-nou" of the landing page', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValueOnce(loginRequired());
    renderAdmin('/#cont-nou', api);
    const heading = await screen.findByRole('heading', { name: 'Cont nou de profesor' });
    // The first state takes no focus: the page has just opened.
    expect(heading).not.toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Intră în cont' }));
    expect(screen.getByRole('heading', { name: 'Intră în cont' })).toBeInTheDocument();
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
    expect(within(menu).getByRole('link', { name: 'Setări' })).toHaveAttribute('href', '/setari');
  });

  it('hides Setări from a teacher, and the page refuses them', async () => {
    const api = createFakeApi({ classes: [], students: {}, me: fakeTeacher({ id: 2, role: 'teacher' }) });
    renderAdmin('/setari', api);
    const menu = await screen.findByRole('navigation', { name: 'Meniu' });
    expect(within(menu).queryByRole('link', { name: 'Setări' })).not.toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: 'Teste' })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'Clase' })).toBeInTheDocument();
    expect(await screen.findByText('Doar administratorii au acces la Setări.')).toBeInTheDocument();
    expect(api.getSettings).not.toHaveBeenCalled();
    expect(api.listAccounts).not.toHaveBeenCalled();
  });

  it('tells a demo account how many papers it has left, in the top bar before the school year', async () => {
    const api = createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', demo: true, testsEvaluated: 1, papersGraded: 2 }) });
    renderAdmin('/clase', api);
    const button = await screen.findByRole('button', { name: 'Demo · 33 de lucrări rămase' });
    expect(button.compareDocumentPosition(screen.getByLabelText('Anul școlar')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button).not.toHaveClass('is-full');
    expect(screen.queryByRole('region', { name: 'Cont demo' })).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('region', { name: 'Cont demo' });
    expect(within(menu).getByText('Teste corectate').nextElementSibling).toHaveTextContent('1 din 1');
    expect(within(menu).getByText('Lucrări corectate').nextElementSibling).toHaveTextContent('2 din 35');
    expect(menu).toHaveTextContent('Mai ai 33 de lucrări, pentru testul tău.');
    // The paragraph under the top bar is gone.
    expect(document.querySelector('.page > .warning')).toBeNull();
    await userEvent.click(within(menu).getByRole('link', { name: 'Contul meu' }));
    expect(await screen.findByRole('heading', { name: 'Contul meu' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cont demo' })).not.toBeInTheDocument();
  });

  it('closes the demo menu on Esc, with the focus back on its button, and on a click outside it', async () => {
    renderAdmin('/clase', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', demo: true, papersGraded: 2 }) }));
    const button = await screen.findByRole('button', { name: /^Demo · / });
    await userEvent.click(button);
    await userEvent.tab();
    expect(within(screen.getByRole('region', { name: 'Cont demo' })).getByRole('link', { name: 'Contul meu' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Cont demo' })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    await userEvent.click(button);
    await userEvent.click(document.body);
    expect(screen.queryByRole('region', { name: 'Cont demo' })).not.toBeInTheDocument();
  });

  it('counts the papers on their way to the robot as used', async () => {
    const api = createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', demo: true, papersGraded: 33, papersWaiting: 1 }) });
    renderAdmin('/clase', api);
    expect(await screen.findByRole('button', { name: 'Demo · 1 lucrare rămasă' })).toBeInTheDocument();
  });

  it('reads the demo button again after a change, so it shows the papers left', async () => {
    const teacher = fakeTeacher({ role: 'teacher', demo: true, papersGraded: 2 });
    const api = createFakeApi({ classes: [], students: {}, me: teacher });
    renderAdmin('/cont', api);
    expect(await screen.findByRole('button', { name: 'Demo · 33 de lucrări rămase' })).toBeInTheDocument();
    teacher.papersGraded = 20;
    await userEvent.type(screen.getByLabelText('Parola de acum'), 'parola-veche');
    await userEvent.type(screen.getByLabelText(/^Parola nouă/), 'parola-noua');
    await userEvent.click(screen.getByRole('button', { name: 'Schimbă parola' }));
    expect(await screen.findByRole('button', { name: 'Demo · 15 lucrări rămase' })).toBeInTheDocument();
  });

  it('turns the ring orange and asks for a complete account when the papers are used up', async () => {
    const api = createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher', demo: true, testsEvaluated: 2, papersGraded: 35 }) });
    renderAdmin('/clase', api);
    const button = await screen.findByRole('button', { name: 'Demo · 0 lucrări rămase' });
    expect(button).toHaveClass('is-full');
    await userEvent.click(button);
    expect(screen.getByRole('region', { name: 'Cont demo' })).toHaveTextContent(
      'Ai folosit toate cele 35 de lucrări ale contului demo. Cere unui administrator un cont complet.',
    );
  });

  it('shows no demo button to a complete account', async () => {
    renderAdmin('/clase', createFakeApi({ classes: [], students: {}, me: fakeTeacher({ role: 'teacher' }) }));
    await screen.findByText('Nu ai nicio clasă în acest an școlar.');
    expect(screen.queryByRole('button', { name: /^Demo/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Cont demo/)).not.toBeInTheDocument();
  });
});

describe('the forgotten password', () => {
  it('asks for a link by email, and says the same whatever the email', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValueOnce(loginRequired());
    renderAdmin('/', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Am uitat parola' }));
    expect(screen.getByRole('heading', { name: 'Am uitat parola' })).toHaveFocus();
    await userEvent.type(screen.getByLabelText('Adresa de email'), 'profesor@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Trimite linkul' }));
    expect(api.forgotPassword).toHaveBeenCalledWith('profesor@example.com');
    expect(await screen.findByRole('heading', { name: 'Verifică-ți emailul' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Dacă adresa are un cont');
  });

  it('shows why a link could not be sent', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValueOnce(loginRequired());
    api.forgotPassword.mockRejectedValueOnce(new ApiError(429, 'too_many_resets', 'Prea multe cereri de resetare. Încearcă din nou mâine.'));
    renderAdmin('/', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Am uitat parola' }));
    await userEvent.type(screen.getByLabelText('Adresa de email'), 'profesor@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Trimite linkul' }));
    expect(await screen.findByText(/Prea multe cereri de resetare/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Am uitat parola' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Înapoi la pagina de intrare' }));
    expect(screen.getByRole('heading', { name: 'Intră în cont' })).toBeInTheDocument();
  });
});
