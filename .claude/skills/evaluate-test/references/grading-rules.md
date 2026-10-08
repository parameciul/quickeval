# The teacher's grading rules

The teacher can change this file. The robot uses the new rules from its next run.

## Romanian tests

- A test has subjects ("Subiectul I", "Subiectul II", "Subiectul III"). Each subject has exercises, and an exercise can have parts (a, b, c).
- "Din oficiu" points are given to every student. They are not an exercise.
- The barem gives the points for each item, and often partial points for steps ("3x = 15: 0,5p").

## Points

- Give partial points only as the barem allows. Do not invent other partial points.
- A correct final answer without the work that the barem asks for gets only the points for the answer.
- A correct method that the barem does not show ("Pentru orice altă rezolvare corectă se acordă punctajul maxim") gets the points of the barem's method.
- A wrong result that comes only from an earlier mistake in the same exercise: give the points of the correct steps, as the barem allows.
- Points are multiples of 0.05. Use the barem's steps, for example 0.5 or 0.25.

## When to flag (`needsReview`: true)

Flag the item, and do not guess, when:

- the handwriting cannot be read;
- the page is cut, blurred, or too dark, and part of the answer is missing;
- the student uses a method that the barem does not cover, and you are not sure that it is correct;
- the barem is not clear for this answer;
- you are not sure which exercise an answer belongs to.

A flagged item gets your best points, `confidence` "low" or "medium", and a `reviewReason` that tells the teacher what to look at.

A page that cannot be read at all goes in `unreadable`. Then flag every exercise whose answer can be on that page.

## Comments

- Comments are kind, short, and specific. Write to the student as "tu": "Ai calculat corect perimetrul." "Verifică înmulțirea: 8 · 5 = 40."
- Say what is right first, then what to fix.
- Write math in plain Unicode: x², √, ≤, ½, ·, 3/4. Never use LaTeX ($, \frac, ^{}): the reports cannot show it.
- Never write the student's name, and never write about the student's handwriting as a fault.
