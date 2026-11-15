// "Tipărește" (spec 2026-11-15 §3): the print PDF opens in the computer's
// print window, with no download. The API serves it `inline` and from the same
// origin, so a hidden frame can load it and print it.

// 'cancelled': a newer print, or the page, gave this one up while it loaded.
export type PrintOutcome = 'printed' | 'tab' | 'failed' | 'cancelled';

// How long the frame may take to load the PDF before the PDF opens in a tab.
export const PRINT_LOAD_TIMEOUT = 20_000;

// iPhone, iPad and Safari do not print a PDF inside a frame, and Firefox's PDF
// viewer hides the frame's page from ours (its contentDocument is null): the
// PDF opens in a new tab there, right in the click, where the browser's own
// viewer prints it. An iPad asks for the desktop site with a Mac's name, and
// has a touch screen.
export function printsInFrame(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod|Firefox\/|FxiOS\//.test(userAgent)) return false;
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return false;
  const safari = /Safari\//.test(userAgent) && !/Chrome\/|Chromium\/|CriOS\/|Edg\/|OPR\/|Firefox\/|FxiOS\//.test(userAgent);
  return !safari;
}

// The frame of the last print. A new print takes its place: removing it right
// after `print()` would close the print window in some browsers.
let lastFrame: HTMLIFrameElement | null = null;
// The print whose frame still loads: its timer, and how to end its promise.
let loading: { timer: number; resolve: (outcome: PrintOutcome) => void } | null = null;

// Gives up the print still loading and removes the last frame. A new print
// does it first; the page does it when the teacher leaves Tipărire, so no
// frame keeps a PDF open for the rest of the visit.
export function clearPrint(): void {
  if (loading) {
    window.clearTimeout(loading.timer);
    loading.resolve('cancelled');
    loading = null;
  }
  lastFrame?.remove();
  lastFrame = null;
}

// Prints the PDF at `url`: in a hidden frame where the browser can, else in a
// new tab. A frame whose page is not a PDF (an error answer) prints nothing:
// 'failed'. A frame the page cannot reach (a browser that shows the PDF from
// another origin), or that does not load in time, opens the tab instead. A tab
// the browser blocks (a tab opened after the click, once the frame loaded) is
// 'failed' too, so the button says so.
export function printPdf(url: string): Promise<PrintOutcome> {
  const openTab = (): PrintOutcome => {
    // Not 'noopener': with it, open() gives null even when the tab opened, and
    // a blocked tab could not be told apart.
    const tab = window.open(url, '_blank');
    if (!tab) return 'failed';
    tab.opener = null;
    return 'tab';
  };
  if (!printsInFrame(navigator.userAgent, navigator.maxTouchPoints ?? 0)) return Promise.resolve(openTab());

  clearPrint();
  const frame = document.createElement('iframe');
  frame.className = 'print-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  lastFrame = frame;

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      loading = null;
      frame.remove();
      resolve(openTab());
    }, PRINT_LOAD_TIMEOUT);
    loading = { timer, resolve };
    frame.addEventListener(
      'load',
      () => {
        window.clearTimeout(timer);
        loading = null;
        let type: string | undefined;
        try {
          type = frame.contentDocument?.contentType;
        } catch {
          type = undefined;
        }
        if (type === undefined) {
          frame.remove();
          resolve(openTab());
          return;
        }
        if (type !== 'application/pdf') {
          frame.remove();
          resolve('failed');
          return;
        }
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
          resolve('printed');
        } catch {
          frame.remove();
          resolve(openTab());
        }
      },
      { once: true },
    );
    frame.src = url;
    document.body.append(frame);
  });
}
