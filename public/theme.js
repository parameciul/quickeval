// Runs in the page head, before the stylesheet, so the page never paints the
// wrong theme first. Keep the storage key equal to THEME_KEY in src/ui/theme.ts.
// Light is the default: the system setting does not count, only a saved choice.
(function () {
  var theme = 'light';
  try {
    if (localStorage.getItem('quickeval.theme') === 'dark') theme = 'dark';
  } catch (e) {
    // Storage can be blocked; the page then stays light.
  }
  document.documentElement.setAttribute('data-theme', theme);
  // The page runs scripts: the landing page shows its try buttons from the
  // first paint (src/landing/landing.css), not after the API's answer.
  document.documentElement.setAttribute('data-js', '');
  // The public pages' header: a teacher who was logged in on the last visit
  // sees the account link at once, not the login first (src/landing/account.ts
  // keeps SIGNED_IN_KEY and corrects it after the API's answer).
  try {
    if (localStorage.getItem('quickeval.signedIn') === '1') document.documentElement.setAttribute('data-signed-in', '');
  } catch (e) {
    // Storage can be blocked; the page then shows the login first.
  }
})();
