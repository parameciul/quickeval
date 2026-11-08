import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../../shared/files.ts';
import { FileDrop } from './FileDrop.tsx';

const pdf = (name: string) => new File(['%PDF-1.7'], name, { type: PDF_TYPE });
const text = () => new File(['x'], 'notes.txt', { type: 'text/plain' });

function setup(disabled = false) {
  const onPick = vi.fn();
  const { container } = render(<FileDrop id="drop" name="Fișierul testului" onPick={onPick} disabled={disabled} />);
  const area = container.querySelector('.file-drop')!;
  return { onPick, area };
}

describe('FileDrop', () => {
  it('names the file for a screen reader and takes a picked file', async () => {
    const { onPick, area } = setup();
    const input = screen.getByLabelText(/^Fișierul testului: Alege fișierul sau trage-l aici/);
    const file = pdf('Test.pdf');
    await userEvent.upload(input, file);
    expect(onPick).toHaveBeenLastCalledWith(file);
    expect(area).toHaveTextContent('Alege alt fișier sau trage-l aici');
    expect(area.querySelector('.file-drop-name')).toHaveTextContent('Test.pdf');
  });

  it('takes a file dragged onto it, and marks the area while it is over', () => {
    const { onPick, area } = setup();
    const file = pdf('Barem.pdf');
    fireEvent.dragOver(area, { dataTransfer: { files: [file] } });
    expect(area).toHaveClass('is-over');
    fireEvent.drop(area, { dataTransfer: { files: [file] } });
    expect(area).not.toHaveClass('is-over');
    expect(onPick).toHaveBeenLastCalledWith(file);
    expect(area.querySelector('.file-drop-name')).toHaveTextContent('Barem.pdf');
  });

  it('drops the mark when the file leaves the area', () => {
    const { area } = setup();
    fireEvent.dragOver(area, { dataTransfer: { files: [] } });
    fireEvent.dragLeave(area);
    expect(area).not.toHaveClass('is-over');
  });

  it('refuses a dropped file that is not PDF or Word, and forgets the file before it', () => {
    const { onPick, area } = setup();
    fireEvent.drop(area, { dataTransfer: { files: [pdf('Test.pdf')] } });
    fireEvent.drop(area, { dataTransfer: { files: [text()] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Încarcă un fișier PDF sau Word (.docx).');
    expect(onPick).toHaveBeenLastCalledWith(null);
    expect(area.querySelector('.file-drop-name')).toBeNull();
  });

  it('takes a good file after a refused one, and clears the problem', () => {
    const { onPick, area } = setup();
    fireEvent.drop(area, { dataTransfer: { files: [text()] } });
    const file = pdf('Test.pdf');
    fireEvent.drop(area, { dataTransfer: { files: [file] } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onPick).toHaveBeenLastCalledWith(file);
  });

  it('takes the same file again after a refused drop', async () => {
    const { onPick, area } = setup();
    const input = screen.getByLabelText(/^Fișierul testului/);
    const file = pdf('Test.pdf');
    await userEvent.upload(input, file);
    fireEvent.drop(area, { dataTransfer: { files: [text()] } });
    expect(input).toHaveValue('');
    await userEvent.upload(input, file);
    expect(onPick).toHaveBeenLastCalledWith(file);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the chosen file when what is dropped is not a file', () => {
    const { onPick, area } = setup();
    const file = pdf('Test.pdf');
    fireEvent.drop(area, { dataTransfer: { files: [file] } });
    fireEvent.dragOver(area, { dataTransfer: { files: [] } });
    fireEvent.drop(area, { dataTransfer: { files: [] } });
    expect(area).not.toHaveClass('is-over');
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(area.querySelector('.file-drop-name')).toHaveTextContent('Test.pdf');
  });

  it('tells a screen reader on the field why its file was refused', () => {
    const { area } = setup();
    fireEvent.drop(area, { dataTransfer: { files: [text()] } });
    expect(screen.getByLabelText(/^Fișierul testului/)).toHaveAccessibleDescription('Încarcă un fișier PDF sau Word (.docx).');
  });

  it('stops the browser from opening a file dropped beside the area, while it is shown', () => {
    const { unmount } = render(<FileDrop id="other" name="Fișierul baremului" onPick={() => {}} />);
    const files = { types: ['Files'], files: [pdf('Test.pdf')] };
    expect(fireEvent.dragOver(document.body, { dataTransfer: files })).toBe(false);
    expect(fireEvent.drop(document.body, { dataTransfer: files })).toBe(false);
    expect(fireEvent.drop(document.body, { dataTransfer: { types: ['text/plain'], files: [] } })).toBe(true);
    unmount();
    expect(fireEvent.drop(document.body, { dataTransfer: files })).toBe(true);
  });

  it('ignores a drop while it is off', () => {
    const { onPick, area } = setup(true);
    fireEvent.dragOver(area, { dataTransfer: { files: [] } });
    expect(area).not.toHaveClass('is-over');
    fireEvent.drop(area, { dataTransfer: { files: [pdf('Test.pdf')] } });
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Fișierul testului/)).toBeDisabled();
  });
});
