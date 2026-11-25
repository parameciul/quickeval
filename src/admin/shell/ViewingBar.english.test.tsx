import '../../test/english.ts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi } from '../../test/fakeApi.ts';
import { ApiProvider } from '../ApiContext.tsx';
import { ViewingBar } from './ViewingBar.tsx';

describe('ViewingBar, in English', () => {
  it('says whose account, read only and until when, with Exit', () => {
    render(
      <ApiProvider api={createFakeApi({ classes: [], students: {} })}>
        <ViewingBar viewing={{ id: 1, teacher: { id: 3, name: 'Ana Pop' }, mode: 'view', expiresAt: '2026-11-25T12:32:00.000Z' }} />
      </ApiProvider>,
    );
    expect(screen.getByText("Viewing Ana Pop's account · read only · until 14:32")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument();
  });
});
