// "Tipărește" (spec 2026-11-15 §3): the print PDF opens in the computer's
// print window, with no download. The API serves it `inline` and from the same
// origin, so a hidden frame can load it and print it.

export type PrintOutcome = 'printed' | 'tab' | 'failed';

// How long the frame may take to load the PDF before the PDF opens in a tab.
export const PRINT_LOAD_TIMEOUT = 20_000;

// iPhone, iPad and Safari do not print a PDF inside a frame: the PDF opens in a
// new tab there, where the browser's own viewer prints it. An iPad asks for
// the desktop site with a Mac's name, and has a touch screen.
export function printsInFrame(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return false;
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return false;
  const safari = /Safari\//.test(userAgent) && !/Chrome\/|Chromium\/|CriOS\/|Edg\/|OPR\/|Firefox\/|FxiOS\//.test(userAgent);
  return !safari;
}

// The frame of the last print. A new print takes its place: removing it right
// after `print()` would close the print window in some browsers.
let lastFrame: HTMLIFrameElement | null = null;

// Prints the PDF at `url`: in a hidden frame where the browser can, else in a
// new tab. A frame whose page is not a PDF (an error answer) prints nothing:
// 'failed'. A frame the page cannot reach (a browser that shows the PDF from
// another origin), or that does not load in time, opens the tab instead.
export function printPdf(url: string): Promise<PrintOutcome> {
  const openTab = (): PrintOutcome => {
    window.open(url, '_blank', 'noopener');
    return 'tab';
  };
  if (!printsInFrame(navigator.userAgent, navigator.maxTouchPoints ?? 0)) return Promise.resolve(openTab());

  lastFrame?.remove();
  const frame = document.createElement('iframe');
  frame.className = 'print-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  lastFrame = frame;

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      frame.remove();
      resolve(openTab());
    }, PRINT_LOAD_TIMEOUT);
    frame.addEventListener(
      'load',
      () => {
        window.clearTimeout(timer);
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
