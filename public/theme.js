// Runs in the page head, before the stylesheet, so the page never paints the
// wrong theme first. Keep the storage key equal to THEME_KEY in src/ui/theme.ts.
(function () {
  try {
    var theme = localStorage.getItem('quickeval.theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    // Storage can be blocked; the system theme then applies.
  }
})();
