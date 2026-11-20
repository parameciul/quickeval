# English version of MQGrader

## Why

MQGrader will serve teachers outside Romania. The whole site needs an English
version: the five public pages, the teacher app, the student pages and the
Quick Try pages. Romanian stays the default. A reader switches the language
with one button, and the browser keeps the choice.

## Goals

- Every page has a language button (RO / EN) next to the theme button, and the
  teacher's phone menu has the same row.
- The choice is saved in `localStorage` (`quickeval.lang`, beside
  `quickeval.theme`). With no saved choice, every page is Romanian.
- The API's error messages and the emails follow the language of the page that
  made the request.
- The PDFs, the CSV, the dates and the counts follow the page language.
- The English public pages use English pictures: the app screens are shot again
  with the app in English and with English child names, and the share cards
  (`og-*.png`) get English copies.
- From now on, every change updates both languages. A missing English text
  fails the typecheck or a test.

## Non-goals

- The robot's own text (the feedback on a paper, the class analysis, a
  generated barem) stays in the language the robot writes, Romanian. A later
  phase may store a language per test and pass it to the robot.
- The teacher's own data (class names, test titles, student names) is never
  translated.
- No language stored on the server: the browser keeps it, and each request
  says it.

## Anti-goals

- No page tells students that AI grades their work, in English either.
- No Romanian page changes its address or its look, apart from the new button.
- The existing tests, which read Romanian text, keep passing unchanged.

## Approaches

1. **Romanian text as the key (picked, my call).** `t('Trimite lucrarea')`. The
   English dictionary is a `const` object keyed by the Romanian text, and `t()`
   takes only its keys, so a new `t()` without an English entry fails
   `npm run typecheck`. The code stays readable and the Romanian tests do not
   change. Values with numbers or names use `{name}` placeholders.
2. Named keys (`t('upload.send')`) with two dictionaries. Every string and every
   test would change, and the code would lose the visible text. Rejected.
3. A library (i18next, react-intl). A new dependency, and it adds nothing the
   typed dictionary does not give. Rejected.

For the public pages (my call): English copies at their own addresses, `/en/`,
`/en/guide/`, `/en/marking-scheme/`, `/en/about/`, `/en/pricing/`, with
`hreflang` both ways, their own canonical and the English pages in the sitemap.
A search engine can then show the English pages to English searchers. A small
head script (`public/lang.js`, an external file, as the security policy allows
no inline script) sends a reader with a saved choice to the copy in their
language.

## How it works

- `src/i18n/lang.ts`: the language (`'ro' | 'en'`), read from `localStorage`;
  `setLang()` saves it, sets `<html lang>` and tells its listeners.
  `src/i18n/t.ts`: `t(key, params?)`, the plural helper and the locale for
  `Intl` (`ro-RO` or `en-GB`, always the Europe/Bucharest time zone).
  `src/i18n/en/*.ts`: the English text by area.
- The React apps render again when the language changes (the root is keyed by
  the language). Code outside React (formatters, the PDF, the CSV, the landing
  scripts) calls `t()` at the moment it makes its text.
- The API: every fetch sends the header `X-MQ-Lang: en` when the language is
  English. The error handler of `server/app.ts` translates the message of an
  `ApiError` and of a zod issue through a shared dictionary of patterns
  (`shared/i18n/messages.ts`), so the throw sites keep their Romanian text.
  Emails are built with the request's language.
- Guards:
  - the typed `t()` (typecheck);
  - a test that parses the `.tsx` files and fails on JSX text, or on an
    `aria-label`, `title`, `placeholder` or `alt` literal, that is not in `t()`;
  - a test that every Romanian API message has an English pattern;
  - a test that every Romanian public page has an English twin with the same
    `id`s, the same number of pictures and `hreflang` both ways;
  - `expectNoGradingWords()` also checks English words, on the English renders.
- `AGENTS.md` and `src/AGENTS.md` get the rule: every change updates both
  languages.

## Phases (one commit each)

1. The language core, the button, the guards.
2. The student pages and the Quick Try pages.
3. The teacher app.
4. The API messages, the emails, the PDFs, the CSV.
5. The English public pages and their pictures.

## Left to the builder

- The exact English wording, kept plain and short, in the voice of the
  Romanian text.
- `public/app-graded-paper-v2.png` is a real handwritten paper: its names and
  the app around it can change, not the handwriting.
