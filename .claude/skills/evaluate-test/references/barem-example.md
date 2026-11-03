# A real example: a test and its barem

This is a real example from the teacher, used with her permission. It shows the style to copy. The sample has two variants (Rând I and Rând II) that follow the same shape; only Rând I is kept here, because the whole sample is too long. In the barem, the math is shown the way pandoc writes Word equations; you write math as plain inline TeX between single `$`.

## Testul

**TEST DE EVALUARE**

**Permutări**

Matematică -- clasa a XI-a R1 (programa M1, 4 ore/săptămână)

**Rândul I**

Nume și prenume:
\...\...\...\...\...\...\...\...\...\...\...\...\...\...\...\...\...\...\...\.....
Data: \...\...\...\...\...\...\...\...\....

• Toate subiectele sunt obligatorii. • Se acordă **10 puncte din
oficiu**. • Timp de lucru efectiv: **50 de minute**. • Nota se obține
împărțind la 10 punctajul total obținut.

**Notații:** $S_{n}$ -- mulțimea permutărilor de grad $n$; $e$ --
permutarea identică; $m(\sigma)$ -- numărul inversiunilor permutării
$\sigma$;
$\varepsilon(\sigma)\text{=}\left( \text{-}1 \right)^{m(\sigma)}$ --
semnul permutării $\sigma$; $\sigma\tau\text{=}\sigma \circ \tau$, unde
$(\sigma \circ \tau)(k)\text{=}\sigma\left( \tau(k) \right)$.

**SUBIECTUL I (30 de puncte)**

  --------------------------------------------------------------------------
  **6p**   1\. La un concurs pe echipe, cei cinci membri ai unei echipe,
           numerotați de la 1 la 5, ocupă la finalul primei probe locurile
           din tabelul de mai jos.
  -------- -----------------------------------------------------------------

  --------------------------------------------------------------------------

  --------------------------------------------------------
  **Membrul**      **1**   **2**   **3**   **4**   **5**
  ---------------- ------- ------- ------- ------- -------
  **Locul ocupat** 4       5       2       1       3

  --------------------------------------------------------

> Arătați că funcția
> $\sigma:\text{ }\{ 1,2,3,4,5\}\text{ } \rightarrow \text{ }\{ 1,2,3,4,5\}$,
> care asociază fiecărui membru locul ocupat, este o permutare și
> scrieți-o sub forma unui tabel cu două linii.

  --------------------------------------------------------------------------
  **6p**   2\. Se consideră permutările $\sigma\text{=}\begin{pmatrix}
           1 & 2 & 3 & 4 \\
           3 & 2 & 4 & 1
           \end{pmatrix}$ și $\tau\text{=}\begin{pmatrix}
           1 & 2 & 3 & 4 \\
           4 & 1 & 3 & 2
           \end{pmatrix}$ din $S_{4}$. Calculați $\sigma\tau$.
  -------- -----------------------------------------------------------------
  **6p**   3\. Determinați inversa permutării $\sigma\text{=}\begin{pmatrix}
           1 & 2 & 3 & 4 & 5 \\
           4 & 5 & 1 & 2 & 3
           \end{pmatrix}\text{ } \in \text{ }S_{5}$.

  **6p**   4\. Determinați numărul inversiunilor și semnul permutării
           $\sigma\text{=}\begin{pmatrix}
           1 & 2 & 3 & 4 & 5 \\
           2 & 5 & 4 & 1 & 3
           \end{pmatrix}\text{ } \in \text{ }S_{5}$.

  **6p**   5\. Determinați numerele naturale $x$ și $y$ pentru care tabelul
           $\begin{pmatrix}
           1 & 2 & 3 & 4 & 5 \\
           x\text{-}y & 3 & x\text{+}y & 2 & 4
           \end{pmatrix}$ este o permutare din $S_{5}$.
  --------------------------------------------------------------------------

**SUBIECTUL al II-lea (30 de puncte)**

  ----------------------------------------------------------------------------------------------------------
           1\. Se consideră permutările $\sigma\text{=}\begin{pmatrix}
           1 & 2 & 3 & 4 \\
           4 & 2 & 1 & 3
           \end{pmatrix}$ și $\tau\text{=}\begin{pmatrix}
           1 & 2 & 3 & 4 \\
           1 & 3 & 2 & 4
           \end{pmatrix}$ din $S_{4}$.
  -------- -------------------------------------------------------------------------------------------------
  **5p**   a\) Calculați $\sigma\tau$ și $\tau\sigma$. Este compunerea permutărilor comutativă?

  **5p**   b\) Determinați numărul inversiunilor și semnul fiecăreia dintre permutările $\sigma$ și $\tau$.

  **5p**   c\) Verificați egalitatea
           $\varepsilon(\sigma\tau)\text{ = }\varepsilon(\sigma)\text{ } \cdot \text{ }\varepsilon(\tau)$.

           2\. Se consideră permutările $\sigma\text{=}\begin{pmatrix}
           1 & 2 & 3 & 4 \\
           2 & 4 & 1 & 3
           \end{pmatrix}$ și $\tau\text{=}\begin{pmatrix}
           1 & 2 & 3 & 4 \\
           1 & 4 & 2 & 3
           \end{pmatrix}$ din $S_{4}$.

  **5p**   a\) Determinați $\sigma^{\text{-}1}$.

  **5p**   b\) Rezolvați în $S_{4}$ ecuația $\sigma x\text{ = }\tau$.

  **5p**   c\) Rezolvați în $S_{4}$ ecuația $x\sigma\text{ = }\tau$ și comparați soluția obținută cu cea de
           la punctul b).
  ----------------------------------------------------------------------------------------------------------

**SUBIECTUL al III-lea (30 de puncte)**

  --------------------------------------------------------------------------
           1\. Se consideră permutarea $\sigma\text{=}\begin{pmatrix}
           1 & 2 & 3 & 4 & 5 \\
           2 & 1 & 4 & 5 & 3
           \end{pmatrix}\text{ } \in \text{ }S_{5}$.
  -------- -----------------------------------------------------------------
  **5p**   a\) Calculați $\sigma^{2}$ și $\sigma^{3}$.

  **5p**   b\) Determinați cel mai mic număr natural nenul $k$ pentru care
           $\sigma^{k}\text{ = }e$.

  **5p**   c\) Calculați $\sigma^{2026}$.

           2\. Fie $n\text{ } \in \text{ }{\mathbb{N}}^{\text{*}}$ și
           permutarea $\rho\text{ = }\begin{pmatrix}
           1 & 2 & \ldots & n & n\text{+}1 & n\text{+}2 & \ldots & 2n \\
           2n & 2n\text{-}2 & \ldots & 2 & 1 & 3 & \ldots & 2n\text{-}1
           \end{pmatrix}\text{ } \in \text{ }S_{2n}$.

  **8p**   a\) Arătați că $m(\rho)\text{ = }n^{2}$.

  **7p**   b\) Determinați $n\text{ } \in \text{ }{\mathbb{N}}^{\text{*}}$
           pentru care permutarea $\rho$ are 49 de inversiuni și precizați
           semnul permutării $\rho$ în acest caz.
  --------------------------------------------------------------------------

## Baremul

**BAREM DE EVALUARE ȘI DE NOTARE**

**Test de evaluare -- Permutări**

Matematică -- clasa a XI-a R1 (programa M1, 4 ore/săptămână) -- Timp de
lucru: 50 de minute

**Precizări privind evaluarea**

• Se acordă 10 puncte din oficiu. Nota finală se obține împărțind la 10
punctajul total obținut.

• Nu se acordă fracțiuni de punct, dar se pot acorda punctaje
intermediare pentru rezolvări parțiale, în limitele punctajului indicat
în barem.

• Pentru orice altă soluție corectă, chiar dacă este diferită de cea din
barem, se acordă punctajul maxim corespunzător.

• Rezultatul final corect, fără justificările sau calculele cerute, se
punctează cu cel mult jumătate din punctajul itemului.

**RÂNDUL I**

  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **SUBIECTUL I** (30 de puncte)                                                                                                                                                                                           
  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ -----------------------------------
  1\. $\sigma(1)\text{ = }4;\text{ }\sigma(2)\text{ = }5;\text{ }\sigma(3)\text{ = }2;\text{ }\sigma(4)\text{ = }1;\text{ }\sigma(5)\text{ = }3$                                                                           **2p**

  Valorile $\sigma(1),\text{ }\ldots,\text{ }\sigma(5)$ sunt distincte două câte două, deci $\sigma$ este funcție injectivă; fiind definită pe o mulțime finită, este bijectivă, deci este o permutare.                    **2p**

  $$\sigma\text{ = }\begin{pmatrix}                                                                                                                                                                                        **2p**
  1 & 2 & 3 & 4 & 5 \\                                                                                                                                                                                                     
  4 & 5 & 2 & 1 & 3                                                                                                                                                                                                        
  \end{pmatrix}$$                                                                                                                                                                                                          

  2\. $(\sigma\tau)(k)\text{ = }\sigma\left( \tau(k) \right)$                                                                                                                                                              **1p**

  $$(\sigma\tau)(1)\text{ = }\sigma(4)\text{ = }1;\text{  }(\sigma\tau)(2)\text{ = }\sigma(1)\text{ = }3;\text{  }(\sigma\tau)(3)\text{ = }\sigma(3)\text{ = }4;\text{  }(\sigma\tau)(4)\text{ = }\sigma(2)\text{ = }2$$   **4p**

  $$\sigma\tau\text{ = }\begin{pmatrix}                                                                                                                                                                                    **1p**
  1 & 2 & 3 & 4 \\                                                                                                                                                                                                         
  1 & 3 & 4 & 2                                                                                                                                                                                                            
  \end{pmatrix}$$                                                                                                                                                                                                          

  3\. $\sigma^{\text{-}1}\left( \sigma(k) \right)\text{ = }k$, pentru orice $k\text{ } \in \text{ }\{ 1,2,3,4,5\}$.                                                                                                        **2p**

  $$\sigma^{\text{-}1}(4)\text{ = }1;\text{  }\sigma^{\text{-}1}(5)\text{ = }2;\text{  }\sigma^{\text{-}1}(1)\text{ = }3;\text{  }\sigma^{\text{-}1}(2)\text{ = }4;\text{  }\sigma^{\text{-}1}(3)\text{ = }5$$             **2p**

  $$\sigma ⁻¹\text{ = }\begin{pmatrix}                                                                                                                                                                                     **2p**
  1 & 2 & 3 & 4 & 5 \\                                                                                                                                                                                                     
  3 & 4 & 5 & 1 & 2                                                                                                                                                                                                        
  \end{pmatrix}$$                                                                                                                                                                                                          

  4\. Perechile $\left( i,\text{ }j \right)$ cu $i\text{ < }j$ și $\sigma(i)\text{ > }\sigma(j)$ sunt:                                                                                                                     **3p**
  $\left( 1,\text{ }4 \right),\text{ }\left( 2,\text{ }3 \right),\text{ }\left( 2,\text{ }4 \right),\text{ }\left( 2,\text{ }5 \right),\text{ }\left( 3,\text{ }4 \right),\text{ }\left( 3,\text{ }5 \right)$.             

  $$m(\sigma)\text{ = }6$$                                                                                                                                                                                                 **1p**

  $\varepsilon(\sigma)\text{ = }\left( \text{-}1 \right)^{6}\text{ = }1$, deci permutarea este pară.                                                                                                                       **2p**

  5\. Pe linia a doua apar deja numerele 3, 2 și 4, deci $\{ x\text{-}y,\text{ }x\text{+}y\}\text{ = }\{ 1,\text{ }5\}$.                                                                                                   **2p**

  Cum $x,\text{ }y\text{ } \in \text{ }{\mathbb{N}}$, avem $x\text{-}y\text{ } \leq \text{ }x\text{+}y$, iar valorile fiind distincte rezultă $x\text{-}y\text{ = }1,\text{ }x\text{+}y\text{ = }5$.                       **2p**

  $x\text{ = }3,\text{ }y\text{ = }2$; se obține permutarea $\begin{pmatrix}                                                                                                                                               **2p**
  1 & 2 & 3 & 4 & 5 \\                                                                                                                                                                                                     
  1 & 3 & 5 & 2 & 4                                                                                                                                                                                                        
  \end{pmatrix}$.                                                                                                                                                                                                          

  **SUBIECTUL al II-lea** (30 de puncte)                                                                                                                                                                                   

  1\. a) $\sigma\tau\text{ = }\begin{pmatrix}                                                                                                                                                                              **2p**
  1 & 2 & 3 & 4 \\                                                                                                                                                                                                         
  4 & 1 & 2 & 3                                                                                                                                                                                                            
  \end{pmatrix}$                                                                                                                                                                                                           

  $$\tau\sigma\text{ = }\begin{pmatrix}                                                                                                                                                                                    **2p**
  1 & 2 & 3 & 4 \\                                                                                                                                                                                                         
  4 & 3 & 1 & 2                                                                                                                                                                                                            
  \end{pmatrix}$$                                                                                                                                                                                                          

  $\sigma\tau\text{ } \neq \text{ }\tau\sigma$, deci compunerea permutărilor nu este comutativă.                                                                                                                           **1p**

  b\) $m(\sigma)\text{ = }4$, $\varepsilon(\sigma)\text{ = }\left( \text{-}1 \right)^{4}\text{ = }1$.                                                                                                                      **3p**

  $m(\tau)\text{ = }1$, $\varepsilon(\tau)\text{ = }\left( \text{-}1 \right)^{1}\text{ = -}1$.                                                                                                                             **2p**

  c\) $m(\sigma\tau)\text{ = }3$, deci $\varepsilon(\sigma\tau)\text{ = -}1$.                                                                                                                                              **3p**

  $\varepsilon(\sigma)\text{ } \cdot \text{ }\varepsilon(\tau)\text{ = }(1) \cdot (\text{-}1)\text{ = -}1$, deci egalitatea este verificată.                                                                               **2p**

  2\. a) $\sigma^{\text{-}1}\text{ = }\begin{pmatrix}                                                                                                                                                                      **5p**
  1 & 2 & 3 & 4 \\                                                                                                                                                                                                         
  3 & 1 & 4 & 2                                                                                                                                                                                                            
  \end{pmatrix}$                                                                                                                                                                                                           

  b\) $\sigma x\text{ = }\tau$; compunând la stânga cu $\sigma^{\text{-}1}$ obținem $x\text{ = }\sigma^{\text{-}1}\tau$.                                                                                                   **2p**

  $$x\text{ = }\begin{pmatrix}                                                                                                                                                                                             **3p**
  1 & 2 & 3 & 4 \\                                                                                                                                                                                                         
  3 & 2 & 1 & 4                                                                                                                                                                                                            
  \end{pmatrix}$$                                                                                                                                                                                                          

  c\) $x\sigma\text{ = }\tau$; compunând la dreapta cu $\sigma^{\text{-}1}$ obținem $x\text{ = }\tau\sigma^{\text{-}1}$.                                                                                                   **2p**

  $$x\text{ = }\begin{pmatrix}                                                                                                                                                                                             **2p**
  1 & 2 & 3 & 4 \\                                                                                                                                                                                                         
  2 & 1 & 3 & 4                                                                                                                                                                                                            
  \end{pmatrix}$$                                                                                                                                                                                                          

  Soluțiile celor două ecuații sunt diferite, deoarece compunerea permutărilor nu este comutativă.                                                                                                                         **1p**

  **SUBIECTUL al III-lea** (30 de puncte)                                                                                                                                                                                  

  1\. a) $\sigma^{2}\text{ = }\begin{pmatrix}                                                                                                                                                                              **3p**
  1 & 2 & 3 & 4 & 5 \\                                                                                                                                                                                                     
  1 & 2 & 5 & 3 & 4                                                                                                                                                                                                        
  \end{pmatrix}$                                                                                                                                                                                                           

  $$\sigma^{3}\text{ = }\begin{pmatrix}                                                                                                                                                                                    **2p**
  1 & 2 & 3 & 4 & 5 \\                                                                                                                                                                                                     
  2 & 1 & 3 & 4 & 5                                                                                                                                                                                                        
  \end{pmatrix}$$                                                                                                                                                                                                          

  b\) $\sigma^{3}\text{ } \neq \text{ }e$, iar $\sigma^{6}\text{ = }\left( \sigma^{3} \right)^{2}\text{ = }e$.                                                                                                             **2p**

  $\sigma^{k}\text{ } \neq \text{ }e$ pentru $k\text{ } \in \text{ }\{ 1,\text{ }2,\text{ }3,\text{ }4,\text{ }5\}$.                                                                                                       **2p**

  $$k\text{ = }6$$                                                                                                                                                                                                         **1p**

  c\) $2026\text{ = }6\text{ } \cdot \text{ }337\text{ + }4$                                                                                                                                                               **2p**

  $\sigma^{2026}\text{ = }\left( \sigma^{6} \right)^{337}\text{ } \cdot \text{ }\sigma^{4}\text{ = }\sigma^{4}$.                                                                                                           **1p**

  $$\sigma^{4}\text{ = }\left( \sigma^{2} \right)^{2}\text{ = }\begin{pmatrix}                                                                                                                                             **2p**
  1 & 2 & 3 & 4 & 5 \\                                                                                                                                                                                                     
  1 & 2 & 4 & 5 & 3                                                                                                                                                                                                        
  \end{pmatrix}$$                                                                                                                                                                                                          

  2\. a) $\rho(i)\text{ = }2n\text{ + }2\text{ } - \text{ }2i$ pentru $1\text{ } \leq \text{ }i\text{ } \leq \text{ }n$, iar $\rho(i)\text{ = }2i\text{ } - \text{ }2n\text{ } - \text{ }1$ pentru                         **2p**
  $n\text{ + }1\text{ } \leq \text{ }i\text{ } \leq \text{ }2n$.                                                                                                                                                           

  Perechile $\left( i,\text{ }j \right)$ cu $1\text{ } \leq \text{ }i\text{ < }j\text{ } \leq \text{ }n$ sunt toate inversiuni (numerele pare sunt scrise descrescător):                                                   **2p**
  ${C_{n}}^{2}\text{ = }\frac{n\left( n\text{-}1 \right)}{2}$ inversiuni.                                                                                                                                                  

  Perechile $\left( i,\text{ }j \right)$ cu $n\text{ + }1\text{ } \leq \text{ }i\text{ < }j\text{ } \leq \text{ }2n$ nu sunt inversiuni (numerele impare sunt scrise crescător).                                           **1p**

  Pentru $i\text{ } \leq \text{ }n\text{ < }j$: numărul par $2k$ formează inversiuni cu cele $k$ numere impare mai mici decât el, $1,\text{ }3,\text{ }\ldots,\text{ }2k\text{ } - \text{ }1$, scrise după el; se obțin    **2p**
  $1\text{ + }2\text{ + }\ldots\text{ + }n\text{ = }\frac{n\left( n\text{+}1 \right)}{2}$ inversiuni.                                                                                                                      

  $m(\rho)\text{ = }\frac{n\left( n\text{-}1 \right)}{2}\text{ + }\frac{n\left( n\text{+}1 \right)}{2}\text{ = }n^{2}$.                                                                                                    **1p**

  b\) $n^{2}\text{ = }49$                                                                                                                                                                                                  **2p**

  $n\text{ = }7$ (singura soluție din ${\mathbb{N}}^{\text{*}}$).                                                                                                                                                          **3p**

  $\varepsilon(\rho)\text{ = }( - 1)^{49}\text{ = -}1$, deci permutarea este impară.                                                                                                                                       **2p**
  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Total: 90 de puncte, la care se adaugă cele 10 puncte din oficiu
(total 100 de puncte)**
