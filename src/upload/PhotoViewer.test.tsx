import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { PhotoViewer } from './PhotoViewer.tsx';

function Page() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Vezi pagina 1
      </button>
      {open && <PhotoViewer src="blob:photo" label="Pagina 1" onClose={() => setOpen(false)} />}
    </>
  );
}

describe('PhotoViewer', () => {
  it('takes the focus, and gives it back to what opened it when it closes', async () => {
    render(<Page />);
    const opener = screen.getByRole('button', { name: 'Vezi pagina 1' });
    await userEvent.click(opener);
    expect(screen.getByRole('button', { name: 'Închide' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
