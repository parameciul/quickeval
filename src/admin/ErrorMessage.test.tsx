import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError, LoginExpiredError } from './api.ts';
import { ErrorMessage } from './ErrorMessage.tsx';

describe('ErrorMessage', () => {
  it('shows a generic Romanian text for an unknown error', () => {
    render(<ErrorMessage error={new Error('Failed to fetch')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('A apărut o eroare. Încearcă din nou.');
    expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();
  });

  it('shows the message of an ApiError', () => {
    render(<ErrorMessage error={new ApiError(409, 'class_exists', 'Clasa 6E2 există deja în anul școlar 2026-2027.')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Clasa 6E2 există deja în anul școlar 2026-2027.');
  });

  it('shows the expired login with a reload button', () => {
    render(<ErrorMessage error={new LoginExpiredError()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Sesiunea a expirat. Reîncarcă pagina ca să intri din nou.');
    expect(screen.getByRole('button', { name: 'Reîncarcă pagina' })).toBeInTheDocument();
  });
});
