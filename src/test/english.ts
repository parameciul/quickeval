// Import this first in a test file of an English page: the page reads its
// language from <html lang>, which public/lang.js sets before the app loads,
// and some of its text is made when its modules load.
document.documentElement.lang = 'en';
