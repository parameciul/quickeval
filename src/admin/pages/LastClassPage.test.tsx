import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

describe('LastClassPage', () => {
  it('opens the last class seen', async () => {
    localStorage.setItem('quickeval:lastClass', '2');
    renderAdmin('/clase', createFakeApi({
      classes: [
        { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
        { id: 2, name: '9R2', schoolYear: 2026, archived: false, studentCount: 0 },
      ],
      students: {},
    }));
    // /clase navigates to the last class seen, so its class page renders.
    expect(await screen.findByText('Clasa 9R2')).toBeInTheDocument();
    expect(screen.queryByText('Clasa 6E2')).not.toBeInTheDocument();
  });

  it('opens the first class when none was seen before', async () => {
    localStorage.removeItem('quickeval:lastClass');
    renderAdmin('/clase', createFakeApi({
      classes: [
        { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
        { id: 2, name: '9R2', schoolYear: 2026, archived: false, studentCount: 0 },
      ],
      students: {},
    }));
    expect(await screen.findByText('Clasa 6E2')).toBeInTheDocument();
  });

  it('skips an archived last class and opens the first active one', async () => {
    localStorage.setItem('quickeval:lastClass', '2');
    renderAdmin('/clase', createFakeApi({
      classes: [
        { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
        { id: 2, name: '9R2', schoolYear: 2026, archived: true, studentCount: 0 },
      ],
      students: {},
    }));
    expect(await screen.findByText('Clasa 6E2')).toBeInTheDocument();
  });

  it('says so when the year has no classes', async () => {
    renderAdmin('/clase', createFakeApi({ classes: [], students: {} }));
    expect(await screen.findByText('Nu ai nicio clasă în acest an școlar.')).toBeInTheDocument();
  });
});
