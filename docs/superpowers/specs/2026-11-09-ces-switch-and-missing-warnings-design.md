# MQGrader: the CES switch and the "what is missing" warnings — design

Status: approved in the visual companion on 2026-11-09 (mockup "ces-switch-and-warnings"); this text written from it. It builds on the CES variant (`2026-11-09-ces-variant-design.md`, PR #57, not merged yet) and ships in the same pull request.

## Why

A teacher easily forgets that a class has a CES student. Today "Test nou" says nothing about it, and the CES variant hides on the test page as an optional block. So she can print only the class test and go to class without the CES test. She also misses a missing test file or barem: the page shows "lipsește" in small grey text, and Pregătire can even say "gata" while the CES files are missing. Later this looks like a feature that "does not work".

Success: before she prints or starts a test, the teacher cannot miss that the class has a CES student, and she sees in one list what is still missing.

## Goals

1. **Test nou shows the CES students.** When the chosen class has at least one active CES student, a blue box under "Clasa și titlul" says "Clasa are N elev(i) cu CES" with their names, and holds a switch "Test separat pentru elevii cu CES", **on by default**. Its hint: "Pornit: elevii cu CES primesc testul lor, corectat cu baremul lor. Oprit: primesc testul clasei." A class with no CES student shows no box and no switch.
2. **With the switch on, the CES files sit next to the class files** on Test nou: "Testul CES" beside "Testul" (step 2), "Baremul CES" beside "Baremul" (step 3), each with the CES mark. The CES barem offers upload, or "Generează baremul CES din testul CES". With the switch off, the CES column is hidden.
3. **The switch is also on the test page**, in the "Varianta CES" block, with the CES students' names, so the teacher can change her mind.
4. **Turning the switch off means "no CES test for this test".** The CES students get the class test. Nothing asks for CES files again for that test. If the test has CES files, turning it off removes them (the same rule as "Șterge varianta CES" today: refused once a paper went to grading with the CES variant, 409 `ces_papers`). The page asks to confirm before it removes files. The switch replaces the "Șterge varianta CES" button.
5. **Turning it on again** asks for the CES files again. Uploading a CES file turns it on.
6. **What is missing, said clearly.** For a draft or open test, the missing parts are, in this order:
   - the test file ("testul");
   - the barem ("baremul"): no barem file and no generation running;
   - with the CES switch on and at least one active CES student in the class: the CES test file ("testul CES") and the CES barem ("baremul CES", same rule as the class barem).
   A generation that runs is not "missing" (it already shows "se generează"); a generated barem waiting to be checked keeps its own existing "De făcut" item.
7. **Where the list shows:**
   - Test nou: an orange box under "Creează testul": "Încă lipsesc:" and the list, plus "Poți crea testul acum și le adaugi mai târziu." It updates as files are chosen and goes away when nothing is missing. Creating is never blocked.
   - Test page, Pregătire: each file row carries a mark: orange "lipsește" when missing, green "gata" when present.
   - Test page, the stage bar: Pregătire is orange ("wait") with a short note while something is missing (for example "lipsesc testul CES și baremul CES"); it never says "gata" then.
   - "De făcut": the test is listed at Pregătire ("Adaugă ce lipsește"), so the stage bar and the menu count stay in agreement (the existing rule: a stage waits exactly when "De făcut" has the test at that stage). It comes after the existing generated-barem items.
   - Under "Începe testul" (draft): an orange box "Înainte să începi, lipsesc:" with each part and why it matters (the CES test: "elevul cu CES nu are ce primi pe hârtie"; a barem: "lucrările vor aștepta"). The button still works.
8. Student pages do not change. No student text says "CES".

This applies to **every** draft or open test, with or without CES students (the teacher asked for clearer warnings for a missing test or barem too). So a draft without its test file or barem is now orange at Pregătire and listed in "De făcut", where the redesign spec (§5, "De făcut" has exactly three cases; a missing file leaves Pregătire pale blue) said otherwise: this design changes that rule, and the redesign spec gets a line saying so. "De făcut" now has four cases; for a draft or open test, the new one comes right after the generated-barem items.

## Non-goals

- No blocking. Creating and starting a test always work; the teacher may bring the paper test and upload the file later.
- No change to grading. The robot, the claim, `paperVariantSql` and the CES waiting rules stay as in the CES variant design: a CES paper is a CES paper only when the test has a CES test file.
- No warnings for an evaluating or done test about the CES test file (it is too late: the student already wrote the class test). The existing "Încarcă baremul CES" item (CES papers wait for a missing CES barem) stays.

## Anti-goals

- A teacher who turned the switch off must never be nagged about CES files for that test.
- A class without CES students gets no CES box, no CES switch and no CES warnings. (Its missing test file or barem is now said more clearly: see goal 6.)
- Orange only for what waits on the teacher (the brand rule): the new orange marks are all things she must add.

## Decided by the teacher (in the conversation)

- The switch exists, on by default for a class with a CES student; off means no special test.
- The CES files sit beside the class files on Test nou (the teacher's own drawing).
- The warnings list sits under the start button and shows in the test's stages; the mockup was approved as drawn.

## Builder's calls (mine, open to correction)

- **Storage:** one new column, migration 0025: `tests.ces_off INTEGER NOT NULL DEFAULT 0` ("the teacher said no CES test"). Stored as "off" so that every existing test, and a test whose class gets a CES student later, defaults to "on". "On" is only meaningful when the class has an active CES student; the server computes "wanted" as `ces_off = 0 AND` an active CES student is enrolled.
- **The API:** `createTestBody` gets an optional `cesOff: boolean` (default false). A new teacher route `PUT /api/admin/tests/:code/ces/off` with `{ off: boolean }`: off removes the CES files in the same guarded write as today's removal and sets `ces_off = 1`; on sets `ces_off = 0`. Uploading a CES file sets `ces_off = 0` in the same UPDATE. `DELETE /:code/ces` may stay for compatibility or go; the UI no longer calls it.
- **The summary:** `TestSummary` gains what the list needs (the CES student count, `ces_off`, whether the CES test file and CES barem file exist, the CES barem request), so the Teste page, the class page and "De făcut" compute the same list. One shared function (`missingParts(test)`) gives the list in order; Test nou uses its own form state with the same wording.
- **Test nou data:** the CES students' names come from the class's student list the page can already fetch (`StudentRow.ces`, active only).
- **When both barems are generated**, the CES generation waits while the class barem is being generated (`barem_request = 'requested'` on the class side), so the CES barem is written with the class barem beside it and reuses its exercise ids. A condition on the CES barem job (`needsBaremSql('ces')` or the robot's task list), not on the request: the teacher can ask for both at once.
- **Generating the CES barem on Test nou** follows the existing order: the test is created, the files are uploaded, then the generations are asked for; the CES generation is asked for after the CES test file is uploaded. A failure is reported in the page's notice, like the class barem today.
- **Words:** Romanian with diacritics, as in the mockup. "lipsește" / "gata" marks; "Încă lipsesc:"; "Înainte să începi, lipsesc:"; De făcut task "Adaugă ce lipsește", text "Lipsesc: testul CES, baremul CES." (the list joined), short note "lipsesc …" / "lipsește …".

## Left to the builder

Component split, CSS names, test names, the exact confirm text for turning the switch off with files, and the phone layout (the two columns stack under 768 px, CES under class).
