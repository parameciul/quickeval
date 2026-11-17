import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakeApi } from '../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../test/renderAdmin.tsx';
import { ApiError } from './api.ts';

const loginRequired = () => new ApiError(401, 'login_required', 'Intră în cont ca să continui.');

// The teacher app's addresses were Romanian until 2026-11-17: emails already
// sent and bookmarks still hold them.
describe('the old Romanian addresses of the teacher app', () => {
  it('opens the new password page from an old email link, logged out, with its token', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValue(loginRequired());
    renderAdmin('/parola-noua#token-din-link', api, <LocationProbe />);
    await expectLocation('/new-password#token-din-link');
    await userEvent.type(await screen.findByLabelText(/Parola nouă/), 'parola-noua-lunga');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează parola' }));
    expect(api.setNewPassword).toHaveBeenCalledWith('token-din-link', 'parola-noua-lunga');
  });

  it('opens the email confirmation from an old email link, logged out, with its token', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValue(loginRequired());
    renderAdmin('/confirma-email#tok_EN-1', api, <LocationProbe />);
    await expectLocation('/confirm-email#tok_EN-1');
    expect(screen.queryByRole('button', { name: 'Intră în cont' })).not.toBeInTheDocument();
  });

  it('opens the sign-up from the old landing link', async () => {
    const api = createFakeApi();
    api.me.mockRejectedValue(loginRequired());
    renderAdmin('/#cont-nou', api, <LocationProbe />);
    await expectLocation('/#new-account');
    expect(await screen.findByRole('heading', { name: 'Cont nou de profesor' })).toBeInTheDocument();
  });

  it.each([
    ['/teste/nou?clasa=1', '/tests/new?class=1'],
    ['/teste/6E2-26T1#corectare', '/tests/6E2-26T1#grading'],
    ['/teste/6E2-26T1/raport', '/tests/6E2-26T1/report'],
    ['/clase/1', '/classes/1'],
    ['/elevi/10', '/students/10'],
    ['/cautare?q=pop&arata=elevi', '/search?q=pop&show=students'],
    ['/setari?tab=robotul', '/settings?tab=robot'],
    ['/cont', '/account'],
    ['/?clasa=1&arhivate=1', '/?class=1&archived=1'],
    ['/setari?plata=reusita&session_id=cs_test_1', '/settings?payment=success&session_id=cs_test_1'],
  ])('sends the bookmark %s to %s', async (old, now) => {
    renderAdmin(old, createFakeApi(), <LocationProbe />);
    await expectLocation(now);
  });

});
