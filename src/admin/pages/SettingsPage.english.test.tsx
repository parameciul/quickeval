import '../../test/english.ts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakeApi, fakeSettings } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

const withSettings = (settings = fakeSettings()) => createFakeApi({ classes: [], students: {}, settings });

describe('Setări, in English', () => {
  it('saves the Quick Tries at once when chosen', async () => {
    const api = withSettings();
    renderAdmin('/settings?tab=grading', api);
    const select = await screen.findByLabelText('Quick Tries at once');
    expect(select).toHaveAccessibleDescription(
      "How many Quick Tries their robot works on at the same time. More at once answer sooner, but reach the Claude plan's limit sooner.",
    );
    await userEvent.selectOptions(select, '4');
    expect(api.setMaxParallelTries).toHaveBeenCalledWith(4);
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.');
  });

  it('shows both robots', async () => {
    renderAdmin('/settings?tab=robot', withSettings());
    const teachers = await screen.findByRole('region', { name: "The teachers' robot" });
    expect(within(teachers).getByText('not working now')).toBeInTheDocument();
    const tries = screen.getByRole('region', { name: 'The Quick Try robot' });
    expect(within(tries).getByText('not working now')).toBeInTheDocument();
  });
});
