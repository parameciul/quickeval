import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState.tsx';
import { IconClasses } from './shell/icons.tsx';

describe('EmptyState', () => {
  it('shows a heading, one sentence and its one next step, with an icon a screen reader skips', () => {
    const { container } = render(
      <EmptyState icon={<IconClasses />} title="Încă nu ai nicio clasă" action={<button type="button">+ Clasă nouă</button>}>
        Adaugă clasa cu numele elevilor, câte unul pe rând.
      </EmptyState>,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Încă nu ai nicio clasă' })).toBeInTheDocument();
    expect(screen.getByText('Adaugă clasa cu numele elevilor, câte unul pe rând.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Clasă nouă' })).toBeInTheDocument();
    expect(container.querySelector('.empty-state-icon svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('takes the heading level of its place, and may have no button', () => {
    render(
      <EmptyState icon={<IconClasses />} title="Nimic nu te așteaptă acum" level={1}>
        Totul e la zi.
      </EmptyState>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Nimic nu te așteaptă acum' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
