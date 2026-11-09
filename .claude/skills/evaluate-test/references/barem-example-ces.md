# A real example of a CES test and its barem

This is a real adapted test from the teacher, made for the students of a class with special educational needs (CES, "cerințe educaționale speciale"), and the part of its barem that grading needs. It is used with her permission. The test keeps the contents, the order of the items and the points of the class test, but it guides the student: short requests in the second person, blanks to fill in (`\_\_\_\_`), a box of useful formulas, and fewer exercises to write in full (II.2 has two absolute values instead of three).

The teacher's own barem had more parts: what was adapted and why, how to give the test, and the competences assessed. They are for the teacher, not for grading, and they are left out here: never write them. The class letter, the date and the student's name are left out too. One rule was changed: the teacher's barem lets the student explain a hard-to-read answer orally after the test; the robot cannot hear the student, so hard-to-read writing is simply not penalized, and an answer that cannot be read is marked for the teacher to check.

In the barem, the math is shown the way pandoc writes Word equations; you write math as plain inline TeX between single `$`.

## Testul

**TEST DE EVALUARE**

**Modulul, partea întreagă și partea fracționară a unui număr real**

Matematică -- clasa a IX-a

Numele și prenumele:

+-----------------------------------------------------------------------+
| **Cum lucrezi**                                                       |
|                                                                       |
| - Ai **50 de minute**. Dacă ai nevoie, primești încă **15 minute**.   |
|                                                                       |
| - Completează spațiile libere \_\_\_\_\_\_. Pe liniile punctate scrie |
|   calculele.                                                          |
|                                                                       |
| - Poți rezolva și altfel decât pe pași. Orice rezolvare corectă       |
|   primește punctaj.                                                   |
|                                                                       |
| - Dacă te blochezi la un exercițiu, treci la următorul. Revii la      |
|   final.                                                              |
|                                                                       |
| - Poți cere oricând să-ți citesc cerința.                             |
|                                                                       |
| - Contează raționamentul. Greșelile de ortografie nu se depunctează.  |
|                                                                       |
| - La final, verifică dacă ai completat toate spațiile libere.         |
|                                                                       |
| - Primești **10 puncte din oficiu**.                                  |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **Formule utile**                                                     |
|                                                                       |
| - $|a| = \left\{ \begin{array}{r}                                     |
|   a,\ \text{dacă }a \geq 0 \\                                         |
|    - a,\ \text{dacă }a < 0                                            |
|   \end{array} \right.\$                                               |
|                                                                       |
| - $\sqrt{a^{2}} = |a|$                                                |
|                                                                       |
| - $|E| \leq b \Leftrightarrow - b \leq E \leq b$                      |
|                                                                       |
| - $\lbrack a\rbrack = k \Leftrightarrow k \leq a < k + 1$, unde $k$   |
|   este număr întreg                                                   |
|                                                                       |
| - $\left\{ a \right\} = a - \lbrack a\rbrack$ și                      |
|   $0 \leq \left\{ a \right\} < 1$                                     |
|                                                                       |
| $\lbrack a\rbrack$ = partea întreagă a lui $a$; $\left\{ a \right\}$  |
| = partea fracționară a lui $a$                                        |
+-----------------------------------------------------------------------+

Te poți uita oricând la această pagină, cât lucrezi.

**SUBIECTUL I** (40 de puncte)

------------------------------------------------------------------------

**1.** Calculează.

> a\) $\lbrack - 2,4\rbrack + \left\lbrack \sqrt{17} \right\rbrack$
> **5p**
>
> Numărul $- 2,4$ se află între numerele întregi \_\_\_\_\_ și
> \_\_\_\_\_.
>
> Deci $\lbrack - 2,4\rbrack = \text{\_\_\_\_\_}$.
>
> $16 < 17 < 25 \Rightarrow \text{\_\_\_\_} < \sqrt{17} < \text{\_\_\_\_} \Rightarrow \left\lbrack \sqrt{17} \right\rbrack = \text{\_\_\_\_}$.
>
> $\lbrack - 2,4\rbrack + \left\lbrack \sqrt{17} \right\rbrack = \text{\_\_\_\_} + \text{\_\_\_\_} = \text{\_\_\_\_}$.
>
> b\) $\left\{ - 1,25 \right\} + \left\{ \frac{7}{2} \right\}$ **5p**
>
> $\left\{ - 1,25 \right\} = - 1,25 - \lbrack - 1,25\rbrack = - 1,25 - \left( \text{\_\_\_\_\_} \right) = \text{\_\_\_\_\_\_}$.
>
> $\left\{ \frac{7}{2} \right\} = \frac{7}{2} - \left\lbrack \frac{7}{2} \right\rbrack = \frac{7}{2} - \text{\_\_\_\_} = \text{\_\_\_\_\_\_}$.
>
> $\left\{ - 1,25 \right\} + \left\{ \frac{7}{2} \right\} = \text{\_\_\_\_\_\_} + \text{\_\_\_\_\_\_} = \text{\_\_\_\_\_\_}$.

**2.** Arată că numărul
$a = \left| 2\sqrt{2} - 3 \right| + \sqrt{\left( 1 - \sqrt{2} \right)^{2}} - \left| \sqrt{2} - 4 \right|$
este număr întreg. **10p**

> **Pasul 1.** Compară $2\sqrt{2}$ cu $3$:
> $\left( 2\sqrt{2} \right)^{2} = \text{\_\_\_\_}$ și
> $3^{2} = \text{\_\_\_\_}$.
>
> Numărul $2\sqrt{2} - 3$ este (încercuiește): **pozitiv** / **negativ**
>
> Deci $\left| 2\sqrt{2} - 3 \right| = \text{\_\_\_\_\_\_\_\_\_\_}$.
>
> **Pasul 2.**
> $\sqrt{\left( 1 - \sqrt{2} \right)^{2}} = \left| 1 - \sqrt{2} \right| = \text{\_\_\_\_\_\_\_\_\_\_}$,
> pentru că $\sqrt{2} > 1$.
>
> **Pasul 3.** $\sqrt{2} < 4$, deci
> $\left| \sqrt{2} - 4 \right| = \text{\_\_\_\_\_\_\_\_\_\_}$.
>
> **Pasul 4.**
> $a = \text{\_\_\_\_\_\_\_\_} + \text{\_\_\_\_\_\_\_\_} - \left( \text{\_\_\_\_\_\_\_\_} \right) = \text{\_\_\_\_\_}$

**3.** Se consideră un număr real $x \in \lbrack - 1;\ 0)$. Așadar
$- 1 \leq x < 0$.

> a\) Arată că $|x + 1| + |x - 2| = 3$. **5p**
>
> În spațiile mici scrie semnul potrivit: **≥** sau **\<**.
>
> $x \geq - 1 \Rightarrow x + 1\text{\_\_\_}0 \Rightarrow |x + 1| = \text{\_\_\_\_\_\_\_\_}$
>
> $x < 0 \Rightarrow x - 2\text{\_\_\_}0 \Rightarrow |x - 2| = \text{\_\_\_\_\_\_\_\_}$
>
> $|x + 1| + |x - 2| = \text{\_\_\_\_\_\_\_\_} + \text{\_\_\_\_\_\_\_\_} = 3$
>
> b\) Determină $\lbrack x\rbrack$ și arată că
> $\left\{ x \right\} = x + 1$. **5p**
>
> $- 1 \leq x < 0 \Rightarrow \lbrack x\rbrack = \text{\_\_\_\_\_}$
>
> $\left\{ x \right\} = x - \lbrack x\rbrack = x - \left( \text{\_\_\_\_\_} \right) = \text{\_\_\_\_\_\_\_\_}$
>
> c\) Scrie $\left\{ 2x \right\}$ ca expresie de $x$, fără acolade.
> Lucrează pe cele două cazuri de mai jos. **10p**
>
> $- 1 \leq x < 0 \Rightarrow \text{\_\_\_\_} \leq 2x < \text{\_\_\_\_}$
>
> **Cazul 1.** Dacă $x \in \left\lbrack - 1;\  - \frac{1}{2} \right)$,
> atunci
> $2x \in \left\lbrack \text{\_\_\_\_};\ \text{\_\_\_\_} \right)$.
>
> $\lbrack 2x\rbrack = \text{\_\_\_\_}$, deci
> $\left\{ 2x \right\} = 2x - \lbrack 2x\rbrack = \text{\_\_\_\_\_\_\_\_\_\_}$.
>
> **Cazul 2.** Dacă $x \in \left\lbrack - \frac{1}{2};\ 0 \right)$,
> atunci
> $2x \in \left\lbrack \text{\_\_\_\_};\ \text{\_\_\_\_} \right)$.
>
> $\lbrack 2x\rbrack = \text{\_\_\_\_}$, deci
> $\left\{ 2x \right\} = 2x - \lbrack 2x\rbrack = \text{\_\_\_\_\_\_\_\_\_\_}$.

**SUBIECTUL al II-lea** (50 de puncte)

------------------------------------------------------------------------

**1.** Rezolvă în $\mathbb{R}$ inecuația $|2x - 3| \leq 5$. **10p**

> $|2x - 3| \leq 5 \Leftrightarrow \text{\_\_\_\_} \leq 2x - 3 \leq \text{\_\_\_\_}$
>
> Adun 3 în toate părțile:
> $\text{\_\_\_\_} \leq 2x \leq \text{\_\_\_\_}$
>
> Împart la 2: $\text{\_\_\_\_} \leq x \leq \text{\_\_\_\_}$
>
> Mulțimea soluțiilor:
> $S = \left\lbrack \text{\_\_\_\_};\ \text{\_\_\_\_} \right\rbrack$.

**2.** Rezolvă în $\mathbb{R}$ ecuația $|x + 1| + |x - 2| = x + 3$.
**15p**

> **Pasul 1.** $x + 1 = 0$ pentru $x = \text{\_\_\_\_}$; $x - 2 = 0$
> pentru $x = \text{\_\_\_\_}$.
>
> **Pasul 2.** Completează tabelul. Pe fiecare interval scrie modulele
> fără bare. Apoi rezolvă ecuația.

  ---------------- --------------------------------------------- ---------------------------------------------------------- ----------------------------------------------------
   **Intervalul**  $\left( - \infty;\ \text{\_\_\_\_} \right)$   $\left\lbrack \text{\_\_\_\_};\ \text{\_\_\_\_} \right)$   $\left\lbrack \text{\_\_\_\_};\  + \infty \right)$

    $|x + 1|$ =                                                                                                             

    $|x - 2|$ =                                                                                                             

     **Ecuația                                                                                                              
      devine**                                                                                                              
    (rezolv-o):                                                                                                             

  Soluția găsită:  $x$ =                                         $x$ =                                                      $x$ =

      Este în      **DA / NU**                                   **DA / NU**                                                **DA / NU**
     interval?                                                                                                              
   (încercuiește)                                                                                                           
  ---------------- --------------------------------------------- ---------------------------------------------------------- ----------------------------------------------------

> **Pasul 3.** Mulțimea soluțiilor:
> $S = \left\{ \text{\_\_\_\_\_\_\_\_\_\_} \right\}$.

**3.** Rezolvă în $\mathbb{R}$:

> a\) ecuația $\left\lbrack \frac{2x - 1}{3} \right\rbrack = 2$. **5p**
>
> $\text{\_\_\_\_} \leq \frac{2x - 1}{3} < \text{\_\_\_\_}$
>
> Înmulțesc cu 3: $\text{\_\_\_\_} \leq 2x - 1 < \text{\_\_\_\_}$
>
> Adun 1: $\text{\_\_\_\_} \leq 2x < \text{\_\_\_\_}$
>
> Împart la 2: $\text{\_\_\_\_} \leq x < \text{\_\_\_\_}$. Deci
> $S = \text{\_\_\_\_\_\_\_\_\_\_}$.
>
> b\) inecuația $\left\lbrack \frac{x + 1}{2} \right\rbrack \leq 1$.
> **5p**
>
> Notez $a = \frac{x + 1}{2}$. Atunci $\lbrack a\rbrack \leq 1$.
>
> Asta înseamnă că $\lbrack a\rbrack$ poate fi
> $1,\ 0,\  - 1,\  - 2,\ \ldots$ Deci $a < \text{\_\_\_\_}$.
>
> $\frac{x + 1}{2} < \text{\_\_\_\_} \Rightarrow x + 1 < \text{\_\_\_\_} \Rightarrow x < \text{\_\_\_\_}$
>
> Mulțimea soluțiilor: $S = \text{\_\_\_\_\_\_\_\_\_\_}$.

**4.** Rezolvă în $\mathbb{R}$ ecuația $\left\{ 3x \right\} = x - 1$.
**15p**

> **Pasul 1.** Știm că $0 \leq \left\{ 3x \right\} < 1$. Atunci
> $0 \leq x - 1 < 1$, deci
> $x \in \left\lbrack \text{\_\_\_\_};\ \text{\_\_\_\_} \right)$.
>
> **Pasul 2.**
> $\lbrack 3x\rbrack = 3x - \left\{ 3x \right\} = \text{\_\_\_\_\_\_\_\_\_\_\_\_}$.
> Acest număr este întreg.
>
> **Pasul 3.** Pentru $x$ din intervalul de la Pasul 1, numărul de la
> Pasul 2 este în intervalul
> $\left\lbrack \text{\_\_\_\_};\ \text{\_\_\_\_} \right)$. Numerele
> întregi posibile sunt: \_\_\_\_ și \_\_\_\_.
>
> **Pasul 4.** Află $x$ în fiecare caz și verifică în ecuație:

  ----------------------------------------------------------------

  ----------------------------------------------------------------

> Mulțimea soluțiilor:
> $S = \left\{ \text{\_\_\_\_\_\_\_\_\_\_} \right\}$.

## Baremul (doar partea pentru notare)

**Reguli de notare**

------------------------------------------------------------------------

- Se acordă 10 puncte din oficiu. Nota finală = punctajul total : 10.

- Orice rezolvare corectă primește punctajul maxim, chiar dacă nu
  urmează pașii din test.

- Un spațiu completat corect se punctează ca etapa corespunzătoare din
  barem, fără alte justificări scrise.

- Nu se depunctează: greșelile de ortografie, scrisul greu lizibil,
  inversările de cifre sau de semne la
  copiere, atunci când calculele următoare arată că a lucrat cu valoarea
  corectă.

- Nu se acordă fracțiuni de punct. Punctajele parțiale se acordă pe
  etape, în limitele din barem.

**Barem**

------------------------------------------------------------------------

+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **Item**                | **Răspuns așteptat / etape**                                                            | **Punctaj**             |
+:=======================:+=========================================================================================+========================:+
| **SUBIECTUL I (40 de puncte)**                                                                                                              |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **I.1.a** (5p)          | $- 3 \leq - 2,4 < - 2$ (spațiile: $- 3$ și $- 2$), deci $\lbrack - 2,4\rbrack = - 3$    | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $4 < \sqrt{17} < 5 \Rightarrow \left\lbrack \sqrt{17} \right\rbrack = 4$                | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $\lbrack - 2,4\rbrack + \left\lbrack \sqrt{17} \right\rbrack = - 3 + 4 = 1$             | 1p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **I.1.b** (5p)          | $\left\{ - 1,25 \right\} = - 1,25 - ( - 2) = 0,75$                                      | 3p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $\left\{ \frac{7}{2} \right\} = \frac{7}{2} - 3 = \frac{1}{2}$                          | 1p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $\left\{ - 1,25 \right\} + \left\{ \frac{7}{2} \right\} = 0,75 + 0,5 = 1,25$            | 1p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **I.2** (10p)           | $\left( 2\sqrt{2} \right)^{2} = 8 < 9 = 3^{2}$; numărul $2\sqrt{2} - 3$ este negativ,   | 3p                      |
|                         | deci $\left| 2\sqrt{2} - 3 \right| = 3 - 2\sqrt{2}$                                     |                         |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $\sqrt{\left( 1 - \sqrt{2} \right)^{2}} = \left| 1 - \sqrt{2} \right| = \sqrt{2} - 1$   | 3p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $\left| \sqrt{2} - 4 \right| = 4 - \sqrt{2}$                                            | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $a = 3 - 2\sqrt{2} + \sqrt{2} - 1 - \left( 4 - \sqrt{2} \right) = - 2 \in {\mathbb{Z}}$ | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **I.3.a** (5p)          | $x + 1 \geq 0 \Rightarrow |x + 1| = x + 1$                                              | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $x - 2 < 0 \Rightarrow |x - 2| = 2 - x$                                                 | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $|x + 1| + |x - 2| = x + 1 + 2 - x = 3$                                                 | 1p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **I.3.b** (5p)          | $\lbrack x\rbrack = - 1$                                                                | 3p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $\left\{ x \right\} = x - ( - 1) = x + 1$                                               | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **I.3.c** (10p)         | $- 2 \leq 2x < 0$                                                                       | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | Cazul 1: $2x \in \lbrack - 2;\  - 1)$, $\lbrack 2x\rbrack = - 2$,                       | 4p                      |
|                         | $\left\{ 2x \right\} = 2x + 2$                                                          |                         |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | Cazul 2: $2x \in \lbrack - 1;\ 0)$, $\lbrack 2x\rbrack = - 1$,                          | 4p                      |
|                         | $\left\{ 2x \right\} = 2x + 1$                                                          |                         |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **SUBIECTUL al II-lea (50 de puncte)**                                                                                                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **II.1** (10p)          | $- 5 \leq 2x - 3 \leq 5$                                                                | 4p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $- 2 \leq 2x \leq 8$ și $- 1 \leq x \leq 4$                                             | 4p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $S = \lbrack - 1;\ 4\rbrack$                                                            | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **II.2** (15p)          | Pasul 1: $x = - 1$ și $x = 2$; intervalele $( - \infty;\  - 1)$, $\lbrack - 1;\ 2)$,    | 2p                      |
|                         | $\lbrack 2;\  + \infty)$                                                                |                         |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $( - \infty;\  - 1)$: $|x + 1| = - x - 1$, $|x - 2| = 2 - x$;                           | 4p                      |
|                         | $- 2x + 1 = x + 3 \Rightarrow x = - \frac{2}{3}$; NU                                    |                         |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $\lbrack - 1;\ 2)$: $|x + 1| = x + 1$, $|x - 2| = 2 - x$;                               | 4p                      |
|                         | $3 = x + 3 \Rightarrow x = 0$; DA                                                       |                         |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $\lbrack 2;\  + \infty)$: $|x + 1| = x + 1$, $|x - 2| = x - 2$;                         | 4p                      |
|                         | $2x - 1 = x + 3 \Rightarrow x = 4$; DA                                                  |                         |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $S = \left\{ 0;\ 4 \right\}$                                                            | 1p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **II.3.a** (5p)         | $2 \leq \frac{2x - 1}{3} < 3$                                                           | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $6 \leq 2x - 1 < 9$, $7 \leq 2x < 10$, $\frac{7}{2} \leq x < 5$                         | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $S = \left\lbrack \frac{7}{2};\ 5 \right)$                                              | 1p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **II.3.b** (5p)         | $a < 2$, deci $\frac{x + 1}{2} < 2$                                                     | 3p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $x + 1 < 4 \Rightarrow x < 3$, $S = ( - \infty;\ 3)$                                    | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **II.4** (15p)          | $x \in \lbrack 1;\ 2)$                                                                  | 3p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $\lbrack 3x\rbrack = 3x - (x - 1) = 2x + 1 \in {\mathbb{Z}}$                            | 4p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $2x + 1 \in \lbrack 3;\ 5)$, numerele întregi posibile: $3$ și $4$                      | 3p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $x = 1$ și $x = \frac{3}{2}$; verificare: $\left\{ 3 \right\} = 0 = 1 - 1$,             | 4p                      |
|                         | $\left\{ \frac{9}{2} \right\} = \frac{1}{2} = \frac{3}{2} - 1$                          |                         |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $S = \left\{ 1;\ \frac{3}{2} \right\}$                                                  | 1p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+

**Observații.** II.2: în fiecare interval, 2p pentru scrierea corectă a
modulelor și 2p pentru rezolvarea ecuației cu verificarea apartenenței.
II.4: se punctează integral și rezolvarea pe cazuri
($\lbrack 3x\rbrack \in \left\{ 3;\ 4;\ 5 \right\}$, cu eliminarea lui
$x = 2$, care nu aparține intervalului).
