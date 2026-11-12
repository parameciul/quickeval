import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FilesBeside } from './FilesBeside.tsx';

function setup(count = 2) {
  return render(
    <FilesBeside count={count} files={<ol aria-label="Pagini" />}>
      <p>Rezultatul</p>
    </FilesBeside>,
  );
}

describe('FilesBeside', () => {
  it('starts with the files hidden, the strip first and the result under it', () => {
    const { container } = setup();
    const strip = screen.getByRole('heading', { name: 'Fișiere (2)' });
    expect(strip.compareDocumentPosition(screen.getByText('Rezultatul')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Pagini' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Arată fișierele' })).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('.result-layout')).toHaveClass('is-collapsed');
  });

  it('shows the files beside the result, then hides them again', async () => {
    const { container } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Arată fișierele' }));
    expect(screen.getByRole('list', { name: 'Pagini' })).toBeInTheDocument();
    expect(screen.getByText('Rezultatul')).toBeInTheDocument();
    expect(container.querySelector('.result-layout')).not.toHaveClass('is-collapsed');
    const hide = screen.getByRole('button', { name: 'Ascunde fișierele' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(hide);
    expect(screen.queryByRole('list', { name: 'Pagini' })).toBeNull();
  });

  it('counts no files as zero', () => {
    setup(0);
    expect(screen.getByRole('heading', { name: 'Fișiere (0)' })).toBeInTheDocument();
  });
});
