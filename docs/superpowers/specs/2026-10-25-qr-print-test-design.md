# The test with a QR code, ready to print: design

Date: 2026-10-25. Status: draft for the user's approval.

## 1. Intent

Laura prints the test and hands it out on paper. Today the students reach the upload page through the link or the QR code that the test page shows on the screen or the projector. With this change, the printed test carries the QR code itself: each student scans the corner of their own sheet when they are done and uploads their work.

After the teacher starts a test, the test page offers **"Descarcă testul cu cod QR"**: a PDF of the teacher's test with the student upload QR code in the bottom-right corner of every page.

The user's main concern: **the test must not change**, because it is full of math symbols. Every choice below serves that.

## 2. Goals, non-goals, anti-goals

Goals:
- A PDF of the test with the upload QR code (the `/u/<uploadToken>` link) on every page, for a test uploaded as `.pdf` or `.docx`.
- The QR code never covers anything on the page.
- No AI makes or touches the file: plain programs only (LibreOffice, a Python stamp script).
- The work runs on the robot (the GitHub machine), started at once like every other robot job.

Non-goals:
- No QR code for the multi-upload link (the second link stays on screen only).
- No per-student PDFs (one PDF for the whole class; the QR code is the same for all).
- No print PDF for a test that is not open (students can upload only while it is open).
- No change to how the robot grades: grading still reads the teacher's original file.

Anti-goals (a failure even if it "works"):
- A symbol that changes or disappears (a red "¿", a missing letter, "∖" printed as "∣").
- The QR code on top of text, a formula, or a drawing.
- The upload link (a secret of the class) in the public robot logs.
- Any word on the PDF about a robot, AI, or grading.

## 3. What the spike proved (2026-10-25)

A throwaway spike in Docker (`ubuntu:24.04`, the base of `ubuntu-latest`) converted two of Laura's real Word worksheets with 51 and 100 equations (from `D:\Projects\Website\.work\`) and compared them with LibreOffice 26.2 on Windows:

| Setup on Linux | Result |
|---|---|
| Ubuntu's LibreOffice 24.2, `libreoffice-writer` only | Every equation missing. |
| + `libreoffice-math` | Equations present, but "sup" and "N*" become a red "¿". |
| LibreOffice 26.2 from the LibreOffice PPA, + `libreoffice-math` | Same as Windows, except the script letter "𝒱" is missing (Cambria Math is not on Linux). |
| PPA + `fonts-noto-core`, `fonts-dejavu-core` | "𝒱" is back, but "A ∖ {x₀}" prints as "A ∣ {x₀}": the meaning changes. |
| PPA + `fonts-stix` only | Every symbol right, but the result depends on which fonts the machine has: the GitHub image has many more than the spike. |
| PPA + a private fontconfig that hides the other fonts | Worse: LibreOffice's own fallback breaks, and "∈", "∀", "ℝ" vanish. |
| **LibreOffice 26.2.6.3 from The Document Foundation's archive (its own `.deb` set, with its own bundled fonts) in a clean `ubuntu:24.04` container**, + `fonts-liberation`, `fonts-crosextra-carlito`, `fonts-crosextra-caladea` | **Every symbol right, and it looks like the Windows output.** Line breaks can move slightly (Liberation fonts replace Times New Roman with the same widths). |

The stamp (PyMuPDF `show_pdf_page`, the QR drawn as vector squares with segno) keeps every page as vectors: text and formulas stay exact; only their size changes when a page must shrink. The QR code read back correctly from every page rendered at 300 dpi.

**Decisions:**
- A PDF test goes through untouched except for the stamp.
- A Word test is converted with exactly the last row's setup. The conversion and the stamp run inside a container built from a Dockerfile in the repo, so the fonts on the GitHub machine never matter. LibreOffice is pinned to 26.2.6.3, downloaded from `downloadarchive.documentfoundation.org` and checked against its SHA-256 (`fd0e8f8f2408dd2e5b90286e60f3f97cf566ba441cd48cfc5bcc68067303e0bc` for `LibreOffice_26.2.6.3_Linux_x86-64_deb.tar.gz`). A new LibreOffice comes only with a commit, after the same check on the two worksheets.
- The page tells the teacher to check a PDF made from a Word file before printing, and that uploading the test as a PDF (saved from Word) gives the exact file.

## 4. How it works

### 4.1 The flow

1. The teacher uploads the test (`.pdf` or `.docx`), as today.
2. The teacher starts the test (draft → open). The test gets its upload token.
3. If the test has a test file, the API starts the robot (`startRobot`). The same happens when the teacher uploads or replaces the test file on an open test, when the teacher reopens a test (evaluating or done → open) whose print PDF is missing, and on "Încearcă din nou". Root rule: every path that makes robot work starts the robot.
4. The robot's check sees a **print job**: an open test with a test file and no print PDF for its current test file.
5. The robot downloads the test file and the upload token, converts a Word file to PDF, stamps the QR code on every page, and uploads the PDF to the API.
6. The API stores it in R2 and marks the print PDF ready. The test page shows the download button.

The robot does print jobs first in a run, before exercise lists and gradings: the teacher is waiting for it, and it takes seconds once the container image is built (about a minute, once per run).

### 4.2 Data (migration 0014)

New columns on `tests`:
- `print_status TEXT NOT NULL DEFAULT 'none' CHECK (print_status IN ('none', 'ready', 'failed'))`
- `print_file_key TEXT` (the R2 key of the stamped PDF)
- `print_attempts INTEGER NOT NULL DEFAULT 0`

R2 key: `t/<teacherId>/<schoolYear>/<code>/print/<test-file-slug>-qr.pdf` (a new `printFileKey()` in `shared/files.ts`, next to `testFileKey`). The key comes from the row, never from listing R2.

Saving a new test file sets `print_status = 'none'`, `print_attempts = 0`, `print_file_key = NULL` in the same UPDATE, and the old print file is deleted quietly, like an old test file. A new barem does not touch the print PDF. Deleting a test deletes its print file with its other files.

A print job waits while `status = 'open' AND upload_token IS NOT NULL AND test_file_key IS NOT NULL AND print_status = 'none'` (one SQL condition `NEEDS_PRINT` in `server/db/runner.ts`, next to `NEEDS_EXERCISE_LIST`). It counts in `runCheck` (`hasWork` is true when only a print job waits), `listTasks`, and `testHasRobotWork`. After the migration, the tests that are open at that moment become print jobs; tests in evaluation or done do not, until they are reopened.

`TestFileKind` stays `'test' | 'barem'`: the teacher cannot upload a print file through the teacher route.

### 4.3 Robot API (`/api/runner`)

The robot today reads only tests in evaluation (`findRobotTest`), so a leaked robot key shows nothing of an open test. A print job needs an open test's file and upload token. The access widens only this far:

- `GET /tests/:id/print-job` → `{ testId, filesVersion, contentType, uploadToken }`, and `GET /tests/:id/print-job/file` → the test file. Both answer 404 unless the test is a waiting print job (`NEEDS_PRINT`), checked in their SQL. A test whose print PDF is ready or failed, or that is not open, shows nothing.
- `PUT /tests/:id/print` with the PDF as the body, `runId` and `filesVersion` in headers: saves only when the run holds the lease, the test still waits (`NEEDS_PRINT`), and `files_version` is the one the robot read (a PDF made from a replaced file is refused, 409 `not_needed`). The body is checked as a PDF (`looksLike`) and at most 25 MB, read with `arrayBuffer()` like other uploads. R2 write first, then the row; a refused row write deletes the new object.
- `POST /tests/:id/print-failed` `{ runId, filesVersion, error }`: one attempt more, under the same conditions; at 3 attempts `print_status = 'failed'`.

The robot builds the QR link itself: `<QUICKEVAL_URL>/u/<uploadToken>`. The token and the link never go to `log()`; logs carry the test id, the file type, the page count, durations, and error categories only. The scripts' output (LibreOffice prints the file path and its own messages) is never logged either.

### 4.4 The robot side (`runner/`)

- `runner/print/Dockerfile`: `ubuntu:24.04` pinned by digest; LibreOffice 26.2.6.3 from the archive with the SHA-256 check (§3); `fonts-liberation`, `fonts-crosextra-carlito`, `fonts-crosextra-caladea`; `python3` with pinned `pymupdf` and `segno`; no other fonts.
- `runner/print/docx_to_pdf.py`: a copy of `D:\Projects\Website\tools\docx_to_pdf.py`, unchanged except the header comment.
- `runner/print/stamp_qr.py`: the stamp, grown from the spike's `stamp.py` (§4.5), run as `python3 stamp_qr.py IN.pdf OUT.pdf URL LABEL`.
- `runner/printTask.ts`: reads the print job, writes the file into a task folder under the run folder, builds the image once per run (`docker build`), runs the scripts with `docker run --rm --network none -v <task folder>:/work`, uploads the result, removes the folder. A step that fails or times out (image build 10 min, each script 60 s) → `print-failed` with `crash` or `timeout`. An image build that fails ends the run's print jobs without counting attempts (the machine, not the file, is at fault) and makes the run exit 1, so GitHub sends an email.
- `run.ts` and `check.ts` load no new npm package: the PDF work is all in the container. The rule "run.ts loads only zod" stays, and its test stays green.
- A failed print job does not count in the run's "failures in a row" (that limit guards Claude's attempts).
- `RunSummary` gets a `prints` count.

### 4.5 The stamp

- QR code: the upload link, error correction M, about 2.3 cm with its quiet zone, black squares drawn as vectors, bottom-right corner, 0.5 cm from the paper edge.
- In the bottom-left corner, small grey text: the short link (`quickeval.pages.dev/u/<token>`), for a phone that cannot scan. No other words.
- Every page, whatever its size and orientation.
- **Space for the code:** if the bottom strip that holds the QR code and the link is empty on that page (no text, drawing, or image box intersects it), the page stays at 100%. Otherwise the page content shrinks just enough (about 90% for A4) and sits at the top, centered, so the code has a clean strip at the bottom. Pages stay vectors in both cases.
- The output keeps the page count of the input, and is checked with PyMuPDF before upload (opens, same page count).

### 4.6 The workflow (`evaluate.yml`)

No new install step: Docker is on the GitHub machine, and the robot builds the image inside the run only when a print job waits. The Grade step stays as it is; `run.ts` does the print jobs inside the same run and lease.

### 4.7 The teacher's page

A block "Testul pentru tipărit" on the test page, next to the student link, only while the test is open:
- No test file: "Încarcă testul ca să primești varianta cu cod QR."
- Waiting (`none`): "Se pregătește testul cu cod QR…". The page refreshes every 10 s, as it does for open tests.
- Ready: **"Descarcă testul cu cod QR"** (`GET /api/admin/tests/:code/print`, a PDF named `<code>-cu-cod-qr.pdf`). For a Word test, also: "PDF-ul a fost făcut din fișierul Word. Verifică-l înainte să-l tipărești. Pentru o copie exactă, încarcă testul ca PDF."
- Failed: "Nu am putut pregăti testul cu cod QR." and **"Încearcă din nou"** (`POST /tests/:code/print/retry`: `print_status = 'none'`, 0 attempts, then `startRobot`).
- When the robot could not start, the existing robot line says so.

`TestInfo` gets `print: { status, fromWord }`. No R2 key reaches the app.

## 5. Constraints

- Root `AGENTS.md`: every teacher query scoped by teacher id; checks inside the SQL of the write; `promoteDue` keeps running; R2 keys from rows; Functions ≤ 10 ms CPU and ≤ 15 D1 queries; Romanian UI text; no grading words for students.
- Migration 0014 runs on the live D1 before the code reaches `main` (`docs/deploy.md`).
- The repo and its Actions logs are public.
- PyMuPDF is AGPL; it runs only as a tool in the robot's container (as in the Website project), and this repo is public.

## 6. Testing

- API tests: the print job condition (draft, open, evaluating, done, no token, no file, ready, failed), the scoped robot reads (404 for a test that is not a print job), the save checks (lease, `files_version`, PDF bytes), attempts to `failed`, retry, a new test file resets the print PDF and deletes the old object, Start test, a new test file, and a reopen start the robot.
- Robot tests: `printTask.ts` with a fake container runner (success, failure, timeout, image build failure), print jobs first in a run, no token in the logs (the log test reads every line), `hasWork` with only a print job, `run.ts` still loads only zod.
- Container tests for `stamp_qr.py` and the conversion, run by Vitest only when Docker is available (skipped otherwise, like the pandoc test): page count kept, the QR code decodes to the link, an empty strip keeps 100% scale, a full strip shrinks, a landscape page, and one small Word file with an equation, `sup`, `ℕ*`, and `∖` that converts without a red "¿" (checked through the PDF's text and fonts).
- Page tests: each state of the block, the download link, retry.
- Before go-live: one real run on GitHub with one Word test and one PDF test of Laura's, looked at by the user.

## 7. Left to the builder (the plan)

- Exact names of files, functions, and Romanian strings beyond those above.
- The pinned image digest and Python package versions.
- The exact strip-emptiness check (PyMuPDF's text blocks, drawings, and images), with a full-page background box ignored.
- Whether the container image is cached between runs.
- Spec updates (§7, §8.2, §11.1, §11.3, §12) as the plan's first task.
- The spike's files are in the git-ignored folder `.superpowers/qr-print-spike/` (`stamp.py`, `Dockerfile.tdf`, `decode.py`, `run11.sh`); the plan copies what it keeps.
