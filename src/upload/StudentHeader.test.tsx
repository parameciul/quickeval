import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import { StudentHeader } from './StudentHeader.tsx';

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('StudentHeader', () => {
  it('links the mark and name to the site, with the lockup', () => {
    render(<StudentHeader />);
    const home = screen.getByRole('link', { name: 'MQGrader by Laura Miron' });
    expect(home).toHaveAttribute('href', 'https://mqgrader.ro/');
    expect(home).not.toHaveAttribute('target');
    expect(within(home).getByText('by Laura Miron')).toHaveClass('brand-by');
  });

  it('has the Despre link and the theme button, and no other link', () => {
    render(<StudentHeader />);
    expect(screen.getByRole('link', { name: 'Despre' })).toHaveAttribute('href', 'https://mqgrader.ro/despre/');
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByRole('navigation', { name: 'Pagina' })).toContainElement(screen.getByRole('link', { name: 'Despre' }));
    expect(screen.getByRole('button', { name: 'Temă întunecată' })).toBeInTheDocument();
    expectNoGradingWords();
  });

  it('switches the theme', async () => {
    render(<StudentHeader />);
    await userEvent.click(screen.getByRole('button', { name: 'Temă întunecată' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('button', { name: 'Temă luminoasă' })).toBeInTheDocument();
  });
});
