// The header menu of the public pages. On a phone the links of the header
// would leave no room for the account button, so they wait behind the ☰
// button and open under the header; on a wider screen they are in the header
// itself and the button is out of sight.
//
// Esc, a click elsewhere, a link and a screen grown past the phone close the
// menu again, and Esc gives the focus back to the button.

const PHONE = '(max-width: 900px)';

export function initSiteMenu(root: ParentNode = document): void {
  const button = root.querySelector<HTMLButtonElement>('[data-nav-toggle]');
  const links = root.querySelector<HTMLElement>('[data-nav-links]');
  if (button === null || links === null) return;

  const open = () => button.getAttribute('aria-expanded') === 'true';
  const set = (next: boolean) => {
    button.setAttribute('aria-expanded', String(next));
    links.classList.toggle('is-open', next);
  };

  button.addEventListener('click', () => set(!open()));
  // A link that stays on the page (the landing page's jumps) would leave the
  // menu open over the text it just scrolled to.
  links.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a') !== null) set(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !open()) return;
    event.preventDefault();
    set(false);
    button.focus();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!open() || !(event.target instanceof Node)) return;
    if (!links.contains(event.target) && !button.contains(event.target)) set(false);
  });

  // A window grown past the phone shows the links in the header, where an
  // open panel would sit over them.
  window.matchMedia?.(PHONE).addEventListener('change', (event) => {
    if (!event.matches) set(false);
  });
}
