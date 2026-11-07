import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakeApi } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { ApiError } from '../api.ts';

const loginRequired = () => new ApiError(401, 'login_required', 'Intră în cont ca să continui.');

describe('NewPasswordPage', () => {
  it('sets the new password from the link without a login', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValue(loginRequired());
    renderAdmin('/parola-noua#token-din-link', api);
    await userEvent.type(await screen.findByLabelText(/Parola nouă/), 'parola-noua-lunga');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează parola' }));
    expect(api.setNewPassword).toHaveBeenCalledWith('token-din-link', 'parola-noua-lunga');
    expect(await screen.findByRole('status')).toHaveTextContent('parola a fost schimbată');
  });

  it('shows the server message for a link that no longer works', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValue(loginRequired());
    api.setNewPassword.mockRejectedValueOnce(new ApiError(404, 'bad_link', 'Linkul nu mai este valabil. Cere altul de pe pagina de intrare.'));
    renderAdmin('/parola-noua#vechi', api);
    await userEvent.type(await screen.findByLabelText(/Parola nouă/), 'parola-noua-lunga');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează parola' }));
    expect(await screen.findByText(/Linkul nu mai este valabil/)).toBeInTheDocument();
  });

  it('asks to open the link again when it has no token', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValue(loginRequired());
    renderAdmin('/parola-noua', api);
    expect(await screen.findByText('Linkul nu este întreg. Deschide-l din nou din email.')).toBeInTheDocument();
  });
});
