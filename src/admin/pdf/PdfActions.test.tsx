import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfActions } from './PdfActions.tsx';
import * as render_ from './renderPdf.ts';
import * as share from './share.ts';

vi.mock('./renderPdf.ts', () => ({ renderPdf: vi.fn() }));
vi.mock('./share.ts', () => ({ saveFile: vi.fn(), shareFile: vi.fn() }));

const renderPdf = vi.mocked(render_.renderPdf);
const saveFile = vi.mocked(share.saveFile);
const shareFile = vi.mocked(share.shareFile);
const blob = new Blob(['%PDF-'], { type: 'application/pdf' });

const pdf = { build: vi.fn(() => ({ content: ['ok'] })), fileName: 'raport.pdf', title: 'Raportul clasei' };

beforeEach(() => {
  vi.clearAllMocks();
  renderPdf.mockResolvedValue(blob);
});

describe('PdfActions', () => {
  it('makes the PDF only when a button is pressed, and saves it', async () => {
    render(<PdfActions pdf={pdf} />);
    expect(pdf.build).not.toHaveBeenCalled();
    expect(renderPdf).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Descarcă PDF' }));
    expect(pdf.build).toHaveBeenCalledTimes(1);
    expect(saveFile).toHaveBeenCalledWith(blob, 'raport.pdf');
    expect(shareFile).not.toHaveBeenCalled();
  });

  it('shares the PDF, and says nothing when it was shared', async () => {
    shareFile.mockResolvedValue('shared');
    render(<PdfActions pdf={pdf} />);
    await userEvent.click(screen.getByRole('button', { name: 'Trimite' }));
    expect(shareFile).toHaveBeenCalledWith(blob, 'raport.pdf', 'Raportul clasei');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says that the PDF was downloaded when sharing is not possible', async () => {
    shareFile.mockResolvedValue('downloaded');
    render(<PdfActions pdf={pdf} />);
    await userEvent.click(screen.getByRole('button', { name: 'Trimite' }));
    expect(await screen.findByText('Trimiterea nu merge pe acest dispozitiv. PDF-ul s-a descărcat.')).toBeInTheDocument();
  });

  it('says so when the PDF cannot be made, and lets the teacher try again', async () => {
    renderPdf.mockRejectedValueOnce(new Error('broken'));
    render(<PdfActions pdf={pdf} />);
    await userEvent.click(screen.getByRole('button', { name: 'Descarcă PDF' }));
    expect(await screen.findByText('PDF-ul nu a putut fi făcut. Încearcă din nou.')).toBeInTheDocument();
    expect(saveFile).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Descarcă PDF' }));
    expect(saveFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('PDF-ul nu a putut fi făcut. Încearcă din nou.')).not.toBeInTheDocument();
  });

  it('keeps the buttons off while the PDF is made', async () => {
    let finish: (value: Blob) => void = () => undefined;
    renderPdf.mockReturnValueOnce(new Promise<Blob>((resolve) => (finish = resolve)));
    render(<PdfActions pdf={pdf} />);
    await userEvent.click(screen.getByRole('button', { name: 'Descarcă PDF' }));
    expect(screen.getByText('Se face PDF-ul…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trimite' })).toBeDisabled();
    finish(blob);
    expect(await screen.findByRole('button', { name: 'Trimite' })).toBeEnabled();
  });

  it('saves the CSV without making a PDF, as UTF-8 text', async () => {
    render(<PdfActions pdf={pdf} csv={{ build: () => '﻿Elev;Nota\r\n', fileName: 'raport.csv' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Descarcă CSV' }));
    expect(renderPdf).not.toHaveBeenCalled();
    const [file, name] = saveFile.mock.calls[0]!;
    expect(name).toBe('raport.csv');
    expect((file as Blob).type).toBe('text/csv;charset=utf-8');
    expect(await (file as Blob).text()).toBe('Elev;Nota\r\n');
  });

  it('has no CSV button without a CSV', () => {
    render(<PdfActions pdf={pdf} />);
    expect(screen.queryByRole('button', { name: 'Descarcă CSV' })).not.toBeInTheDocument();
  });
});
