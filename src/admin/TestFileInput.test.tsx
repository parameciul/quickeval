import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import type { MakePdf, PicturesResult } from '../ui/picturesPdf.ts';
import { TestFileInput } from './TestFileInput.tsx';

const pdf = (name: string) => new File(['%PDF-1.7'], name, { type: PDF_TYPE });
const photo = (name: string) => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], name, { type: 'image/jpeg' });

function setup(confirm?: (name: string) => boolean) {
  const onPick = vi.fn();
  const ends: ((result: PicturesResult) => void)[] = [];
  const makePdf = vi.fn<MakePdf>(() => new Promise((resolve) => ends.push(resolve)));
  render(<TestFileInput id="barem" label="Înlocuiește baremul" onPick={onPick} confirm={confirm} makePdf={makePdf} />);
  const input = screen.getByLabelText('Înlocuiește baremul');
  return { onPick, makePdf, input, end: (result: PicturesResult) => act(async () => ends[0]!(result)) };
}

describe('TestFileInput', () => {
  it('passes a PDF on as it is, after the teacher says yes to its name', async () => {
    const confirm = vi.fn(() => true);
    const { onPick, makePdf, input } = setup(confirm);
    const file = pdf('Barem.pdf');
    await userEvent.upload(input, file);
    expect(confirm).toHaveBeenCalledWith('Barem.pdf');
    expect(onPick).toHaveBeenLastCalledWith(file);
    expect(makePdf).not.toHaveBeenCalled();
    expect(screen.getByText('Barem.pdf')).toBeInTheDocument();
  });

  it('asks with the name of the PDF the photos will make, before reading them', async () => {
    const confirm = vi.fn(() => true);
    const { onPick, makePdf, input, end } = setup(confirm);
    const two = photo('IMG_2.jpg');
    const one = photo('IMG_1.jpg');
    await userEvent.upload(input, [two, one]);
    expect(confirm).toHaveBeenCalledWith('IMG_1.pdf');
    expect(makePdf).toHaveBeenCalledWith([one, two], 'IMG_1.pdf');
    expect(screen.getByText('Se pregătesc pozele…')).toBeInTheDocument();
    expect(input).toBeDisabled();
    const file = pdf('IMG_1.pdf');
    await end({ file });
    expect(onPick).toHaveBeenLastCalledWith(file);
    expect(screen.getByText('IMG_1.pdf, din 2 poze')).toBeInTheDocument();
    expect(input).toBeEnabled();
  });

  it('reads no photo when the teacher says no', async () => {
    const { onPick, makePdf, input } = setup(() => false);
    await userEvent.upload(input, [photo('IMG_1.jpg')]);
    expect(makePdf).not.toHaveBeenCalled();
    expect(onPick).toHaveBeenLastCalledWith(null);
    expect(input).toHaveValue('');
  });

  it('shows why photos could not be sent', async () => {
    const { onPick, input, end } = setup();
    await userEvent.upload(input, [photo('IMG_1.jpg')]);
    await end({ problem: 'Fișierul are peste 25 MB.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Fișierul are peste 25 MB.');
    expect(onPick).toHaveBeenLastCalledWith(null);
  });

  it('refuses a file that is not PDF, Word or a photo', async () => {
    const { onPick, input } = setup();
    await userEvent.upload(input, new File(['x'], 'notes.txt', { type: 'text/plain' }), { applyAccept: false });
    expect(screen.getByRole('alert')).toHaveTextContent('Încarcă un fișier PDF sau Word (.docx), ori poze JPG, PNG sau WebP.');
    expect(onPick).toHaveBeenLastCalledWith(null);
  });
});
