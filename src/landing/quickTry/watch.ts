import type { SubmissionFile } from '../../../shared/api.ts';
import { PHONE_IDLE_MS, PHONE_REFRESH_MS } from '../../../shared/quickTry.ts';

export interface PagesWatch {
  stop(): void;
  // After onIdle: reads at once and watches for another 15 minutes.
  again(): void;
}

// Reads the try's pages while the QR window shows: at once, then every 3 s,
// never in a hidden tab, and no more after 15 minutes with nothing new (the
// D1 read limit; only visible time counts). What counts as new is `progress`
// (by default, the number of pages). A failed read keeps the last pages; the
// next tick reads again. After stop(), nothing runs and a late answer is
// dropped.
export function watchPages<T = SubmissionFile[]>(options: {
  read: () => Promise<T>;
  onPages: (pages: T) => void;
  progress?: (pages: T) => string | number;
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
  const progress = options.progress ?? ((pages: T) => (pages as unknown as SubmissionFile[]).length);
  let count: string | number = -1;
  let since = now();
  // When the tab went hidden, or null while it shows. Taken from the
  // visibility events, not from the ticks: a hidden tab's timers run late.
  let hiddenAt: number | null = null;

  // Only visible time counts toward the 15 minutes: a hidden span moves
  // their start forward.
  const onVisibility = () => {
    if (!options.isVisible()) {
      hiddenAt ??= now();
    } else if (hiddenAt !== null) {
      since += now() - hiddenAt;
      hiddenAt = null;
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  const later = (current: number) => {
    timer = setTimeout(() => void tick(current), refreshMs);
  };

  async function tick(current: number): Promise<void> {
    if (current !== run) return;
    onVisibility();
    if ((hiddenAt ?? now()) - since >= idleMs) {
      run += 1;
      options.onIdle();
      return;
    }
    if (options.isVisible()) {
      try {
        const pages = await options.read();
        if (current !== run) return;
        const seen = progress(pages);
        if (seen !== count) {
          count = seen;
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
    hiddenAt = options.isVisible() ? null : since;
    void tick(run);
  }

  begin();
  return {
    stop() {
      run += 1;
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer) clearTimeout(timer);
      timer = null;
    },
    again: begin,
  };
}
