# Limba română

The general rules hold, except where this file says otherwise. When the barem says something else, the barem wins.

## How the tests are built

- The Evaluare Națională for the 8th grade (and its simulations): Subiectul I (70 points) has two parts, A. (questions on two texts, a literary one and a non-literary one: blanks, multiple choice, true/false tables, short open answers with a number of words) and B. (grammar and language: multiple choice, cases, sentences to build, clauses to count, a text to correct). Subiectul al II-lea (20 points) is a composition of at least 150 words. There is no Subiectul al III-lea. 10 points are "din oficiu".
- The Bacalaureat: Subiectul I (questions on a text: the meaning of words, the ideas of the text, grammar), Subiectul al II-lea (a short text: an argument, a characterization, a comment), Subiectul al III-lea (an essay). A school test may have subjects of its own.
- Grammar items (the part of speech, the function, a sentence to build) and short answers get their points as the barem gives them.
- A text the student writes is graded by criteria: the content (what it must say) and the writing ("redactare": the organization of the ideas, the expression, the spelling, the punctuation, the number of words). The barem gives the points of each criterion.

## Points

- An answer that keeps the meaning that the barem asks for gets the points, also in other words, unless the barem asks for a precise form.
- Spelling, punctuation and grammar take points only where the barem gives points for them (usually in "redactare"). They do not take points off a short answer whose meaning is right, unless the barem says so.
- In an essay, judge each criterion on its own and give it the points the barem allows. When the points of a criterion depend on your judgment (the originality, the coherence, the fluency of the expression), give your best points and flag the item, with a short reason for the teacher.
- A text shorter than the number of words that the barem asks for gets what the barem says for that case.
- When the barem gives points for the layout or for how easy the writing is to read ("așezarea în pagină", "lizibilitatea"), do not judge it from a photo: give your best points and flag the item.

## The texts

- `studentAnswer` of an essay: not the essay itself. Write a short description, for example "Eseu de aproximativ 300 de cuvinte despre …".
- The comments name a spelling or punctuation mistake with its correction ("Scrie „niciun”, nu „nici un”.").
- The rule about Unicode math does not matter here; write normal Romanian text.

## The CES variant

The general rule for CES papers ("no points taken off for spelling") holds only where the CES barem does not give points for spelling. Where it does, follow the CES barem.

## The mode `barem`

Read `references/barem-example-romana.md` too: a real test of the Evaluare Națională and its official barem. Copy its form and its way of sharing the points, not its contents. `references/barem-example.md` (math) still gives the general form: the header, the subjects with their points, the steps with whole points on the right. Where this section differs from `references/barem-writing.md`, this section wins.

- The steps follow the criteria of each item, not the math rules of `references/barem-writing.md` on the size of a step: here a step may hold more than half of the points of its item, and an item may have more than four steps (one for each statement of a true/false table). Never more than 12 steps in one item.
- The "Precizări" are three, not the four of the math example (unless `notes.md` asks for others; for the CES variant, the CES "Precizări" of `references/barem-writing.md` win):
  1. Se punctează orice modalitate de rezolvare corectă a cerințelor.
  2. Nu se acordă punctaje intermediare, altele decât cele precizate explicit în barem.
  3. The "din oficiu" points, the total, and the grade: the total points divided by 10.
  Do not write the math rule that a result without its justifications gets at most half of the points.
- Keep the test's own parts and labels. A subject split into "A." and "B." is one section: its items are labeled "A. 1.", "2.", …, then "B. 1.", "2.", …. Never make A and B separate `parts`: `parts` are variants.
- A closed item is one step with all its points: "Încercuirea literei corespunzătoare răspunsului corect: b". Solve it yourself (count the sounds, find the case, the formation of the word) and write the letter.
- A blank to fill in: one step for each blank, with examples of right answers "(de exemplu: …, … etc.)".
- A true/false table: one step of 1 point for each statement, with the right answer; the first step adds "notarea a două variante de răspuns pentru un enunț – 0 puncte".
- An open answer (explain, present, justify, associate): one step for each element the answer must have (name the figure of speech, the value, the element; present it; use a sequence of the text), then the two steps that every such item ends with: "Respectarea normelor de exprimare, de punctuație și a ortografiei: 0 – 1 greșeli – 1 punct; 2 sau mai multe greșeli – 0 puncte" (1 point) and the number of words or sentences that the item asks for (1 point).
- A step judged in levels has all its levels in its text: "interpretare adecvată și nuanțată – 3 puncte; schematică – 2 puncte; încercare de interpretare – 1 punct; lipsa interpretării – 0 puncte".
- An item that asks for a free answer gives examples of right answers, taken from the text and checked by you: "(de exemplu: personificarea „Toamna mândră, harnică”)". A student's other right answer still gets the points.
- A grammar item that asks for several things (three nouns and their cases; two sentences of given kinds): one step for each thing asked, or one step of "câte 1 punct" for a group, with examples of right answers.
- A text to correct: one step with all the points and a scale by the number of mistakes left ("0 greșeli – 6 puncte; 1 greșeală – 5 puncte; …; 6 sau mai multe greșeli – 0 puncte"), the corrected text, and the list of the mistakes.
- A "Notă!" of the barem (for example "nu este obligatorie citarea") goes at the end of the step it concerns.
- A composition or an essay is two items of its subject: the `label` "Conținutul compunerii:" with one step for each requirement of the test (12 points in the Evaluare Națională), and the `label` "Redactarea compunerii:" with one step of 1 point for each criterion of the writing (paragraphs, coherence, the proper words, grammar, clarity, spelling, punctuation, legibility, each with its limit of mistakes). The first step of the writing says that it gets points only when the text has the number of words asked and develops the subject. When the test gives the points of the content and of the writing, use them.
