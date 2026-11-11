# Limba română

The general rules hold, except where this file says otherwise. There is no real Romanian barem of the teacher yet: when the barem says something else, the barem wins.

## How the tests are built

- A test often follows the Evaluare Națională or the Bacalaureat: Subiectul I (questions on a text: the meaning of words, the ideas of the text, grammar), Subiectul al II-lea (a short text: an argument, a characterization, a comment), Subiectul al III-lea (an essay or a composition). A school test may have subjects of its own.
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

- `references/barem-example.md` is a math barem: copy its form (the header, the four "Precizări", the subjects with their points, the steps with whole points on the right), not its contents.
- For a question on the text, one step for each idea or element the answer must have.
- For an essay, one step for each criterion of the content and one for each criterion of the writing, with whole points, as the usual barems of the Evaluare Națională and the Bacalaureat do.
- The "Precizări" keep the din oficiu points and how the grade is found; the rule about the full points for any correct solution becomes: an answer that keeps the meaning gets the points, also in other words.
