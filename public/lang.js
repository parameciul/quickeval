// Runs in the page head, before the stylesheet and the page's scripts, so the
// page never shows the wrong language first. Keep the storage key equal to
// LANG_KEY in src/i18n/lang.ts. Romanian is the default: only a choice
// changes it. The choice is the reader's saved one, or the ?lang= of a link
// made on an English page for another device (the Quick Try's phone code),
// which is then saved and taken out of the address: otherwise it would win
// again over the reader's next choice (RO reloads the same address).
// A public page has a copy in the other language, named by data-twin on
// <html>: a reader who chose that language goes there. The apps have one page
// for both languages: the choice goes into <html lang>, which their code
// reads, and data-title-en gives the page its English title.
(function () {
  var html = document.documentElement;
  var chosen = null;
  try {
    chosen = localStorage.getItem('quickeval.lang');
  } catch (e) {
    // Storage can be blocked; the page then stays in its own language.
  }
  var search = location.search;
  var asked = /[?&]lang=(en|ro)(&|$)/.exec(search);
  if (asked) {
    chosen = asked[1];
    try {
      localStorage.setItem('quickeval.lang', chosen);
    } catch (e) {
      // The choice then lasts for this page only.
    }
    var rest = search
      .slice(1)
      .split('&')
      .filter(function (part) {
        return !/^lang=(en|ro)$/.test(part);
      })
      .join('&');
    search = rest ? '?' + rest : '';
    try {
      history.replaceState(history.state, '', location.pathname + search + location.hash);
    } catch (e) {
      // The address keeps it; the page is still in the language asked for.
    }
  }
  if (chosen !== 'en' && chosen !== 'ro') return;
  var twin = html.getAttribute('data-twin');
  if (twin) {
    if ((html.getAttribute('lang') || 'ro').slice(0, 2) !== chosen) location.replace(twin + search + location.hash);
    return;
  }
  html.setAttribute('lang', chosen);
  var title = html.getAttribute('data-title-en');
  if (chosen === 'en' && title) document.title = title;
})();
