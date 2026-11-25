// i18n-ignore-file: the dictionary itself.
// The English of the messages that the API, the emails and the shared code
// write in Romanian. The code keeps its Romanian text; the API translates a
// message on its way out when the page asked for English (the X-MQ-Lang
// header), and the pages translate the shared code's text and the stored
// messages they show. A "{}" stands for a value kept as it is: a number, a
// name, a title (a teacher named "Nota" stays "Nota"). A "{*}" stands for a
// value that is itself a message, a subject or a list, translated too when
// the dictionary has it.
// scripts/i18n/messages.test.ts fails on a Romanian message of server/ or
// shared/ that has no English here.

export type MessageLang = 'ro' | 'en';

export const MESSAGES_EN: Readonly<Record<string, string>> = {
  // Errors of every request.
  'A apărut o eroare. Încearcă din nou.': 'Something went wrong. Try again.',
  'Nu am găsit ce cauți.': 'I could not find what you are looking for.',
  'Cererea este prea mare.': 'The request is too large.',
  'Cererea nu este JSON valid.': 'The request is not valid JSON.',
  'Cererea trebuie trimisă ca JSON.': 'The request must be sent as JSON.',
  'Cererea vine de pe alt site și a fost refuzată.': 'The request comes from another site and was refused.',
  'Datele trimise nu sunt valide.': 'The data sent is not valid.',
  'Anul școlar nu este valid.': 'The school year is not valid.',
  'Reîncarcă pagina.': 'Reload the page.',
  'Prea multe încercări. Încearcă din nou peste câteva minute.': 'Too many attempts. Try again in a few minutes.',
  'Statistica cerută nu este validă.': 'The statistic asked for is not valid.',
  'Versiunea fișierelor nu este validă.': 'The version of the files is not valid.',
  'Semnătura nu este validă.': 'The signature is not valid.',

  // Accounts and sign-in.
  'Intră în cont ca să continui.': 'Sign in to continue.',
  'Doar administratorii au acces aici.': 'Only administrators have access here.',
  'Contul tău nu are acces la MQGrader.': 'Your account has no access to MQGrader.',
  'Contul tău a fost închis. Scrie unui administrator.': 'Your account was closed. Write to an administrator.',
  'Contul tău așteaptă aprobarea unui administrator. Vei primi acces după aprobare.': 'Your account is waiting for an administrator to approve it. You get access after the approval.',
  'Confirmă mai întâi adresa de email, cu linkul primit pe email.': 'First confirm your email address, with the link you got by email.',
  'Conturile noi nu se pot cere încă. Scrie unui administrator.': 'New accounts cannot be asked for yet. Write to an administrator.',
  'Contul nu mai așteaptă aprobarea.': 'The account is no longer waiting for approval.',
  'Niciun cont de refuzat.': 'No account to refuse.',
  'Alege ce schimbi la cont.': 'Choose what to change in the account.',
  'Alege starea contului.': 'Choose the account status.',
  'Alege tipul contului.': 'Choose the account type.',
  'Alege dacă se arată indicațiile.': 'Choose whether the instructions show.',
  'Emailul sau parola nu sunt corecte. După 10 încercări greșite, contul se blochează 15 minute.': 'The email or the password is not right. After 10 wrong attempts, the account is locked for 15 minutes.',
  'Din rețeaua ta s-au încercat prea multe parole greșite. Încearcă din nou peste 15 minute, sau din altă rețea (de exemplu datele mobile).': 'Too many wrong passwords were tried from your network. Try again in 15 minutes, or from another network (for example mobile data).',
  'Prea multe încercări greșite. Încearcă din nou peste 15 minute.': 'Too many wrong attempts. Try again in 15 minutes.',
  'Sunt prea multe cereri de cont. Încearcă din nou mâine.': 'There are too many account requests. Try again tomorrow.',
  'Prea multe cereri de resetare. Încearcă din nou mâine.': 'Too many reset requests. Try again tomorrow.',
  'Linkul nu mai este valabil. Cere altul de pe pagina de intrare.': 'The link no longer works. Ask for another one from the sign-in page.',
  'Linkul nu mai este valabil. Cere contul din nou de pe pagina de intrare.': 'The link no longer works. Ask for the account again from the sign-in page.',
  'Parola nu este cea aleasă când ai cerut contul. Dacă nu ai cerut tu contul cu acest link, cere-l din nou de pe pagina de intrare.': 'This is not the password chosen when the account was asked for. If you did not ask for the account with this link, ask for it again from the sign-in page.',
  'Parola nu se poate reseta prin email încă. Scrie unui administrator.': 'The password cannot be reset by email yet. Write to an administrator.',
  'Parola aceasta e prea des folosită. Alege alta.': 'This password is used too often. Choose another one.',
  'Parola are între {} și {} de caractere.': 'The password has between {} and {} characters.',
  'Parola de acum nu este corectă.': 'The current password is not right.',
  'Parola este greșită.': 'The password is wrong.',
  'Schimbă-ți parola din pagina Contul meu.': 'Change your password from the My account page.',
  'Scrie parola de acum.': 'Type the current password.',
  'Scrie parola.': 'Type the password.',
  'Scrie o adresă de email validă.': 'Type a valid email address.',
  'Scrie numele tău.': 'Type your name.',
  'Alege dacă se arată coloana Model.': 'Choose whether the Model column shows.',
  'Alege între 1 și {} lucrări corectate deodată.': 'Choose between 1 and {} papers graded at once.',

  // The emails.
  'MQGrader: confirmă adresa de email': 'MQGrader: confirm your email address',
  'MQGrader: cont nou de aprobat': 'MQGrader: a new account to approve',
  'MQGrader: contul tău a fost aprobat': 'MQGrader: your account is approved',
  'MQGrader: parola a fost schimbată': 'MQGrader: the password was changed',
  'MQGrader: parola ta a fost schimbată': 'MQGrader: your password was changed',
  'MQGrader: parolă nouă': 'MQGrader: new password',
  'Bună, {}!': 'Hello, {}!',
  'Ai cerut un cont în MQGrader. Confirmă că adresa este a ta:': 'You asked for an MQGrader account. Confirm that the address is yours:',
  'Linkul merge {} de ore. După confirmare, un administrator aprobă contul.': 'The link works for {} hours. After the confirmation, an administrator approves the account.',
  'Dacă nu ai cerut tu contul, ignoră acest email.': 'If you did not ask for the account, ignore this email.',
  'Un profesor a cerut un cont în MQGrader și și-a confirmat emailul:': 'A teacher asked for an MQGrader account and confirmed their email:',
  'Nume: {}': 'Name: {}',
  'Email: {}': 'Email: {}',
  'Aprobă sau refuză contul pe pagina Setări: {}': 'Approve or refuse the account on the Settings page: {}',
  'Ai cerut o parolă nouă pentru contul tău MQGrader. Alege-o aici:': 'You asked for a new password for your MQGrader account. Choose it here:',
  'Linkul merge {} oră și o singură dată.': 'The link works for {} hour and only once.',
  'Dacă nu ai cerut tu, ignoră acest email: parola ta rămâne cea veche.': 'If you did not ask for it, ignore this email: your password stays the old one.',
  'Parola contului tău MQGrader tocmai a fost schimbată cu linkul din email.': 'The password of your MQGrader account was just changed with the link from the email.',
  'Dacă nu ai făcut tu asta, scrie imediat unui administrator.': 'If you did not do this, write to an administrator at once.',
  'Contul tău MQGrader a fost aprobat. Intră cu emailul și parola alese:': 'Your MQGrader account is approved. Sign in with the email and password you chose:',
  'Un administrator MQGrader ({}) ți-a făcut o parolă nouă. Ți-o trimite el.': 'An MQGrader administrator ({}) made you a new password. They will send it to you.',
  'Dacă nu ai cerut asta, scrie-i unui administrator.': 'If you did not ask for this, write to an administrator.',

  // Classes and students.
  'Clasa {}': 'Class {}',
  'Alege clasa.': 'Choose the class.',
  'Numele clasei are 1-8 litere și cifre, de exemplu 6E2.': 'The class name has 1-8 letters and digits, for example 6E2.',
  '{*} există deja în anul școlar {}.': '{*} already exists in the school year {}.',
  'Clasa este arhivată. Scoate-o din arhivă ca să adaugi elevi.': 'The class is archived. Take it out of the archive to add students.',
  'Clasa este arhivată. Scoate-o din arhivă ca să faci un test nou.': 'The class is archived. Take it out of the archive to make a new test.',
  'Numele elevului lipsește.': "The student's name is missing.",
  'Numele unui elev are cel mult {} de caractere.': "A student's name has at most {} characters.",
  'Numele are cel mult {} de caractere.': 'The name has at most {} characters.',
  'Numele are doar litere, spații, puncte, apostrofuri și cratime.': 'The name has only letters, spaces, full stops, apostrophes and hyphens.',
  'Numele „{}” apare de două ori în listă.': 'The name “{}” is listed twice.',
  'Scrie cel puțin un nume.': 'Type at least one name.',
  'Adaugă cel mult {} de nume odată.': 'Add at most {} names at once.',
  'Altcineva a adăugat elevi în același timp. Încearcă din nou.': 'Someone else added students at the same time. Try again.',
  'Elevul {} este deja în clasă.': 'The student {} is already in the class.',
  'Elevii {*} sunt deja în clasă.': 'The students {*} are already in the class.',
  '{} și încă {}': '{} and {} more',
  'Există deja un elev cu numele „{}” în clasa {}.': 'There is already a student named “{}” in the class {}.',
  'Există deja un elev cu numele „{}” în clasă.': 'There is already a student named “{}” in the class.',
  'Elevul are lucrări trimise sau corectate în această clasă. Îl poți marca „A plecat”.': 'The student has sent or graded papers in this class. You can mark them “Left the class”.',
  'Nu ai schimbat nimic.': 'You changed nothing.',
  'Caută cel mult 80 de caractere.': 'Search at most 80 characters.',
  'Scrie cel puțin două litere.': 'Type at least two letters.',

  // Tests, files, grading.
  'Scrie titlul testului.': 'Type the test title.',
  'Titlul are cel mult {} de caractere.': 'The title has at most {} characters.',
  'Alege o materie din listă.': 'Choose a subject from the list.',
  'Nu am putut alege un cod pentru test. Încearcă din nou.': 'I could not choose a code for the test. Try again.',
  'Testul s-a schimbat între timp. Încearcă din nou.': 'The test changed meanwhile. Try again.',
  'Fișierul are peste 25 MB.': 'The file is over 25 MB.',
  'Fișierul este gol.': 'The file is empty.',
  'Fișierul trebuie să fie un PDF.': 'The file must be a PDF.',
  'Fișierul trebuie să fie un document Word.': 'The file must be a Word document.',
  'Încarcă un fișier PDF sau Word (.docx).': 'Upload a PDF or Word (.docx) file.',
  'Trimite poze JPG sau PDF.': 'Send JPG photos or a PDF.',
  'Nu am găsit fișierul.': 'I could not find the file.',
  'Comentariile au cel mult {} de caractere.': 'The comments have at most {} characters.',
  'Comentariul are cel mult {} de caractere.': 'The comment has at most {} characters.',
  'Rezumatul are cel mult {} de caractere.': 'The summary has at most {} characters.',
  'Răspunsul elevului are cel mult {} de caractere.': "The student's answer has at most {} characters.",
  'Fiecare punct are cel mult {} de caractere.': 'Each point has at most {} characters.',
  'Scrie cel mult 5 puncte la „Ce a lucrat bine”.': 'Write at most 5 points in “What they did well”.',
  'Scrie cel mult 5 recomandări.': 'Write at most 5 pieces of advice.',
  'Scrie punctul forte sau șterge rândul gol.': 'Write the strong point or delete the empty line.',
  'Scrie recomandarea sau șterge rândul gol.': 'Write the advice or delete the empty line.',
  'Scrie rezumatul.': 'Write the summary.',
  'Scrie punctajul ca număr, de exemplu 2,5.': 'Write the points as a number, for example 2.5.',
  'Punctajul este între 0 și {}, din 0,05 în 0,05.': 'The points are between 0 and {}, in steps of 0.05.',
  'Ora aleasă nu este validă.': 'The chosen time is not valid.',
  'Alege o oră din următoarele {} de zile.': 'Choose a time in the next {} days.',
  'Alege lucrările din listă.': 'Choose the papers from the list.',
  'Selectează cel puțin o lucrare.': 'Select at least one paper.',
  'Selectează cel puțin o lucrare cu fișiere.': 'Select at least one paper with files.',
  'Selectează cel mult 500 de lucrări.': 'Select at most 500 papers.',
  'Contul demo poate corecta un singur test, cu cel mult {} lucrări în total, cu tot cu recorectări. Cere unui administrator să-ți facă un cont complet.': 'A demo account can grade only one test, with at most {} papers in total, regrades included. Ask an administrator to make you a full account.',
  'Lucrarea se corectează din nou. Reîncarcă pagina.': 'The paper is being graded again. Reload the page.',
  'Încărcarea s-a schimbat. Reîncarcă pagina.': 'The upload has changed. Reload the page.',
  'Baremul s-a schimbat. Reîncarcă pagina.': 'The marking scheme has changed. Reload the page.',
  'Baremul CES s-a schimbat. Reîncarcă pagina.': 'The SEN marking scheme has changed. Reload the page.',
  'Baremul nu mai este cerut.': 'The marking scheme is no longer asked for.',
  'Baremul se generează încă.': 'The marking scheme is still being made.',
  'Baremul se generează acum. Poți schimba materia după ce este gata.': 'The marking scheme is being made now. You can change the subject after it is ready.',
  'Baremul se generează deja.': 'The marking scheme is already being made.',
  'Testul se corectează acum. Poți genera baremul după ce se termină corectarea.': 'The test is being graded now. You can make the marking scheme after grading ends.',
  'Baremul CES se generează deja.': 'The SEN marking scheme is already being made.',
  'Poți genera cel mult {} bareme pe zi, cu tot cu cele care se generează acum. Poți genera din nou mâine sau poți încărca baremul tău.': 'You can make at most {} marking schemes a day, counting the ones being made now. You can make one again tomorrow, or upload your own.',
  'Încarcă testul înainte să generezi baremul.': 'Upload the test before you make the marking scheme.',
  'Încarcă testul CES înainte să generezi baremul CES.': 'Upload the SEN test before you make the SEN marking scheme.',
  'Încarcă testul înainte de evaluare.': 'Upload the test before grading.',
  'Încarcă baremul înainte de evaluare.': 'Upload the marking scheme before grading.',
  'Verifică baremul generat înainte de evaluare.': 'Check the generated marking scheme before grading.',
  'Testul cu cod QR nu mai este cerut.': 'The test with the QR code is no longer asked for.',
  'Testul cu cod QR nu poate fi încercat din nou.': 'The test with the QR code cannot be tried again.',
  'Testul CES cu cod QR nu poate fi încercat din nou.': 'The SEN test with the QR code cannot be tried again.',
  'Evaluarea a pornit deja.': 'Grading has already started.',
  'Evaluarea nu este programată.': 'Grading is not scheduled.',
  'Evaluarea programată corectează toate lucrările.': 'The scheduled grading grades all the papers.',
  'Niciun elev nu a încărcat încă fișiere.': 'No student has uploaded files yet.',
  'Mai sunt lucrări trimise care nu au fost corectate.': 'There are still sent papers that were not graded.',
  'Testul a început deja.': 'The test has already started.',
  'Testul este deja terminat.': 'The test is already finished.',
  'Testul nu se corectează acum.': 'The test is not being graded now.',
  'Testul nu are lucrări corectate.': 'The test has no graded papers.',
  'Testul nu are nicio lucrare corectată.': 'The test has no graded paper.',
  'Testul a fost deja evaluat, așa că nu mai poate fi oprit.': 'The test was already graded, so it can no longer be stopped.',
  'Un elev a încărcat deja lucrarea, așa că testul nu mai poate fi oprit.': 'A student has already uploaded a paper, so the test can no longer be stopped.',
  'Încărcarea s-a închis. Testul nu mai poate fi oprit.': 'Uploads are closed. The test can no longer be stopped.',
  'Încărcarea este deja deschisă.': 'Uploads are already open.',
  'Corectarea a pornit, așa că încărcarea e deja închisă. O poți redeschide.': 'Grading has started, so uploads are already closed. You can reopen them.',
  'Corectarea acestei lucrări nu a eșuat.': "This paper's grading did not fail.",
  'Poți arhiva un test după ce s-a terminat corectarea.': 'You can archive a test after grading ends.',
  'Testul se corectează acum. Poți schimba comentariile după ce se termină corectarea.': 'The test is being graded now. You can change the comments after grading ends.',
  'Testul se corectează acum. Poți schimba fișierul după ce se termină corectarea.': 'The test is being graded now. You can change the file after grading ends.',
  'Testul se corectează acum. Poți schimba materia după ce se termină corectarea.': 'The test is being graded now. You can change the subject after grading ends.',
  'Lista de exerciții nu a eșuat.': 'The exercise list did not fail.',
  'Lista de exerciții CES nu a eșuat.': 'The SEN exercise list did not fail.',
  'Lista de exerciții nu are nicio problemă.': 'The exercise list has no problem.',
  'Lista de exerciții CES nu are nicio problemă.': 'The SEN exercise list has no problem.',
  'Lista de exerciții nu mai este cerută.': 'The exercise list is no longer asked for.',
  'Analiza clasei nu mai este cerută.': 'The class analysis is no longer asked for.',
  'Analiza se face după ce testul a fost corectat.': 'The analysis is made after the test is graded.',
  'Testul nu are o variantă CES.': 'The test has no SEN version.',
  'Robotul corectează acum o lucrare CES. Poți schimba varianta CES după ce termină.': 'The robot is grading a SEN paper now. You can change the SEN version after it finishes.',
  'Varianta CES are lucrări trimise la corectare, așa că nu mai poate fi oprită. Poți înlocui fișierele ei.': 'The SEN version has papers sent for grading, so it can no longer be turned off. You can replace its files.',
  'Varianta CES are lucrări trimise la corectare, așa că nu mai poate fi ștearsă. Poți înlocui fișierele ei.': 'The SEN version has papers sent for grading, so it can no longer be deleted. You can replace its files.',
  'Nicio lucrare a acestui test nu așteaptă robotul.': 'No paper of this test waits for the robot.',
  'de verificat {}': '{} to check',
  'Elev': 'Student',
  'Total': 'Total',
  'Nota': 'Grade',
  'Observații': 'Notes',
  'Nu a trimis': 'Not sent',

  // Subjects.
  'Matematică': 'Mathematics',
  'Fizică': 'Physics',
  'Chimie': 'Chemistry',
  'Biologie': 'Biology',
  'Științe': 'Science',
  'Limba română': 'Romanian',
  'Limba engleză': 'English',
  'matematică, fizică, chimie, biologie, științe, limba română și limba engleză': 'mathematics, physics, chemistry, biology, science, Romanian and English',
  'Testul pare să fie de {*}.': 'The test seems to be {*}.',
  'Testul nu pare să fie de o materie pe care o corectăm.': 'The test does not seem to be of a subject we grade.',
  '{*} MQGrader corectează acum: {*}.': '{*} MQGrader grades now: {*}.',

  // The problems of an exercise list (shared/schemas.ts checkExerciseList).
  'Punctajele din barem dau {}, dar totalul este {}.': 'The points in the marking scheme add up to {}, but the total is {}.',
  'Rândurile testului nu au aceleași exerciții și punctaje: {*}. Lucrările unui rând pot primi punctaje greșite.':
    'The versions of the test do not have the same exercises and points: {*}. The papers of one version can get wrong points.',
  '{} nu are exercițiul {}': '{} has no exercise {}',
  '{} are în plus exercițiul {}': '{} has an extra exercise {}',
  '{} are de două ori exercițiul {}': '{} has exercise {} twice',
  'la {}, {} are {}p, iar {} are {}p': 'at {}, {} has {}p and {} has {}p',

  // The robot.
  'Cheia robotului lipsește sau este greșită.': "The robot's key is missing or wrong.",
  'Id-ul rulării nu este valid.': 'The run id is not valid.',
  'Altă rulare a robotului lucrează acum.': 'Another run of the robot is working now.',
  'Lucrarea nu mai este corectată de această rulare.': 'The paper is no longer graded by this run.',
  'Rezultatul robotului nu poate fi folosit.': "The robot's result cannot be used.",
  'Robotul a dat un răspuns care nu poate fi folosit.': 'The robot gave an answer that cannot be used.',
  'Robotul nu a terminat la timp.': 'The robot did not finish in time.',
  'Robotul s-a oprit cu o eroare.': 'The robot stopped with an error.',

  // Students' uploads.
  'Link greșit. Cere profesorului linkul nou.': 'Wrong link. Ask your teacher for the new link.',
  'Testul nu a început încă.': 'The test has not started yet.',
  'Testul nu a început încă. Poți încărca lucrarea după ce îl începe profesorul.': 'The test has not started yet. You can upload your paper after your teacher starts it.',
  'Încărcarea s-a închis.': 'Uploads are closed.',
  'Alege-ți numele din listă.': 'Pick your name from the list.',
  'Nu am găsit numele tău în listă.': 'I could not find your name in the list.',
  'Încărcarea a început pe alt telefon. Roagă profesorul să o reseteze.': 'The upload started on another phone. Ask your teacher to reset it.',
  'Încărcarea nu mai este valabilă. Alege-ți din nou numele.': 'The upload is no longer valid. Pick your name again.',
  'Lucrarea ta a fost deja trimisă.': 'Your paper was already sent.',
  'Lucrarea a plecat deja la corectare.': 'The paper has already gone for grading.',
  'Adaugă cel puțin o poză sau un PDF.': 'Add at least one photo or a PDF.',
  'Poți trimite cel mult {} de fișiere.': 'You can send at most {} files.',
  'Scrie codul tău.': 'Type your code.',
  'Codul are 6 caractere.': 'The code has 6 characters.',
  'Codul nu este bun. Verifică fiecare literă și încearcă din nou.': 'The code is not right. Check each letter and try again.',
  'Rezultatul tău nu este gata încă. Apare aici după ce profesorul corectează lucrarea și publică rezultatele. Păstrează biletul.': 'Your result is not ready yet. It shows here after your teacher grades the paper and publishes the results. Keep your ticket.',
  'Testul a fost arhivat și rezultatele nu mai sunt disponibile. Dacă ai nevoie de rezultat, întreabă profesorul.': 'The test is archived and the results are no longer available. If you need your result, ask your teacher.',

  // Quick Try.
  'Încercare': 'Try',
  'Încercare rapidă': 'Quick Try',
  'PROBA': 'TRIAL',
  'Linkul nu este bun. Verifică dacă l-ai copiat întreg.': 'The link is not right. Check that you copied all of it.',
  'Linkul nu este întreg.': 'The link is not complete.',
  'Încercarea a expirat. Poți face o încercare nouă de pe pagina principală.': 'The try has expired. You can make a new try from the home page.',
  'Limita de încercări gratuite pentru azi a fost atinsă. Încearcă din nou mâine sau creează un cont: corectezi gratuit un test pentru toată clasa.': "Today's limit of free tries is reached. Try again tomorrow, or create an account: grade one test for the whole class for free.",
  'Nu am putut verifica încercarea. Reîncarcă pagina și încearcă din nou.': 'I could not check the try. Reload the page and try again.',
  'Nu a venit nicio pagină de {} minute.': 'No page has arrived for {} minutes.',
  'Într-o încercare rapidă poți încărca testul și baremul de cel mult {} ori în total.': 'In a Quick Try you can upload the test and the marking scheme at most {} times in total.',
  'Într-o încercare rapidă, baremul se generează o singură dată și doar dacă nu ai încărcat unul.': 'In a Quick Try, the marking scheme is made only once, and only if you did not upload one.',

  // Payments.
  'Plățile nu sunt încă active.': 'Payments are not active yet.',
  'Funcția aleasă nu există.': 'The chosen feature does not exist.',
  'Alege testul pentru care plătești.': 'Choose the test you are paying for.',
  'Ai plătit deja această funcție.': 'You have already paid for this feature.',
  'Această funcție trebuie plătită înainte.': 'This feature must be paid for first.',
  'Pagina de plată nu a putut fi deschisă. Încearcă din nou.': 'The payment page could not be opened. Try again.',
  'Pagina de plată se deschide deja. Încearcă din nou peste un minut.': 'The payment page is already opening. Try again in a minute.',
  'Pagina de întoarcere lipsește.': 'The return page is missing.',
  'Pagina de întoarcere nu este validă.': 'The return page is not valid.',
  'Plata ta pentru această funcție este contestată la bancă. Funcția rămâne închisă până se încheie contestația.': 'Your payment for this feature is disputed at the bank. The feature stays closed until the dispute ends.',
};

// The page's language, for shared code that runs in the browser too: the
// server has no page and writes Romanian.
export function pageLang(): MessageLang {
  return typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'ro';
}

interface Pattern {
  regex: RegExp;
  english: string;
  // For each value, in order: true when it is translated too ("{*}").
  translated: boolean[];
}

// A value's place in a message: "{}" or "{*}".
export const SLOT = /\{\*?\}/g;

let patterns: Pattern[] | null = null;

function compiled(): Pattern[] {
  if (patterns) return patterns;
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  patterns = Object.entries(MESSAGES_EN)
    .filter(([romanian]) => romanian.match(SLOT) !== null)
    // The pattern with the most fixed text first: it is the most precise.
    .sort(([a], [b]) => b.replace(SLOT, '').length - a.replace(SLOT, '').length)
    .map(([romanian, english]) => ({
      regex: new RegExp(`^${romanian.split(SLOT).map(escape).join('([\\s\\S]*?)')}$`),
      english,
      translated: (romanian.match(SLOT) ?? []).map((slot) => slot === '{*}'),
    }));
  return patterns;
}

// "7,5" is "7.5" in English; any other value stays as it is.
function englishNumber(value: string): string {
  return /^-?\d+,\d+$/.test(value) ? value.replace(',', '.') : value;
}

// A message in the language asked for: the Romanian unchanged, else its
// English, with every "{}" filled by what it stood for, as it was (a number
// with a decimal comma gets a decimal point), and every "{*}" by what it
// stood for, translated when the dictionary has it. A message the
// dictionary does not know stays Romanian.
export function translateMessage(text: string, lang: MessageLang = pageLang()): string {
  if (lang === 'ro' || text === '') return text;
  if (Object.hasOwn(MESSAGES_EN, text)) return MESSAGES_EN[text]!;
  for (const { regex, english, translated } of compiled()) {
    const match = regex.exec(text);
    if (!match) continue;
    const parts = match.slice(1).map((part, i) => (translated[i] ? translateMessage(part, lang) : englishNumber(part)));
    let index = 0;
    return english.replace(SLOT, () => parts[index++] ?? '');
  }
  return text;
}

// The message's lines, each translated: an email.
export function translateLines(text: string, lang: MessageLang): string {
  return text
    .split('\n')
    .map((line) => translateMessage(line, lang))
    .join('\n');
}
