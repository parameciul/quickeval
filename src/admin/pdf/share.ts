// Gives a file to the teacher: "Descarcă" saves it; "Trimite" opens the share
// sheet of the phone (Web Share API) with the file, and saves it when sharing
// is not possible (spec §14.1). The share sheet needs a fresh tap of the
// user, which a slow PDF can use up: then the file is saved too, and the
// teacher can send it from the downloads.

export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

// Saves a file through a link that points to it.
export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // The download has started when click() returns; the address can go a moment later.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function shareFile(blob: Blob, fileName: string, title: string): Promise<ShareResult> {
  const file = new File([blob], fileName, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      // The teacher closed the share sheet: nothing more to do.
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }
  saveFile(blob, fileName);
  return 'downloaded';
}
