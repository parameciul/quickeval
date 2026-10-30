import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakeApi } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { ApiError } from '../api.ts';

const loginRequired = () => new ApiError(401, 'login_required', 'Intră în cont ca să continui.');

describe('ConfirmEmailPage', () => {
  it('confirms the email of the link without a login, and only on the button', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValue(loginRequired());
    renderAdmin('/confirma-email#token-din-link', api);
    const button = await screen.findByRole('button', { name: 'Confirmă adresa' });
    expect(screen.queryByRole('heading', { name: 'Intră în cont' })).not.toBeInTheDocument();
    expect(api.confirmEmail).not.toHaveBeenCalled();
    await userEvent.click(button);
    expect(api.confirmEmail).toHaveBeenCalledWith('token-din-link');
    expect(await screen.findByRole('status')).toHaveTextContent('adresa ta este confirmată');
  });

  it('shows the server message for a link that no longer works', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValue(loginRequired());
    api.confirmEmail.mockRejectedValueOnce(new ApiError(404, 'bad_link', 'Linkul nu mai este valabil. Cere contul din nou de pe pagina de intrare.'));
    renderAdmin('/confirma-email#vechi', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmă adresa' }));
    expect(await screen.findByText(/Linkul nu mai este valabil/)).toBeInTheDocument();
  });

  it('asks to open the link again when it has no token', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValue(loginRequired());
    renderAdmin('/confirma-email', api);
    expect(await screen.findByText('Linkul nu este întreg. Deschide-l din nou din email.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmă adresa' })).not.toBeInTheDocument();
  });
});
