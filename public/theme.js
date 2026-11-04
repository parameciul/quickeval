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
})();
