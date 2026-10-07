import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary.tsx';

function Broken(): never {
  throw new Error('render failed');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('shows its children when nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>Conținut</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Conținut')).toBeInTheDocument();
  });

  it('shows a Romanian message and a reload button when a child crashes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Pagina nu s-a putut afișa. Reîncarcă pagina și încearcă din nou.');
    expect(screen.getByRole('button', { name: 'Reîncarcă pagina' })).toBeInTheDocument();
  });
});
