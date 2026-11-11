# Any subject: grading tests beyond math

Date: 2026-11-11. Status: decisions taken; for the user's final reading.

## Intent

MQGrader grades Romanian math tests. Nothing in the data model is about math: classes, tests, barems, points, photos, the review, the results and the reports work for any subject. What is math-only is the robot's grading skill (`.claude/skills/evaluate-test/`), one line of default barem notes, a few PDF symbols, and the public text of the site.

This feature lets MQGrader grade tests of more subjects: fizică, chimie, biologie, științe, limba română and limba engleză. The robot finds the subject of a test by itself, once per test; the teacher can change it. A test of any other subject (for example istorie) is refused with a clear message, before any paper is graded.

The user's words: the important thing is to keep the quality for math and do a best effort for the rest. There are no real tests, barems or papers of other subjects yet, so the new subjects' rules are written from the public Romanian exam formats (Evaluare Națională, Bacalaureat) and checked later on real papers.

## Goals

- The robot finds the subject of a test while it makes the exercise list (once per test, when the grading starts), and also when it generates a barem (earlier, when the teacher asks for one).
- Every later robot job of that test (the gradings, the CES variant, the class analysis) gets the subject and does no detection.
- The teacher sees the subject on the test and can change it ("Schimbă"), before or after the robot found it.
- A test of a subject that is not supported shows a message that names it ("Testul pare să fie de istorie. MQGrader corectează acum: …") and grades nothing.
- Math is graded exactly as today. Two automatic comparisons on real math tests from the live database prove it before the change goes live.
- The public site and the teacher app no longer say that MQGrader is only for math.

## Non-goals

- A subject picker that the teacher must fill in on "Test nou". The robot finds the subject; the teacher only fixes it.
- Real example barems, or rules tested on real papers, for the new subjects. They come later, when the teacher has them.
- Subjects outside the list. A new subject is a later change (a rules file and a list entry).
- A new brand or a new domain. The name stays MQGrader.
- Changing Laura Miron's own description ("profesoară de matematică"): it is a fact about her, not a claim about the product.

## Anti-goals (a failure even if it works)

- Any change in how a math test is graded: the points, the flags, the comments' style, the barem a generated math barem looks like.
- A subject detection per paper. It runs once per test.
- A test of an unsupported subject that uses up a demo account's one test or any of its papers.
- A wrong guess of the robot that the teacher cannot fix.
- Any word on a student page, a student PDF or a student-visible text about the subject detection or about how the work is graded (the existing `expectNoGradingWords()` rule).
- Names or student data in the repository, the robot's logs, or the comparison's report.

## Constraints

All the rules of `AGENTS.md`, `server/AGENTS.md`, `runner/AGENTS.md` and `src/AGENTS.md` apply. The ones that bite here:

- The migration runs on the live database before the code that needs it reaches `main` (`docs/deploy.md`).
- Every check of a write is inside its own SQL statement. Every teacher query is scoped by the teacher's id.
- Every path that makes robot work calls `startRobot`.
- The robot's Claude reads only its work folder; robot answers and logs carry no names.
- An older robot must keep working with the new API, and the new robot with the old API for the time of the deploy: new body fields are optional, as `createdAt` is today.
- At most 10 ms CPU and 15 D1 queries per request.
- User-facing text in Romanian; code, comments and docs in English.
- Tests that check exact text (`runner/skill.test.ts`, `src/landing/landing.test.ts`, `src/landing/pages.test.ts`, `src/admin/wayIn/WayIn.test.tsx`, `runner/workdir.test.ts`) change with the text.

## The parts the user decided

### The subjects

The supported subjects, in this order, with their Romanian names:

| Value | Name shown |
| --- | --- |
| `matematica` | Matematică |
| `fizica` | Fizică |
| `chimie` | Chimie |
| `biologie` | Biologie |
| `stiinte` | Științe |
| `romana` | Limba română |
| `engleza` | Limba engleză |

`stiinte` is for the middle-school tests that mix physics, chemistry and biology ("Științe ale naturii" and similar). Any other subject is "not supported".

### When the robot finds the subject

- In the exercise list step: it runs once per test, when the grading starts, before any paper is graded (`NEEDS_EXERCISE_LIST` needs the test in `evaluating`). Claude already reads the whole test there, so the detection costs no extra run. The robot gets the test's subject when it is known; when it is not, Claude finds it, reads that subject's rules, makes the list, and returns the subject with the list.
- In the barem step ("Generează baremul"), when the teacher asks for a barem before the test is given. The subject found there is saved, and the exercise list step later gets it.
- Not in a grading. The gradings of one test run in parallel, so "the first grading" would detect it several times. A grading always gets the subject from the test.
- A CES variant has the subject of its test: its barem and exercise list jobs get it and detect nothing.
- A test made before this feature is a math test: the migration gives it `matematica`, and the robot does no detection for it.

### The teacher can fix it ("Robot first, teacher can fix")

- The test page shows the subject in Fișa testului, with "Schimbă". Before the robot found it, it shows "Se stabilește la corectare" (builder's wording) and the same button lets the teacher set it ("Alege").
- A subject the teacher sets is never overwritten by the robot.
- Changing the subject after the exercise list exists makes the list again and grades the graded papers again, as "Recorectează tot" does. This regrade does not count again against a demo account's papers (see "The demo account" below).
- (Designer's call.) A subject the robot set is cleared when the teacher replaces the **test** file (the list is reset then too), so the new file is read again. A subject the teacher set stays. Replacing only the barem keeps the subject. The tests made before this feature count as set by the teacher, so nothing changes for them.
- (Designer's call.) The free regrade after "Schimbă" happens once per test. A later change of subject on the same test regrades as "Recorectează tot" does, with its normal demo limits. So a demo account cannot get free gradings by changing the subject again and again.
- (Designer's call.) A Quick Try has no "Schimbă": its robot work must stay bounded in SQL. The subject is not part of the try's allow-listed `PATCH /tests/<code>`.

### A subject that is not supported

- The exercise list is not used. The test shows, where the barem warnings show today (`ExerciseListBanner`): "Testul pare să fie de <subiect>. MQGrader corectează acum: matematică, fizică, chimie, biologie, științe, limba română și limba engleză." and "Schimbă" next to it, for a wrong guess.
- No paper is graded. There is no "Folosește oricum" for this case.
- A Quick Try with an unsupported subject ends with the same message, and gives back its IP place as a failed try does.

The details below are the designer's calls, made after the builder check; the user checks them when reading.

- **How it is stored.** An unsupported subject is stored as the value `alta` with its name (for example "istorie"), never as null. Null means only "not found yet", so a test known as unsupported is never sent to detection again.
- **Found by the barem step (before the test is given).** The generated barem is still saved and shown: it is harmless, and the teacher may want it. The message shows on the test page at once (Pregătire), with "Schimbă". "Începe testul" is not blocked: the students may still upload their pages.
- **Starting the grading of an unsupported test.** The start (now, scheduled or due) is refused in its SQL while the subject is `alta`, with the same message. No paper goes to the robot and no demo place is used.
- **Found by the exercise list step (the grading had started).** The list is saved with the new status (for example `unsupported`). The papers stay where they are (`submitted`), and no grading takes them, because a grading needs the list `ready` or `accepted`. The test does not go back to `open`, and the papers keep the teacher's selection.
- **"Schimbă" on an unsupported test** (every account): with the test in evaluation, the list is reset to `none` and the robot started. The list is made again with the new subject, and the waiting papers are graded with no new start by the teacher. On a draft or open test it only saves the subject.
- **The demo account.** A test whose subject is `alta` does not hold the demo account's one test (`ONLY_TEST`), and its waiting papers do not count among the papers on their way to the robot (`papersWaitingSql`, `PAPERS_LEFT`). The papers count only when they are graded, as today.
- **Quick Try.** A try learns the subject in its barem step (when the visitor gave no barem) or in its list step. Either way, an unsupported subject ends the try in the failed state that `GAVE_BACK` already knows, with the message, so the IP place goes back. A try has no "Schimbă" (see below).

### The barem note

`DEFAULT_BAREM_NOTES` (`runner/workdir.ts`) is the first line of every barem's notes, for every subject, math included. Its first sentence becomes:

"Nu puncta rezolvările care nu se bazează pe enunțul problemei sau care nu au legătură cu cerințele problemei."

(It was "ipoteza problemei".) The second sentence stays.

### Quality: math first, best effort for the rest

- The math rules stay word for word. The skill is split so that a math test gets the same instructions as today; only the general frame around them changes ("a teacher in Romania" in place of "a math teacher").
- The new subjects get one rules file each, written from the public exam formats, with no real example barem.
- In a subject other than math, the code also flags an item with "medium" confidence (today only "low" and "very_low" are flagged, in `checkGrading`). The teacher then checks more points while the rules are new. Math stays as today.
- In limba română and limba engleză, spelling and grammar count where the barem gives points for them. In the CES variant of those subjects, the CES rule "no points off for spelling" applies only where the CES barem says so.

### The public site

No public page and no teacher page says that the grading is only for math. The product text names "profesori" (not "profesori de matematică") and, where it lists them, the supported subjects. This touches the landing page (`index.html`), `/ghid/`, `/barem/`, `/despre/`, `/preturi/`, `public/llms.txt`, the shared footer note (`src/landing/partials.ts`), the login page's line (`PITCH_LINE` in `src/admin/wayIn/WayIn.tsx`, which repeats the landing page word for word), the share cards' alt texts and the JSON-LD. Laura Miron's description stays "profesoară de matematică". The sitemap's `lastmod` and each page's `dateModified` move to the day of the change; after the deploy, `npm run indexnow` announces the pages.

## Rules the builder must keep

### Data

- One migration (0028): `tests.subject`, null or one of the values above, and room for the name of an unsupported subject (for the message) and for who set the subject (robot or teacher). Existing tests get `matematica`. One subject per test: the CES variant has no subject of its own.
- `shared/` holds the list (values, Romanian names, the order) and the zod check. The API refuses a value outside the list.
- The subject goes to the teacher app in the test's detail and summary, and to the robot in `RobotTest` and `BaremJob`.

### The robot's answers

- The exercise list (`exerciseListSchema`) and the generated barem (`generatedBaremSchema`) get two fields: `subject` (one of the values, or `alta`) and `subjectName` (the subject in Romanian words, for `alta`; "" otherwise). They are an enum and a short string in the JSON Schema, so Claude cannot answer with a free value.
- The API saves the subject only while the test has none (in the SQL of the save, as `waitsForList` does for the list). A list for an unsupported subject is saved with a new list status (for example `unsupported`) that keeps every grading out, as `problem` does before the teacher accepts it, but with no accept.
- An answer with no `subject` (an older robot) saves nothing about the subject, and the test stays as it was.
- A grading with a null subject uses the math rules: that is today's behaviour.

### The skill

- `SKILL.md`: a teacher in Romania, any of the supported subjects. The exercise-list and barem modes say how to find the subject (from the test's heading first, then from its content; a mixed physics/chemistry/biology test is `stiinte`) and to read `references/subjects/<subject>.md` before the rest. The grade and class-report modes read the subject from a file the robot writes in the work folder (builder's call: `subject.md`), never guess it.
- `references/grading-rules.md` keeps the rules that hold for every subject. The math-specific rules move, word for word, into `references/subjects/matematica.md`. Together they say to a math test what the two files say today.
- One file per new subject in `references/subjects/`, with: how its tests and barems are built (exam formats), how partial points go, what to write in the comments (formulas, units, chemical equations in Unicode: H₂O, →, ⇌, ↑, ↓), and, for the language subjects, the rubric of an essay (content and writing) and the place of spelling and grammar.
- `barem-writing.md` and `barem-example.md` stay for math. For another subject, the barem mode follows that subject's file; there is no example barem yet.
- The robot copies the whole skill folder into every work folder, as today.

### The PDFs

`pdfSymbols.ts` maps the symbols that the PDF font lacks and that the new subjects use. The font check found ⇌, ↑ and ↓ missing (→ is already mapped). Subscript digits, ⁺, ⁻, °, Ω, μ, Δ and λ are drawn by the font. The existing font test (`pdf.test.ts`) covers the new mappings.

### The demo account

An unsupported test must not hold the demo account's one test (`ONLY_TEST`) or any of its papers (see "A subject that is not supported"). `tests_evaluated` stays a plain count. The first regrade made by "Schimbă" on a test does not take papers from the demo limit a second time: neither the regrade gate (`PAPERS_LEFT_TO_REGRADE`) nor the count of graded papers (the trigger of migration 0019, changed by migration 0028 if needed) counts the papers it grades again. How the trigger tells these papers apart is the builder's call.

### Limits

`MAX_BAREM_ITEMS` (items in one section of a generated barem) goes from 30 to 60, the size of `MAX_EXERCISES`, because a language test can have many small items.

## The math comparison (before the change goes live)

Two automatic comparisons, on two real math tests of the live database, prove that math is graded as before.

### What is compared

- The old side: the robot's code as it is on `main` before this change: the `evaluate-test` folder **and** the work folder code, so the old barem note ("ipoteza problemei") is used too.
- The new side: the same, on the feature branch.
- Both run with the same Claude model and effort as the robot (`claudeSettings()`), exactly as the robot runs them (`try:skill`'s work folder and Claude command).

For each of the two tests:

1. The exercise list, once with each skill, from the live test file, barem and barem notes. Compared: the ids, labels and points of the exercises, the totals, and the new skill's `subject` (it must be `matematica`).
2. The grading of each paper, once with each skill, against the same exercise list: the one the live test uses. Compared, for each item: the points; the flag; and, for both, the difference from the teacher's final points (`evaluation_items.points`, which hold the teacher's corrections; `ai_points` hold the robot's points of the time).
3. The generated barem, once with each skill, from the live test file alone. Compared: the structure (variants, subjects, item labels), the points of each item and the total, and the new skill's `subject` (it must be `matematica`). Both Word files go in the folder, for the user to read side by side.

### The tests and the papers

- Two math tests of Laura Miron's account, with their test file and barem, graded, and with teacher corrections if possible. The tool lists the candidates (code, number of graded papers, number of corrected items) and the user picks two (builder's call: the tool may suggest the two with the most corrected items).
- All the graded papers of each test, up to a cap the user sets when running the tool (builder's call: 10 per test by default, to keep the Claude usage within a day's limit).

### How the data is read

- Read only. `npx wrangler d1 execute quickeval --remote --json` for the rows, `npx wrangler r2 object get quickeval-files/<key> --remote` for the files. R2 keys come from the rows, never from listing R2. Nothing is written to the live database or R2.
- Everything lands in a folder outside the repository (the tool refuses a folder inside it), as `npm run try:skill` asks today, and the user deletes it after the comparison. Papers are named by number ("Lucrarea 1"), never by the student's name.

### The report

One Romanian report (a Markdown or HTML file in that folder), with no names:

- per test: the exercise lists side by side and the detected subject;
- per paper: the old total, the new total, the teacher's final total, and every item where the old and new points or flags differ, with both comments;
- a summary: the mean difference from the teacher's final points for each skill, the number of flags for each skill, and the number of items where the two skills differ.

### When it passes (builder's call, checked by the user)

Claude does not answer the same way twice, so some differences are noise. The comparison passes when, on both tests:

- the new skill's subject is `matematica`;
- the exercise lists have the same ids and points;
- the generated barems have the same structure, the same points per item and the same total;
- the new skill's mean difference from the teacher's final points is not larger than the old skill's by more than 0.1 points per paper;
- the number of flags differs by at most 10 %.

The user reads every item that differs before the merge. A failure stops the merge until the math rules are fixed.

### The tool

A script in `scripts/` (builder's call on its name, for example `npm run compare:skills`), run by the user on this PC, with their `CLAUDE_CODE_OAUTH_TOKEN` and their Wrangler login. It reuses `try:skill`'s code. The old side runs from a temporary checkout of `main` (for example `git worktree add`), so its skill and its work folder code are both the old ones; the new side runs from the branch.

## Left to the builder

- The exact Romanian wording of the subject line, the "Schimbă" dialog and the unsupported message, in the style of the existing pages.
- The column names of the migration and the new list status's name.
- How "Schimbă" after the list exists reuses `regradeTest` and the list reset (`server/db/runner.ts`, the reset when the files change).
- Where the supported subjects are listed on the public pages, and the new wording of the public pages, as long as no product claim names only math.
- The words of each new subject's rules file, from the public exam formats.

## Limba engleză: the texts for the student are in English

The user decided: on a limba engleză test, the texts the student reads (`comment`, `summary`, `strengths`, `recommendations`) are in English, the way an English teacher gives feedback in class. Everything else stays Romanian: the page around them, the labels, the texts for the teacher (`reviewReason`, the exercise list's `notes`, the class analysis), and the student PDF's headings.

- `references/subjects/engleza.md` says so, and keeps every other comment rule (kind, short, "you" to the student, what is right first, no name, nothing about the handwriting as a fault).
- The English texts never say how the work was graded, the same as the Romanian ones: no "AI", "robot", "Claude", "program", "automatic". The student-page tests check an English sample too (builder's call: the same `expectNoGradingWords()` with the English words added).
