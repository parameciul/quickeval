# How to write a barem

These rules come from a real barem of the teacher (see `barem-example.md`). The teacher can change this file. The robot uses the new rules from its next run.

## The header

- First line: the title of the barem (the heading "BAREM DE EVALUARE ȘI DE NOTARE" above it is added for you), "Test de evaluare – <topic>". It is the title of the test.
- Second line: the subject, the class, the programme, and the working time, in one line: "Matematică – clasa a XI-a R1 (programa M1, 4 ore/săptămână) – Timp de lucru: 50 de minute". Take every part from the test's heading.
- Then the "Precizări privind evaluarea". Write four short bullets, as in the example:
  1. The "din oficiu" points, and how the final grade is found (the total points divided by 10).
  2. No fractions of a point; intermediate points are allowed for partial solutions, inside the points of the item.
  3. Any other correct solution, even a different one, gets the full points of the item.
  4. A correct final result without the justifications or the calculations that the test asks for gets at most half of the points of the item.
- When `notes.md` asks for other rules, write those rules instead of the bullet they replace.

## The structure

- One variant is one part (RÂNDUL I, RÂNDUL II). Each variant has its own solutions, with its own numbers. Solve each variant on its own.
- Each subject (SUBIECTUL I, SUBIECTUL al II-lea, SUBIECTUL al III-lea) is one table with its points in the title: "(30 de puncte)". In the answer the `title` of a subject is only "SUBIECTUL I": the points are written from its `points`. All the subjects of a variant plus the "din oficiu" points make the total (3 × 30 + 10 = 100).
- Follow the test's numbering: "1.", "2.", and the letters "a)", "b)", "c)". Do not renumber, do not merge two parts, do not skip one.
- At the end of a variant the example repeats the sum: "Total: 90 de puncte, la care se adaugă cele 10 puncte din oficiu (total 100 de puncte)". The Word file gets no total line: do not put one in any field.

## The steps and the points

- Each step of the solution is one row, with its points on the right. The points of an exercise are the points of the test (for example 6p), shared among its steps; a part with 5p is shared the same way.
- A step is one thing a student can do right or wrong: a definition used, a calculation, a table, the final answer. Two to four steps for an exercise or a part is usual. A step that is worth more than half of the exercise is too big: split it.
- The final answer is a step too, with its own points.
- Every step has at least 1 point. Points are whole numbers: never 0,5 and never a fraction. When an exercise has too few points for the steps you want, use fewer steps.
- The steps of an exercise add up to its points, the exercises of a subject add up to the subject's points, and the subjects plus "din oficiu" add up to the total. Check the sums before you answer.
- The test shows no points: give 90 points to the exercises (30 per subject, shared by the exercises as evenly as the test allows) and 10 "din oficiu".

## What a step says

- Write the solution as the teacher would write it for a student: short, with the reason ("deci permutarea este pară", "deoarece compunerea nu este comutativă"), in Romanian.
- Give the real values, not only "calculează": a student's work is compared with them.
- One step is one line. Do not break the line inside a step.
- Math is inline TeX between single `$`: `$\sigma\tau = \begin{pmatrix} 1 & 2 \\ 2 & 1 \end{pmatrix}$`. Never `$$`, never a Unicode shortcut for a formula; the reports are made from the TeX.

## Alternatives

- The third bullet of the "Precizări" already gives full points for any correct solution. Do not list many methods.
- When the test clearly allows two ways (for example a table or a formula), write the usual one in the steps and add a short clause to the step: "sau o altă justificare corectă".
- Do not invent partial points for wrong methods: the barem rewards correct steps only.

## Check before you answer

- Every exercise and every part of the test has steps. Every variant is complete.
- Every result is solved and checked by you, not copied from the test.
- The sums add up, with whole numbers only.
