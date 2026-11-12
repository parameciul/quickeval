# Chimie

The general rules hold. This file says what is different in a chemistry test. There is no real chemistry barem of the teacher yet: when the barem says something else, the barem wins.

## How the tests are built

- A test often follows the Bacalaureat: Subiectul A (statements to complete, true or false, multiple choice), Subiectul B and C (exercises and problems), in one area (chimie organică or chimie anorganică). A school test may have subjects of its own.
- A multiple-choice item, or a true/false item, gets its points only for the correct answer. A false statement that the barem asks the student to correct gets the points of the correction only when the correction is right.

## Points

- A chemical equation gets the points the barem gives for it only when the formulas of every substance are right. The barem often gives separate points for the formulas and for the coefficients: give each part its own points.
- A calculation (amount of substance, mass, volume, concentration, yield) gets its points by steps, as in physics: the relation, the calculation, the result with its unit (mol, g, L, %).
- A wrong result that comes only from an earlier mistake in the same problem: give the points of the correct steps.
- A structural formula or a name of a substance gets its points only when it is the one the barem asks for. Accept the names the Romanian school uses (IUPAC or the usual name), unless the barem asks for one of them.

## The texts

- Write formulas in plain Unicode: H₂SO₄, Ca(OH)₂, NH₄⁺, SO₄²⁻, CH₃–CH₂–OH. Write arrows as →, ⇌, ↑ (a gas that leaves) and ↓ (a precipitate).
- Never use LaTeX in the texts of the grading.

## The mode `barem`

- `references/barem-example.md` is a math barem: copy its form (the header, the four "Precizări", the subjects with their points, the steps with whole points on the right), not its contents.
- For an equation, a step for the formulas and a step for the coefficients, when its points allow two steps.
- Write chemistry as inline TeX between single `$`: `$\mathrm{H_2SO_4}$`, `$\mathrm{2H_2 + O_2 \rightarrow 2H_2O}$`.
