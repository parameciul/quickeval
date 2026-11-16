# The test link after the results, and the student's answer in a correction

Two small changes, approved on 2026-11-16.

## 1. The test link once the results are published

### What happened

The teacher published the results of 7E2-26T2 and sent the students the test's link (`/u/<token>`), as the box in Rezultate offers. Students saw only the red line "Încărcarea s-a închis." and no result.

After the uploads close, the page shows the result links that this browser kept in `localStorage` when it sent a paper, stored per link token (`qe.result.<token>.<studentId>`). It shows nothing when the link opens in another browser or on another device, when the paper went through the test's other link (the link for many uploads has its own token), or when the browser's data is gone. The red line then reads as an error, though the results are open.

### Goal

A student who opens the test's link after the results are published either gets the kept result link, or reads plainly where the result is and whom to ask. No red error while results are published.

### Non-goals

- No way to reach a result from the test's link by picking a name: any student could then read a classmate's grade. A result stays behind its own secret link.
- No change to the lock of the default link after one upload, and none to the result page.

### Approaches

1. **A clearer closed page, and kept links found through both links of the test (chosen).** The server says whether results are published and gives the test a stable key; the page keeps a map from link token to that key, and shows the kept links of every token of the same test.
2. Pick a name on the test's link to see the result. Refused: it opens every result to the whole class.
3. Only change the text. Refused: a paper sent through the link for many uploads would still not be found from the test's default link, which is the link Rezultate shows.

### Design

- `GET /api/u/<token>` adds to `test`: `key` (an opaque text that is the same for both links of one test and differs between tests) and `resultsOpen` (the test's results are open for all, or some upload's result is published alone). `resultsOpen` is read by one more query only when the test is neither a draft nor open, so the upload requests of an open test read nothing more.
- The page remembers `qe.link.<token>` = the test's key on every load. On a closed test it also asks the server once for each other token that has a kept result link and no remembered key (at most 5), and remembers the answer; an unknown link is remembered as such and never asked again.
- The closed page shows the kept links of every token whose key is this test's.
- The closed page's words:
  - results not published: as today ("Încărcarea s-a închis.", the kept links, "Dacă nu ai trimis lucrarea, spune-i profesorului.");
  - results published, a kept link: "Rezultatele au fost publicate." (no alert) and the kept links;
  - results published, no kept link: "Rezultatele au fost publicate." and "Linkul cu rezultatul tău este salvat pe telefonul și în browserul cu care ai trimis lucrarea. Dacă nu îl găsești acolo, cere profesorului linkul tău."
- Rezultate, the second way ("Scanează din nou linkul testului pentru elevi") adds: on another phone or browser the test's link does not show the result, and the teacher sends that student's own link from "Elevii".
- No page says how the work is graded (`expectNoGradingWords()` on every new screen).

## 2. The student's answer in a correction

### What is wrong

The edit row of an exercise changes the points and the comment. "Răspunsul elevului", the answer as the robot read it from the paper, has no field. When the robot read it wrong, the teacher corrects the points, but the wrong text still goes to the student's result page and PDF.

### Goal

While editing an exercise, the teacher can also change "Răspunsul elevului". The student's page and PDF show the new text.

### Approaches

1. **One more field in the same edit row and the same write (chosen).** The correction's body takes `studentAnswer`; the same guarded UPDATE saves it.
2. A separate action for the answer. Refused: two saves for one look at an exercise.

### Design

- `correctItemBody` takes an optional `studentAnswer`: trimmed, at most `TEXT_LIMITS.studentAnswer` (500) characters, empty allowed.
- `correctItem` saves it in its UPDATE (`COALESCE`, as the comment), under the same `SHOWN` guard. A new answer marks the item changed by the teacher, updates the result's time and makes a ready class analysis stale, as a new comment does.
- The robot's first text is not kept (as for the comment): no migration.
- In the edit row, "Răspunsul elevului" is a text area with that label; "Salvează" sends it only when it changed.
- The same row serves the paper page and a Quick Try's page; the route is already on the try's allow-list.

## Left to the builder

The exact form of the test's key, the names of the new functions, and the CSS of the calm line on the closed page.
