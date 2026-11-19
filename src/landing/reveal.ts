// The entrances of the public pages: each part marked `.rise` comes up into
// place the first time it enters the screen. The page marks itself `.js`
// first, so a page without this script shows everything at once. The CSS
// moves nothing when the reader asks for less motion. Without
// IntersectionObserver every part shows at once.
export function initReveal(root: Document = document): void {
  root.documentElement.classList.add('js');
  const parts = Array.from(root.querySelectorAll<HTMLElement>('.rise'));
  const Observer = root.defaultView?.IntersectionObserver;
  if (!Observer) {
    for (const part of parts) part.classList.add('in');
    return;
  }
  const watch = new Observer(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        watch.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  for (const part of parts) watch.observe(part);
}
