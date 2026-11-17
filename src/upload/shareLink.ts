// Sends a result link where the student will find it again: the phone's share
// sheet (their own chat, a message to a parent), else the clipboard, else the
// page shows the link to copy by hand.
export type LinkShare = 'shared' | 'cancelled' | 'copied' | 'manual';

export async function shareLink(data: { url: string; title: string; text?: string }): Promise<LinkShare> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (err) {
      // The student closed the share sheet: nothing more to do.
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(data.url);
    return 'copied';
  } catch {
    // No clipboard (an old browser, or a page not on https).
    return 'manual';
  }
}
