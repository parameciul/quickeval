// Runs in the page head, before the stylesheet and the page's scripts, so the
// page never shows the wrong language first. Keep the storage key equal to
// LANG_KEY in src/i18n/lang.ts. Romanian is the default: only a saved choice
// changes it.
// A public page has a copy in the other language, named by data-twin on
// <html>: a reader who chose that language goes there. The apps have one page
// for both languages: the saved choice goes into <html lang>, which their
// code reads.
(function () {
  var saved = null;
  try {
    saved = localStorage.getItem('quickeval.lang');
  } catch (e) {
    // Storage can be blocked; the page then stays in its own language.
  }
  if (saved !== 'en' && saved !== 'ro') return;
  var html = document.documentElement;
  var twin = html.getAttribute('data-twin');
  if (twin) {
    if ((html.getAttribute('lang') || 'ro').slice(0, 2) !== saved) location.replace(twin + location.search + location.hash);
    return;
  }
  html.setAttribute('lang', saved);
})();
