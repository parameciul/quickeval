import '../test/english.ts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { UPLOAD } from '../i18n/en/upload.ts';
import { createFakeUploadApi, LINK_TOKEN } from '../test/fakeUploadApi.ts';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import { UploadApp } from './UploadApp.tsx';

describe('the student pages in English', () => {
  it('show the class list, the English site links and the button back to Romanian', async () => {
    render(<UploadApp api={createFakeUploadApi()} token={LINK_TOKEN} />);
    expect(await screen.findByRole('heading', { name: 'Pick your name' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stan Eva, has sent' })).toBeDisabled();
    const banner = screen.getByRole('banner');
    expect(within(banner).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['https://mqgrader.ro/en/', 'https://mqgrader.ro/en/about/']);
    expect(within(banner).getByRole('link', { name: 'About' })).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: 'Română' })).toHaveTextContent('RO');
    expect(within(banner).getByRole('button', { name: 'Dark theme' })).toBeInTheDocument();
    expectNoGradingWords();
  });

  it('ask the student to confirm the name in English', async () => {
    render(<UploadApp api={createFakeUploadApi()} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pop Ion' }));
    expect(screen.getByRole('heading', { name: 'Are you Pop Ion?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Yes, let's start" })).toBeInTheDocument();
    expectNoGradingWords();
  });

  it('never say how the work is graded', () => {
    expectNoGradingWords(Object.values(UPLOAD).join('\n'));
  });
});
