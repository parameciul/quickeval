// Keys on the review page act only when they are not typed into a field and
// not pressed in what opens over the page from the bars.

// A key typed in a field is text, not a command.
export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

// What opens over the page from the bars (a panel, the phone menu, the account
// menu) and the button of one while it is open: a key there is not for the
// review. A closed panel's button, where the focus goes back, is.
export const BAR_BOXES = '.panel, .phone-menu, .user-menu, [aria-expanded="true"]';

// A key that the review may take: not typed, not in what opened from the bars.
export function isReviewKey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || isTyping(event.target)) return false;
  return !(event.target instanceof Element && event.target.closest(BAR_BOXES));
}
