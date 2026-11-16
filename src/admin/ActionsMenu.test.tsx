import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ActionsMenu } from './ActionsMenu.tsx';

describe('ActionsMenu', () => {
  it('draws an icon on its button and on each item', async () => {
    render(
      <MemoryRouter>
        <ActionsMenu
          label="Acțiuni"
          menuId="m"
          actions={[
            {
              label: 'Redenumește testul',
              hint: 'Schimbi titlul.',
              icon: 'edit',
              busy: false,
              onChoose: () => {},
            },
            {
              label: 'Șterge testul',
              hint: 'Se șterge tot.',
              icon: 'trash',
              danger: true,
              busy: false,
              onChoose: () => {},
            },
          ]}
        />
      </MemoryRouter>,
    );
    const button = screen.getByRole('button', { name: 'Acțiuni' });
    expect(button.querySelector('svg.action-icon')).not.toBeNull();
    await userEvent.click(button);
    const menu = screen.getByRole('menu', { name: 'Acțiuni' });
    for (const name of ['Redenumește testul', 'Șterge testul']) {
      const item = within(menu).getByRole('menuitem', { name });
      expect(item.querySelector('svg.action-icon')).not.toBeNull();
      expect(item).toHaveAccessibleDescription();
    }
  });
});
