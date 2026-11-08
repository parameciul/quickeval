import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('says so when the year has no classes, and offers "Clasă nouă"', async () => {
    renderAdmin('/clase', createFakeApi({ classes: [], students: {} }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Încă nu ai nicio clasă' })).toBeInTheDocument();
    expect(screen.getByText('Adaugă clasa cu numele elevilor, câte unul pe rând.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '+ Clasă nouă' }));
    expect(await screen.findByRole('dialog', { name: 'Clasă nouă' })).toBeInTheDocument();
  });

  it('opens "Clasă nouă" on the last class when a link asks for it', async () => {
    localStorage.setItem('quickeval:lastClass', '2');
    renderAdmin(
      { pathname: '/clase', state: { newClass: true } },
      createFakeApi({
        classes: [
          { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
          { id: 2, name: '9R2', schoolYear: 2026, archived: false, studentCount: 0 },
        ],
        students: {},
      }),
    );
    expect(await screen.findByRole('dialog', { name: 'Clasă nouă' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'Clasa 9R2' })).toBeInTheDocument();
  });

  it('lists the archived classes when the year has no active class', async () => {
    renderAdmin(
      '/clase',
      createFakeApi({
        classes: [{ id: 2, name: '9R2', schoolYear: 2026, archived: true, studentCount: 0 }],
        students: {},
      }),
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Nu ai nicio clasă activă' })).toBeInTheDocument();
    // One line: the word and the links stay together.
    expect(screen.getByText(/^Arhivate:/).parentElement).toHaveClass('class-empty-archived');
    expect(screen.getByRole('link', { name: 'Clasa 9R2' })).toHaveAttribute('href', '/clase/2');
    expect(screen.getByRole('button', { name: '+ Clasă nouă' })).toBeInTheDocument();
  });

  it('opens "Schimbă clasa" at "Arhivate" on the last class when a link asks for it', async () => {
    localStorage.setItem('quickeval:lastClass', '1');
    renderAdmin(
      { pathname: '/clase', state: { archived: true } },
      createFakeApi({
        classes: [
          { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
          { id: 2, name: '9R2', schoolYear: 2026, archived: true, studentCount: 0 },
        ],
        students: {},
      }),
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Clasa 6E2' })).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: 'Arhivate' })).toBeInTheDocument();
  });

  it('opens "Clasă nouă" at once when the year has no class and a link asks for it', async () => {
    renderAdmin({ pathname: '/clase', state: { newClass: true } }, createFakeApi({ classes: [], students: {} }));
    expect(await screen.findByRole('dialog', { name: 'Clasă nouă' })).toBeInTheDocument();
  });
});
