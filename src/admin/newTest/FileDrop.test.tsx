import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../../shared/files.ts';
import type { MakePdf, PicturesResult } from '../../ui/picturesPdf.ts';
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

  it('refuses a dropped file that is not PDF, Word or a photo, and forgets the file before it', () => {
    const { onPick, area } = setup();
    fireEvent.drop(area, { dataTransfer: { files: [pdf('Test.pdf')] } });
    fireEvent.drop(area, { dataTransfer: { files: [text()] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Încarcă un fișier PDF sau Word (.docx), ori poze JPG, PNG sau WebP.');
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
    expect(screen.getByLabelText(/^Fișierul testului/)).toHaveAccessibleDescription('Încarcă un fișier PDF sau Word (.docx), ori poze JPG, PNG sau WebP.');
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

  describe('photos of the pages', () => {
    const photo = (name: string) => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], name, { type: 'image/jpeg' });
    const built = (name: string) => new File(['%PDF-1.4'], name, { type: PDF_TYPE });

    // A PDF maker the test finishes by hand, so the wait can be seen.
    function pending() {
      const ends: ((result: PicturesResult) => void)[] = [];
      const makePdf = vi.fn<MakePdf>(() => new Promise((resolve) => ends.push(resolve)));
      return { makePdf, end: (index: number, result: PicturesResult) => act(async () => ends[index]!(result)) };
    }

    function setupPhotos() {
      const onPick = vi.fn();
      const maker = pending();
      const { container } = render(<FileDrop id="drop" name="Fișierul testului" onPick={onPick} makePdf={maker.makePdf} />);
      return { onPick, area: container.querySelector('.file-drop')!, ...maker };
    }

    it('says it takes photos too, and lets the picker choose many', () => {
      setupPhotos();
      const input = screen.getByLabelText(/^Fișierul testului/);
      expect(input).toHaveAttribute('multiple');
      expect(input.getAttribute('accept')).toContain('.jpg');
      expect(screen.getByText('PDF, Word sau poze')).toBeInTheDocument();
    });

    it('makes the photos one PDF, in the order of their names, and passes it on', async () => {
      const { onPick, area, makePdf, end } = setupPhotos();
      const two = photo('IMG_2.jpg');
      const one = photo('IMG_1.jpg');
      fireEvent.drop(area, { dataTransfer: { files: [two, one] } });
      expect(makePdf).toHaveBeenCalledWith([one, two], 'IMG_1.pdf');
      expect(screen.getByRole('status')).toHaveTextContent('Se pregătesc pozele…');
      expect(screen.getByLabelText(/^Fișierul testului/)).toBeDisabled();
      expect(onPick).not.toHaveBeenCalled();
      const file = built('IMG_1.pdf');
      await end(0, { file });
      expect(onPick).toHaveBeenLastCalledWith(file);
      expect(area.querySelector('.file-drop-name')).toHaveTextContent('IMG_1.pdf, din 2 poze');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByLabelText(/^Fișierul testului/)).toBeEnabled();
    });

    it('takes photos from the picker too', async () => {
      const { onPick, makePdf, end } = setupPhotos();
      const one = photo('scan.png');
      await userEvent.upload(screen.getByLabelText(/^Fișierul testului/), [one]);
      expect(makePdf).toHaveBeenCalledWith([one], 'scan.pdf');
      const file = built('scan.pdf');
      await end(0, { file });
      expect(onPick).toHaveBeenLastCalledWith(file);
      expect(screen.getByText('scan.pdf, din 1 poză')).toBeInTheDocument();
    });

    it('shows why the photos could not be made a PDF, and passes nothing on', async () => {
      const { onPick, area, end } = setupPhotos();
      fireEvent.drop(area, { dataTransfer: { files: [photo('IMG_1.jpg')] } });
      await end(0, { problem: 'Nu am putut citi poza IMG_1.jpg. Alege o poză JPG, PNG sau WebP.' });
      expect(screen.getByRole('alert')).toHaveTextContent('Nu am putut citi poza IMG_1.jpg.');
      expect(onPick).toHaveBeenLastCalledWith(null);
      expect(area.querySelector('.file-drop-name')).toBeNull();
    });

    it('refuses a PDF dropped with photos before reading any photo', () => {
      const { onPick, area, makePdf } = setupPhotos();
      fireEvent.drop(area, { dataTransfer: { files: [pdf('Test.pdf'), photo('IMG_1.jpg')] } });
      expect(makePdf).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('Alege un singur fișier PDF sau Word, ori numai poze.');
      expect(onPick).toHaveBeenLastCalledWith(null);
    });

    it('tells its page while the photos are being prepared, and when it is gone', async () => {
      const onBusy = vi.fn();
      const { makePdf, end } = pending();
      const { container, unmount } = render(<FileDrop id="drop" name="Fișierul testului" onPick={() => {}} makePdf={makePdf} onBusy={onBusy} />);
      expect(onBusy).toHaveBeenLastCalledWith(false);
      fireEvent.drop(container.querySelector('.file-drop')!, { dataTransfer: { files: [photo('IMG_1.jpg')] } });
      expect(onBusy).toHaveBeenLastCalledWith(true);
      await end(0, { file: built('IMG_1.pdf') });
      expect(onBusy).toHaveBeenLastCalledWith(false);
      fireEvent.drop(container.querySelector('.file-drop')!, { dataTransfer: { files: [photo('IMG_2.jpg')] } });
      expect(onBusy).toHaveBeenLastCalledWith(true);
      unmount();
      expect(onBusy).toHaveBeenLastCalledWith(false);
    });

    it('drops the PDF of photos that ends after the drop area is gone', async () => {
      const onPick = vi.fn();
      const { makePdf, end } = pending();
      const { container, unmount } = render(<FileDrop id="drop" name="Fișierul testului" onPick={onPick} makePdf={makePdf} />);
      fireEvent.drop(container.querySelector('.file-drop')!, { dataTransfer: { files: [photo('IMG_1.jpg')] } });
      unmount();
      await end(0, { file: built('IMG_1.pdf') });
      expect(onPick).not.toHaveBeenCalled();
    });
  });
});
