# Fizică

The general rules hold. This file says what is different in a physics test. There is no real physics barem of the teacher yet: when the barem says something else, the barem wins.

## How the tests are built

- A test often follows the Bacalaureat: up to four areas (A. Mecanică, B. Elemente de termodinamică, C. Producerea și utilizarea curentului continuu, D. Optică), each with Subiectul I (multiple choice), Subiectul al II-lea and Subiectul al III-lea (problems with parts a, b, c, d). A school test may have one area, or subjects of its own.
- A multiple-choice item ("Răspunsul corect este: …") gets its points only for the correct letter. There are no partial points for it.

## Points in a problem

- The barem usually gives points for the formula, for the calculation, and for the result with its unit. Give each step that the student did right its own points.
- A correct formula written in another but equivalent form gets the points of the formula.
- A result without its unit, or with a wrong unit, does not get the points of the result when the barem gives points for the result. The other steps keep theirs.
- A wrong result that comes only from a wrong value of an earlier part of the same problem: give the points of the correct steps of this part, as the general rules say.
- A drawing (forces, a circuit, the path of a ray) gets its points only when what the barem asks is in it. When you cannot judge the drawing from the photo, flag the item.

## The texts

- Write physics in plain Unicode, as the general rules ask for math: v = Δx/Δt, a = 2 m/s², ρ = 1000 kg/m³, t = 20 °C, R = 10 Ω, λ = 500 nm.
- Write units with a space after the number ("5 m/s"), and SI units, as the school does.

## The mode `barem`

- `references/barem-example.md` is a math barem: copy its form (the header, the four "Precizări", the subjects with their points, the steps with whole points on the right), not its contents.
- A multiple-choice item is one step: the letter of the correct answer, with all the points of the item.
- In a problem, the steps are usually: the formula, the calculation, the result with its unit. Give the real values of each step.
- Write physics as inline TeX between single `$`, as the barem mode asks: `$v = \frac{\Delta x}{\Delta t}$`, `$a = 2\ \mathrm{m/s^2}$`.
