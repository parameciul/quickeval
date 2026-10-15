import type { TDocumentDefinitions } from 'pdfmake/interfaces';

// Makes the PDF in the browser. pdfmake and its font are about 2 MB, so they
// load only when the teacher asks for a PDF: the app itself stays small.
// Roboto, which pdfmake carries, holds every Romanian letter (ă â î ș ț, and
// the cedilla forms ş ţ that old texts use): `pdfText.test.ts` checks it.
export async function renderPdf(definition: TDocumentDefinitions): Promise<Blob> {
  const [{ default: pdfMake }, fonts] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  const vfs = (fonts as { default?: Record<string, string> }).default ?? (fonts as unknown as Record<string, string>);
  pdfMake.addVirtualFileSystem(vfs);
  pdfMake.addFonts({
    Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' },
  });
  return pdfMake.createPdf(definition).getBlob();
}
