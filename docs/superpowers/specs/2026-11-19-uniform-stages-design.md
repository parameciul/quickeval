# Uniform test stages (design A)

Date: 2026-11-19. The six stage panels of the test page get one shape, and the stages that have not started stop looking empty. Front end only: no API change, no new read, no migration.

Asked by the user after daily use: the design improved stage by stage, so the panels no longer look like one tool, and Corectare, Verificare and Rezultate look empty and unfinished while the test is still being prepared or printed. Chosen from a design page with screenshots of a working prototype (design A, rounds 1-3, the user's picks).

This spec replaces, where they disagree: the redesign spec `2026-11-04-mqgrader-redesign-design.md` §6 (a stage that has not come yet "says so in one line"), §8 and `2026-11-14-rezultate-page-design.md` (the publish buttons and the box of the two ways), §11.9 (Rezultate's empty state), `2026-11-14-verification-overview-design.md` (the progress row, the orange button and the green box of Verificare), and the orange "Înainte să începi" list under "Începe testul".

## 1. Every panel has the same shape

- The head, as before: the stage's name and its one-line sentence. Rezultate's sentence is one line too: "Publici rezultatele. Fiecare elev vede pe linkul lui nota, punctele pe exerciții și explicațiile."
- Then the "Acum" box (`NowBox` in `testPage/StageNow.tsx`), on all six stages: a small label ("Acum", or "Acum · te așteaptă", "Acum · corectarea nu a început", …), the state in one large line, one sentence, the stage's one action, and "Urmează" with a link to the next stage. A stage that is done has a green tick before its title.
- A band across the top of the box is a switch the teacher turns: the uploads (În clasă, Corectare) and the results (Rezultate). Green: on (students can upload, or see their results). Orange: off.
- Under the box, the stage's sections, each with one title style (`StageSection`: a 16px title and a grey count after it): "Fișierele", "Varianta CES", "De tipărit", "Cum trimit elevii lucrarea", "Lucrări", "De verificat", "Gata", "Cum își văd elevii rezultatul", "Elevii". Sections are 24px apart and use the panel's whole width (Pregătire's file cards too).
- One filled blue button per panel. "Începe verificarea" and "Continuă verificarea" are blue now, not orange.
- Labels are the app's tags everywhere: the files' "gata" (green), "lipsește" and "de verificat" (orange) use `.tag`, as "Publicat" and "Ciornă" do.

## 2. The boxes, stage by stage

- Pregătire: "Lipsește baremul" / "Lipsesc testul și baremul" / "Lipsește testul CES" (before the first grading, what `missingOf` names; after it, only a CES barem that CES papers wait for: a class that marks a student CES later has no CES test for its older tests, and their CES students were graded on the class's test), each with its own sentence, "Se generează baremul", "Verifică baremul generat", "Verifică baremul CES generat", "Se generează baremul CES", or, ticked, "Testul și baremul sunt gata" (on a done test: "Recorectează tot" after a new barem). Urmează: Tipărire.
- Tipărire: "Lipsește testul" (with the checklist), "Testul cu cod QR nu e pregătit" (a draft made before tests got their link: its button is below), "Se pregătește testul cu cod QR", "Testul cu cod QR nu s-a putut face", or, ticked, "Testul cu cod QR e gata de tipărit" (on an open test: print it again for a student who was away). After the test was given: ticked "Testul s-a dat în clasă", and the PDFs made before stay under "De tipărit" (no section when none was made). Urmează: În clasă. The print cards' titles are h4, under the section's h3.
- În clasă and Corectare: as before (design A of 2026-11-18), with the label "Acum" always shown.
- Verificare: "N puncte de verificat, la M elevi", the bar of Corectare (`now-bar`, a progress bar for screen readers), "X din Y puncte verificate." and the button; ticked "Toate cele N puncte sunt verificate", "Singurul punct de verificat e verificat" or "Nimic de verificat". Urmează: Rezultate. The lists "De verificat" and "Gata" are sections under it.
- Rezultate: see §4.

## 3. A stage that has not started

The same box, with a checklist of what the stage needs (`ReadyList`, a list named "Ce așteaptă etapa"): the stage list's own dots (blue tick done, orange dot waiting on the teacher, filled blue in progress, grey clock later), the thing, its state, and "Mergi la <stage>" to the stage that does it (named "Mergi la <stage>: <thing>" for a screen reader). On Verificare the grading's row says "o pornești tu" (open, grey), "se corectează lucrările" (in progress, blue) or "s-a terminat fără nicio lucrare corectată" (done with none graded, ticked): the colours of the stage list. Rows: the test file, the barem, the CES test and barem while the class has a CES student and the switch is on, the test with the QR code (În clasă), "Testul început", "Lucrări trimise" or "Lucrări corectate". Under the box the stage keeps its frame with the data the page already has:

- În clasă before the start: the checklist under "Începe testul", and "Poți începe oricum. Ce lipsește adaugi și după, la etapa Pregătire." while something waits. It never blocks the start.
- Corectare: the papers table with every student ("Nu a trimis"), under "Elevii" and its label (no bar since 2026-11-26).
- Verificare: "De verificat" with a dashed place and one sentence.
- Rezultate: the students' table ("Testul nu a început." on a draft) and "Raportul clasei" (which says it comes after the first grading).

## 4. Rezultate

- The box's band holds the switch "Rezultatele elevilor": "Publicate" / "Nepublicate". One click publishes every result, or stops them all, as the two buttons did; there is no extra question, as before. "1 rezultat publicat. Ceilalți elevi nu le văd încă." while only some are published alone; turning the switch on publishes them all.
- The title: "N rezultate gata de publicat", or "N elevi își pot vedea rezultatul" once published, or "Nicio lucrare nu e corectată acum" while the results are open and every paper is graded again. When stopping leaves nothing to manage, the switch goes and the focus goes to the panel's heading. The sentence: the points still to check, with a link to Verificare; else what a publish does, or what stopping does.
- Under the box, "Cum își (vor) vedea elevii rezultatul", in the rows of În clasă's ways (`.ways`):
  1. "Cu linkul sau biletul primit după trimitere": after sending, students get the result link and the result ticket (a QR code and a short code) on the phone. The teacher has each student's link in "Elevii".
  2. "Cu linkul sau codul QR al testului", with "Copiază linkul" and "Arată codul QR": from the phone that sent, they go straight to the result (the link was saved by itself); from another phone or a computer, they type the code of the ticket, which the teacher finds in "Elevii".
- The QR code is not on the page: "Arată codul QR" opens a window with the link, "Copiază linkul", "Pe tot ecranul" and "Descarcă codul QR". The word is "biletul", as on the student pages ("Salvează biletul").

## 5. The switches move at once

Both switches (uploads and results) showed the new state only after two trips to the server: the save, then a new read of the whole test. Now the switch shows the state asked for at the click (the mutation's variables while it saves), a little paler and unclickable until the read is done, and goes back with the error if the save fails. The whole test page shows that state meanwhile (`useShownDetail`, keyed by the saves' `mutationKey`): the ways in, Fișa testului, the stage list, and the students' table (every sent paper published, or none).

## 6. Fișa testului

A word in a tile (the barem's "lipsește") is set at text size (`is-word`); only numbers are large.
