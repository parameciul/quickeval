import type { SubmissionFile } from '../../../shared/api.ts';
import { PHONE_IDLE_MS, PHONE_REFRESH_MS } from '../../../shared/quickTry.ts';

export interface PagesWatch {
  stop(): void;
  // After onIdle: reads at once and watches for another 15 minutes.
  again(): void;
}

// Reads the try's pages while the QR window shows: at once, then every 3 s,
// never in a hidden tab, and no more after 15 minutes with no new page (the
// D1 read limit). A failed read keeps the last pages; the next tick reads
// again. After stop(), nothing runs and a late answer is dropped.
export function watchPages(options: {
  read: () => Promise<SubmissionFile[]>;
  onPages: (pages: SubmissionFile[]) => void;
  onIdle: () => void;
  isVisible: () => boolean;
  refreshMs?: number;
  idleMs?: number;
  now?: () => number;
}): PagesWatch {
  const refreshMs = options.refreshMs ?? PHONE_REFRESH_MS;
  const idleMs = options.idleMs ?? PHONE_IDLE_MS;
  const now = options.now ?? (() => Date.now());
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Each start gets its own run: an answer of an older run is dropped.
  let run = 0;
  let count = -1;
  let since = now();

  const later = (current: number) => {
    timer = setTimeout(() => void tick(current), refreshMs);
  };

  async function tick(current: number): Promise<void> {
    if (current !== run) return;
    if (now() - since >= idleMs) {
      run += 1;
      options.onIdle();
      return;
    }
    if (options.isVisible()) {
      try {
        const pages = await options.read();
        if (current !== run) return;
        if (pages.length !== count) {
          count = pages.length;
          since = now();
        }
        options.onPages(pages);
      } catch {
        // The last pages stay; the next tick reads again.
        if (current !== run) return;
      }
    }
    later(current);
  }

  function begin(): void {
    if (timer) clearTimeout(timer);
    run += 1;
    since = now();
    void tick(run);
  }

  begin();
  return {
    stop() {
      run += 1;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    again: begin,
  };
}
