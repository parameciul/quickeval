# Any subject, Plan C: the public site's text

**Spec:** `docs/superpowers/specs/2026-11-11-any-subject-design.md` ("The public site"). Plans A and B are merged (PR parameciul/quickeval#80). No migration.

**Goal:** no public page and no teacher page says that MQGrader grades only math. The product text names "profesori" and, where it lists them, the seven subjects. Laura Miron's description stays "profesoară de matematică".

**Architecture:** copy only. The five public pages, `public/llms.txt`, the shared footer (`src/landing/partials.ts`), the login page's line (`PITCH_LINE`, equal to the landing lede), `README.md`, and two share cards (`public/og-image.png`, `public/og-ghid.png`). The other three cards have no subject in them.

## Rulings

1. **The list of subjects** is written "matematică, fizică, chimie, biologie, științe, limba română și limba engleză", in the order of `shared/subjects.ts`. Where a short form fits better (a meta description of at most 160 characters), it is "de la matematică la limba engleză".
2. **Titles lose the subject, descriptions keep math in.** "Corectarea testelor după barem", "Cum corectezi testele după barem", "Baremul de corectare: ce este". The descriptions and the FAQ name math next to the other subjects, so the pages still answer a math search.
3. **What stays:** every fact about Laura (the bylines, `jobTitle`, "Laura Miron predă matematică", her site "Matematică cu Laura Miron", the contact lines); the screenshot's alt text "Verificarea într-un test de matematică" (it describes a real math test); the landing page's mock card "Inducție matematică" (an example test).
4. **New text:** the landing FAQ "Ce este MQGrader?" names the seven subjects (visible and JSON-LD, which a test keeps equal); Despre's facts get a row "Materii" with the seven subjects.
5. **Dates:** every page's `dateModified`, its byline ("actualizat 12 noiembrie 2026") and the sitemap's five `lastmod` move to 2026-11-12.
6. **Share cards:** drawn again at 1200×630 from an HTML template (`.superpowers/tools/anysubjectc/`, local only), in the look of the cards they replace; only their words change.
7. **A guard test** keeps "profesori(i) de matematică" and "testele/testelor de matematică" out of the pages, `llms.txt`, the footer and `PITCH_LINE`.
8. **After the deploy** the user runs `npm run indexnow` (it posts to an external service).

## The texts

| Place | Old | New |
| --- | --- | --- |
| Landing `<title>`, og/twitter title, WebPage name | MQGrader · corectarea testelor de matematică | MQGrader · corectarea testelor după barem |
| Landing description | MQGrader corectează cu AI testele de matematică după barem: elevii trimit … | MQGrader corectează cu AI testele după barem, de la matematică la limba engleză: elevii trimit pozele de pe telefon, iar profesorul verifică punctele nesigure. |
| Landing og:image:alt | MQGrader by Laura Miron: corectarea testelor de matematică | MQGrader by Laura Miron: corectarea testelor după barem |
| Landing audienceType | Profesori de matematică | Profesori de gimnaziu și liceu |
| Landing SoftwareApplication description | … testele de matematică după barem: … | … testele după barem, la matematică, fizică, chimie, biologie, științe, limba română și limba engleză: … |
| Landing lede, `PITCH_LINE` | … pentru profesorii de matematică din România. … | … pentru profesorii din România. … |
| Landing FAQ "Ce este MQGrader?" | … pentru profesorii de matematică. Elevii … | … pentru profesori. Corectează teste de matematică, fizică, chimie, biologie, științe, limba română și limba engleză. Elevii … |
| Landing FAQ question | Cum se corectează un test de matematică cu MQGrader? | Cum se corectează un test cu MQGrader? |
| Landing link to /ghid/, read-on links | Cum corectezi testele de matematică după barem | Cum corectezi testele după barem |
| /ghid/ title, og/twitter, name, h1 | Cum corectezi testele de matematică după barem | Cum corectezi testele după barem |
| /ghid/ description | … cum corectezi un test de matematică după barem, ce se poate automatiza, … | … cum corectezi un test după barem, de la matematică la limba engleză: ce se poate automatiza, … |
| /barem/ title, og/twitter, name | Barem de corectare la matematică: ce este | Baremul de corectare: ce este |
| /barem/ h1, read-on links | Baremul de corectare la matematică: ce este și cum îl folosești | Baremul de corectare: ce este și cum îl folosești |
| Footer note | Corectarea testelor de matematică · Timișoara · 2026 | Corectarea testelor după barem · Timișoara · 2026 |
| `llms.txt`, `README.md` | math teachers, profesorii de matematică | teachers, the seven subjects |

## Tasks

1. **Tests first.** Change `src/landing/landing.test.ts` (the lede, the ghid link), `src/landing/pages.test.ts` (the byline date and `dateModified`), and add the guard test. Run `npx vitest run src/landing src/admin/wayIn`: expect them to fail on the old texts.
2. **The texts.** Change the files of the table, the dates and the sitemap. Run the same tests: expect them to pass.
3. **The cards.** Draw `og-image.png` and `og-ghid.png` again, check that each is a 1200×630 PNG, and look at them.
4. **Check.** `npm run typecheck`, `TZ=UTC npm test`, and a look at the landing page, /ghid/, /barem/ and /despre/ at desktop width and at 375 px.
5. **Ship.** Commit, then push and open the PR after the user's yes.
