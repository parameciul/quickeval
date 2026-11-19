import { afterEach, describe, expect, it, vi } from 'vitest';
import { initReveal } from './reveal.ts';

type Watcher = { callback: IntersectionObserverCallback; watched: Element[]; unobserve: ReturnType<typeof vi.fn> };

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.classList.remove('js');
  vi.unstubAllGlobals();
});

function mount() {
  document.body.innerHTML = '<h2 class="rise">Unu</h2><p class="rise">Doi</p><p>Trei</p>';
  return Array.from(document.querySelectorAll('.rise'));
}

describe('the entrances of the public pages', () => {
  it('marks the page, and brings each part in the first time it enters the screen', () => {
    const watchers: Watcher[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        watched: Element[] = [];
        unobserve = vi.fn();
        callback: IntersectionObserverCallback;
        constructor(callback: IntersectionObserverCallback) {
          this.callback = callback;
          watchers.push(this as unknown as Watcher);
        }
        observe(el: Element) {
          this.watched.push(el);
        }
      },
    );
    const [first, second] = mount();
    initReveal();
    expect(document.documentElement).toHaveClass('js');
    const [watcher] = watchers;
    expect(watcher!.watched).toEqual([first, second]);
    const entry = (target: Element, isIntersecting: boolean) => ({ target, isIntersecting }) as IntersectionObserverEntry;
    watcher!.callback([entry(first!, true), entry(second!, false)], watcher as unknown as IntersectionObserver);
    expect(first).toHaveClass('in');
    expect(second).not.toHaveClass('in');
    // A part that came in stays in: it is no longer watched.
    expect(watcher!.unobserve).toHaveBeenCalledWith(first);
  });

  it('shows every part at once where the browser cannot watch the screen', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const parts = mount();
    initReveal();
    for (const part of parts) expect(part).toHaveClass('in');
  });
});
