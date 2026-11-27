import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { displayClassName } from '../../../shared/classes.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { PHONE_MEDIA } from '../../../shared/quickTry.ts';
import { testPhonePath, type PhoneAsk } from '../../../shared/testPhone.ts';
import { MAX_TITLE_LENGTH } from '../../../shared/tests.ts';
import { useApi } from '../ApiContext.tsx';
import { CesSwitch } from '../CesSwitch.tsx';
import { CesTag } from '../CesTag.tsx';
import { Crumbs } from '../Crumbs.tsx';
import { NewClassDialog } from '../classPage/ClassDialogs.tsx';
import { ErrorMessage, errorText } from '../ErrorMessage.tsx';
import { missingParts, type MissingPart } from '../missing.ts';
import { MissingList } from '../MissingList.tsx';
import { FileDrop } from '../newTest/FileDrop.tsx';
import { NewTestState } from '../newTest/NewTestState.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';
import type { PhoneWindowState } from '../testPage/PhoneWindow.tsx';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { useMediaQuery } from '../../ui/useMediaQuery.ts';
import { currentLang } from '../../i18n/lang.ts';
import { t } from '../../i18n/t.ts';

// Where the test comes from: a file now, or photos with the phone once the
// test is made.
type TestChoice = 'upload' | 'phone';
// Where the barem comes from: a file now, the phone, the robot from the test, or later.
type BaremChoice = 'upload' | 'phone' | 'generate' | 'later';

// /tests/new (redesign spec §11.7): one sheet of three numbered steps, drawn
// with the controls of the Quick Try form: the class and the title side by
// side, the test's source as a switch (Fișier, Telefon) and the barem's
// (Fișier, Telefon, Din test, Mai târziu), each over its tile; what happens
// next is on the side. The parts from the phone are photographed once the test
// is made: the test page opens the QR code of its phone link (on a phone, the
// phone page itself opens).
// ?class=<id> picks the class (the class page links here). The test and the
// barem can come now or later; the test page holds them too. A class with a CES
// student shows them and the CES switch, on by default (spec: CES switch); on,
// the CES test and the CES barem sit under the class ones, in the same step.
// Above the button, what the test would still miss.
export function NewTestPage() {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { year } = useSchoolYear();
  const [params] = useSearchParams();
  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });
  const [classId, setClassId] = useState(params.get('class') ?? '');
  const [title, setTitle] = useState('');
  const [testFile, setTestFile] = useState<File | null>(null);
  const [testFrom, setTestFrom] = useState<TestChoice>('upload');
  const [cesTestFrom, setCesTestFrom] = useState<TestChoice>('upload');
  // A phone in the hand takes the photos itself: "Fă poze", and no QR code.
  const onPhone = useMediaQuery(PHONE_MEDIA);
  const [baremFile, setBaremFile] = useState<File | null>(null);
  const [barem, setBarem] = useState<BaremChoice>('upload');
  const [newClass, setNewClass] = useState(false);
  const [cesOn, setCesOn] = useState(true);
  const [cesTestFile, setCesTestFile] = useState<File | null>(null);
  const [cesBaremFile, setCesBaremFile] = useState<File | null>(null);
  const [cesBarem, setCesBarem] = useState<BaremChoice>('upload');
  const chosen = classes.data?.some((item) => !item.archived && String(item.id) === classId) ?? false;
  const detail = useQuery({ queryKey: ['class', Number(classId)], queryFn: () => api.getClass(Number(classId)), enabled: chosen });
  const cesNames = chosen ? (detail.data?.students.filter((student) => student.active && student.ces).map((student) => student.fullName) ?? []) : [];
  const withCes = cesNames.length > 0 && cesOn;

  const create = useMutation({
    mutationFn: async () => {
      const code = await api.createTest({ classId: Number(classId), title, ...(cesNames.length > 0 ? { cesOff: !cesOn } : {}) });
      // The test exists now. What fails next can be done again from the test
      // page, so the teacher goes there with a notice.
      let notice: string | null = null;
      const send = async (file: File, kind: 'test' | 'barem', variant?: 'ces') => {
        try {
          await (variant ? api.uploadTestFile(code, kind, file, variant) : api.uploadTestFile(code, kind, file));
          return true;
        } catch (err) {
          notice ??= t('Testul a fost creat, dar fișierul {name} nu s-a încărcat: {errorText}', { name: file.name, errorText: errorText(err) });
          return false;
        }
      };
      const testSent = testFrom === 'upload' && testFile !== null && (await send(testFile, 'test'));
      if (barem === 'upload' && baremFile) await send(baremFile, 'barem');
      // The robot writes the barem from the test file, so only once it is sent.
      if (barem === 'generate' && testSent) {
        try {
          await api.generateBarem(code);
        } catch (err) {
          notice ??= t('Testul a fost creat, dar baremul nu s-a putut genera: {errorText}', { errorText: errorText(err) });
        }
      }
      if (withCes) {
        const cesTestSent = cesTestFrom === 'upload' && cesTestFile !== null && (await send(cesTestFile, 'test', 'ces'));
        if (cesBarem === 'upload' && cesBaremFile) await send(cesBaremFile, 'barem', 'ces');
        if (cesBarem === 'generate' && cesTestSent) {
          try {
            await api.generateBarem(code, 'ces');
          } catch (err) {
            notice ??= t('Testul a fost creat, dar baremul CES nu s-a putut genera: {errorText}', { errorText: errorText(err) });
          }
        }
      }
      // The parts from the phone: one link for all of them. Without it the
      // test page says so, and its Pregătire makes another.
      let phone: PhoneWindowState | null = null;
      if (phoneAsk.parts.length > 0) {
        try {
          const link = await api.createPhoneLink(code);
          phone = { token: link.token, ask: phoneAsk };
        } catch (err) {
          notice ??= t('Testul a fost creat, dar codul pentru telefon nu s-a putut face: {errorText}', { errorText: errorText(err) });
        }
      }
      return { code, notice, phone };
    },
    onSuccess: async ({ code, notice, phone }) => {
      await queryClient.invalidateQueries({ queryKey: ['tests'] });
      // On a phone, the photos are taken here: the phone page opens in this
      // tab, in place of Test nou (Back must not show the filled form again,
      // ready to make a second test). A notice goes to the test page instead,
      // where Pregătire offers the photos again.
      if (phone && onPhone && !notice) {
        window.location.replace(testPhonePath(phone.token, phone.ask, true, currentLang()));
        return;
      }
      if (phone && onPhone) {
        navigate(`/tests/${code}#prepare`, { replace: true, state: { notice } });
        return;
      }
      if (phone) navigate(`/tests/${code}#prepare`, { state: { notice, phone } });
      else navigate(`/tests/${code}`, { state: notice ? { notice } : null });
    },
  });

  const open = classes.data?.filter((item) => !item.archived) ?? [];
  const selected = open.some((item) => String(item.id) === classId) ? classId : '';

  // Without the test there is nothing to generate the barem from.
  // The choice as it is when the file ends, not when it was picked: photos
  // take a while to become a PDF.
  const pickTest = (file: File | null) => {
    setTestFile(file);
    if (file === null && testFrom === 'upload') setBarem((current) => (current === 'generate' ? 'later' : current));
  };
  const pickCesTest = (file: File | null) => {
    setCesTestFile(file);
    if (file === null && cesTestFrom === 'upload') setCesBarem((current) => (current === 'generate' ? 'later' : current));
  };
  // The test back to a file it does not have: a barem made from it can no
  // longer be.
  const chooseTestFrom = (ces: boolean, value: TestChoice) => {
    (ces ? setCesTestFrom : setTestFrom)(value);
    const noFile = (ces ? cesTestFile : testFile) === null;
    if (value === 'upload' && noFile) (ces ? setCesBarem : setBarem)((current) => (current === 'generate' ? 'later' : current));
  };
  // The CES tiles are drawn while the class has CES students, hidden while
  // the switch is off, so turning it off and on keeps their files on show.
  // A class with none (or one still loading) draws no CES tile, so the CES
  // files are forgotten: a tile drawn again later starts empty, and a file it
  // no longer shows is never sent.
  const hasCes = cesNames.length > 0;
  useEffect(() => {
    if (hasCes) return;
    setCesTestFile(null);
    setCesBaremFile(null);
    setCesTestFrom('upload');
    setCesBarem((current) => (current === 'generate' ? 'later' : current === 'phone' ? 'upload' : current));
  }, [hasCes]);
  // The drop areas whose photos are being made into a PDF: the test is not
  // made before they end, or their file would be left out.
  const [preparing, setPreparing] = useState<ReadonlySet<string>>(new Set());
  const busyOf = (drop: string) => (busy: boolean) =>
    setPreparing((current) => {
      if (current.has(drop) === busy) return current;
      const next = new Set(current);
      if (busy) next.add(drop);
      else next.delete(drop);
      return next;
    });

  // The test of each variant is here or comes from the phone: either way a
  // barem can be made from it.
  const hasTest = testFrom === 'phone' || testFile !== null;
  const hasCesTest = cesTestFrom === 'phone' || cesTestFile !== null;
  // The parts from the phone, and the barems to ask for once their test came.
  const phoneAsk: PhoneAsk = {
    parts: [
      ...(testFrom === 'phone' ? (['test'] as const) : []),
      ...(barem === 'phone' ? (['barem'] as const) : []),
      ...(withCes && cesTestFrom === 'phone' ? (['cesTest'] as const) : []),
      ...(withCes && cesBarem === 'phone' ? (['cesBarem'] as const) : []),
    ],
    fromTest: [
      ...(testFrom === 'phone' && barem === 'generate' ? (['barem'] as const) : []),
      ...(withCes && cesTestFrom === 'phone' && cesBarem === 'generate' ? (['cesBarem'] as const) : []),
    ],
  };

  // What the new test would still miss, as the test page will say it. A part
  // from the phone is not missing: it is chosen, and comes once the test is made.
  const missing = missingParts({
    testFile: hasTest,
    baremFile: (barem === 'upload' && baremFile !== null) || barem === 'phone',
    baremRequest: barem === 'generate' && hasTest ? 'requested' : 'none',
    ces: {
      wanted: withCes,
      testFile: hasCesTest,
      baremFile: (cesBarem === 'upload' && cesBaremFile !== null) || cesBarem === 'phone',
      baremRequest: cesBarem === 'generate' && hasCesTest ? 'requested' : 'none',
    },
  });

  // The barem parts the robot will write once the test is made: not here yet, not missing.
  const generating: MissingPart[] = [
    ...(barem === 'generate' && hasTest ? (['barem'] as const) : []),
    ...(withCes && cesBarem === 'generate' && hasCesTest ? (['cesBarem'] as const) : []),
  ];

  // Where each step stands, for the mark on it: the class and the title come
  // first; the files can wait, so an empty step says so instead of blocking.
  // A step is done once each of its parts has its file or its source: a barem
  // the robot makes from the test counts, one left for later does not.
  const stepDone = [
    selected !== '' && title.trim() !== '',
    !missing.includes('test') && !(withCes && missing.includes('cesTest')),
    !missing.includes('barem') && !(withCes && missing.includes('cesBarem')),
  ];
  // Where each step stands, said once per step: a screen reader reads it after
  // the heading. The files' steps show it beside the heading ("Gata" in green,
  // or the test's "Poți și mai târziu"); the class's step shows only its tick.
  const stepMark = (index: number) => {
    const done = stepDone[index] ?? false;
    const word = done ? t('Gata') : index === 0 ? t('De completat') : t('Poți și mai târziu');
    const shown = index === 1 || (index === 2 && done);
    return <span className={!shown ? 'step-state sr-only' : done ? 'step-state is-done' : 'step-state'}>{word}</span>;
  };
  const stepClass = (index: number) => (stepDone[index] ? 'step is-done' : 'step');
  const stepNumber = (index: number) => (
    <span className="step-num" aria-hidden="true">
      {stepDone[index] ? TICK : index + 1}
    </span>
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  const testTile = { title: t('Alege testul'), hint: t('Cel pe care îl tipărești. PDF, Word sau poze. Îl poți trage aici.') };
  const cesTestTile = { title: t('Alege testul CES'), hint: t('Tipărit cu același cod QR. PDF, Word sau poze.') };

  // On a phone the photos are taken on it: "Fă poze" in place of "Telefon".
  const phoneWord = onPhone ? t('Fă poze') : t('Telefon');
  // The tile of a part from the phone: blue, chosen, photographed once the test is made.
  const phoneTile = (title: string, titleHere: string, line?: string) => (
    <InfoTile
      kind="plan"
      icon={PHONE}
      title={onPhone ? titleHere : title}
      line={line ?? (onPhone ? t('Pagină cu pagină, în ordine.') : t('Un singur cod QR pentru toate pozele.'))}
    />
  );

  // The test's source, as a switch of two: a file, or the phone.
  const testOf = (ces: boolean) => {
    const current = ces ? cesTestFrom : testFrom;
    const labels: [TestChoice, string, ReactNode][] = [
      ['upload', t('Fișier'), UPLOAD],
      ['phone', phoneWord, PHONE],
    ];
    const toggle = (
      <fieldset className="seg">
        <legend className="sr-only">{ces ? t('Testul CES') : withCes ? t('Testul clasei') : t('Testul')}</legend>
        {labels.map(([value, label, icon]) => (
          <label key={value}>
            <input type="radio" name={ces ? 'ces-test-from' : 'test-from'} value={value} checked={current === value} onChange={() => chooseTestFrom(ces, value)} />
            <span>
              {icon}
              {label}
            </span>
          </label>
        ))}
      </fieldset>
    );
    const body = (
      <>
        {/* Kept while the phone is chosen, so the file comes back with "Fișier". */}
        <div hidden={current !== 'upload'}>
          {ces ? (
            <FileDrop id="new-ces-test-file" name={t('Fișierul testului CES')} onPick={pickCesTest} onBusy={busyOf('cesTest')} tile={cesTestTile} />
          ) : (
            <FileDrop id="new-test-file" name={t('Fișierul testului')} onPick={pickTest} onBusy={busyOf('test')} tile={testTile} />
          )}
        </div>
        {current === 'phone' &&
          (ces
            ? phoneTile(t('Faci pozele testului CES cu telefonul, după ce creezi testul'), t('Faci pozele testului CES după ce creezi testul'))
            : phoneTile(t('Faci pozele testului cu telefonul, după ce creezi testul'), t('Faci pozele testului după ce creezi testul')))}
      </>
    );
    return { toggle, body };
  };
  const classTest = testOf(false);
  const cesTestParts = testOf(true);

  // The barem's source, as a switch of four: a file, the phone, the robot
  // from the test (only once the test is chosen, as a file or from the
  // phone), or later.
  const baremOf = (group: 'barem' | 'ces-barem') => {
    const ces = group === 'ces-barem';
    const current = ces ? cesBarem : barem;
    const set = ces ? setCesBarem : setBarem;
    const noTest = !(ces ? hasCesTest : hasTest);
    const noteId = `${group}-from-test`;
    // Said under the pointer too, as the choice's tooltip.
    const noteText = ces ? t('„Din test” se poate după ce alegi testul CES.') : t('„Din test” se poate după ce alegi testul.');
    const labels: [BaremChoice, string, ReactNode][] = [
      ['upload', t('Fișier'), UPLOAD],
      ['phone', phoneWord, PHONE],
      ['generate', t('Din test'), FROM_TEST],
      ['later', t('Mai târziu'), LATER],
    ];
    const toggle = (
      <fieldset className="seg">
        <legend className="sr-only">{ces ? t('Baremul CES') : withCes ? t('Baremul clasei') : t('Baremul')}</legend>
        {labels.map(([value, label, icon]) => (
          <label key={value} title={value === 'generate' && noTest ? noteText : undefined}>
            <input
              type="radio"
              name={group}
              value={value}
              checked={current === value}
              disabled={value === 'generate' && noTest}
              aria-describedby={value === 'generate' && noTest ? noteId : undefined}
              onChange={() => set(value)}
            />
            <span>
              {icon}
              {label}
            </span>
          </label>
        ))}
      </fieldset>
    );
    // Why "Din test" is off, for a screen reader only: nothing stands between
    // the switch and its tile.
    const note = noTest && (
      <p className="sr-only" id={noteId}>
        {noteText}
      </p>
    );
    // The CES barem is out of 90 points with 10 given: said in its tile, for a
    // file she brings now or later (the robot's makes it so by itself).
    const cesPoints = t('Doar pentru corectare: 90 de puncte și 10 din oficiu.');
    const body = (
      <>
        {/* Kept while another choice is made, so the file comes back with it. */}
        <div hidden={current !== 'upload'}>
          <FileDrop
            id={ces ? 'new-ces-barem-file' : 'new-barem-file'}
            name={ces ? t('Fișierul baremului CES') : t('Fișierul baremului')}
            onPick={ces ? setCesBaremFile : setBaremFile}
            onBusy={busyOf(ces ? 'cesBarem' : 'barem')}
            tile={{
              title: ces ? t('Alege baremul CES') : t('Alege baremul'),
              hint: ces ? `${cesPoints} ${t('PDF, Word sau poze.')}` : t('După el se dă punctajul. PDF, Word sau poze.'),
            }}
          />
        </div>
        {current === 'phone' &&
          (ces
            ? phoneTile(t('Faci pozele baremului CES cu telefonul, după ce creezi testul'), t('Faci pozele baremului CES după ce creezi testul'), cesPoints)
            : phoneTile(t('Faci pozele baremului cu telefonul, după ce creezi testul'), t('Faci pozele baremului după ce creezi testul')))}
        {current === 'generate' && (
          <InfoTile
            kind="plan"
            icon={FROM_TEST}
            title={ces ? t('Baremul CES se face din testul CES') : t('Baremul se face din test')}
            line={
              (ces ? cesTestFrom : testFrom) === 'phone'
                ? t('După ce ajung pozele testului. În câteva minute, apoi îl verifici înainte de corectare.')
                : ces
                  ? t('Pornește de la baremul clasei. În câteva minute, apoi îl verifici înainte de corectare.')
                  : t('În câteva minute. Îl verifici și îl ajustezi înainte de corectare.')
            }
          />
        )}
        {current === 'later' && (
          <InfoTile
            kind="later"
            icon={LATER}
            title={t('Îl adaugi din pagina testului, la Pregătire')}
            line={ces ? `${t('Lucrările CES nu se corectează fără el.')} ${cesPoints}` : t('Corectarea nu începe fără barem.')}
          />
        )}
      </>
    );
    return { toggle, note, body };
  };
  const classBarem = baremOf('barem');
  const cesBaremParts = baremOf('ces-barem');

  return (
    <section>
      <Crumbs items={[{ label: t('Teste'), to: '/' }, { label: t('Test nou') }]} />
      <h1>{t('Test nou')}</h1>

      {classes.isPending && <p>{t('Se încarcă…')}</p>}
      {classes.error && <ErrorMessage error={classes.error} />}
      {classes.data && open.length === 0 && (
        <p className="hint">
          {t('Nu ai nicio clasă în anul școlar')}{' '}{formatSchoolYear(year)}. <Link to="/classes">{t('Adaugă întâi o clasă.')}</Link>
        </p>
      )}
      {open.length > 0 && (
        <div className="new-test">
          <form className="new-test-form" onSubmit={onSubmit}>
            <ol className="steps">
              <li className={stepClass(0)}>
                <div className="step-head">
                  <h2>
                    {stepNumber(0)}
                    {t('Clasa și titlul')}
                  </h2>
                  {stepMark(0)}
                </div>
                <div className="step-fields">
                  <div className="form-field">
                    <label htmlFor="test-class">{t('Clasa')}</label>
                    <select id="test-class" value={selected} onChange={(event) => setClassId(event.target.value)} required>
                      <option value="">{t('Alege clasa')}</option>
                      {open.map((item) => (
                        <option key={item.id} value={item.id}>
                          {displayClassName(item.name)}
                        </option>
                      ))}
                    </select>
                    {params.get('class') === null && (
                      <span className="form-hint">
                        {t('Nu e în listă?')}{' '}
                        <button type="button" className="link-button" onClick={() => setNewClass(true)}>
                          {t('Clasă nouă')}
                        </button>
                      </span>
                    )}
                  </div>
                  <div className="form-field">
                    <label htmlFor="test-title">{t('Titlul testului')}</label>
                    <input
                      id="test-title"
                      type="text"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder={t('de exemplu Test de evaluare inițială')}
                      maxLength={MAX_TITLE_LENGTH}
                      aria-describedby="test-title-hint"
                      required
                    />
                    <span className="form-hint" id="test-title-hint">
                      {t('Îl văd și elevii, pe pagina lor.')}
                    </span>
                  </div>
                </div>
              </li>
              {cesNames.length > 0 && (
                <li className="new-test-ces">
                  <CesSwitch names={cesNames} on={cesOn} onToggle={setCesOn} />
                </li>
              )}
              <li className={stepClass(1)}>
                <div className="step-head">
                  <h2>
                    {stepNumber(1)}
                    {t('Testul')}
                  </h2>
                  {stepMark(1)}
                  {!withCes && classTest.toggle}
                </div>
                {/* The class part keeps its place whether the CES part shows or not,
                    so turning CES on or off never redraws its file tile and loses
                    the file shown in it; the CES part stays drawn, hidden, while
                    the switch is off, for the same reason. */}
                <div className="step-part">
                  {withCes && (
                    <div className="step-part-head">
                      <h3>{t('Testul clasei')}</h3>
                      {classTest.toggle}
                    </div>
                  )}
                  {classTest.body}
                </div>
                {hasCes && (
                  <div className="step-part" hidden={!cesOn}>
                    <div className="step-part-head">
                      <h3>
                        {t('Testul CES')}
                        <CesTag />
                      </h3>
                      {cesTestParts.toggle}
                    </div>
                    {cesTestParts.body}
                  </div>
                )}
              </li>
              <li className={stepClass(2)}>
                <div className="step-head">
                  <h2>
                    {stepNumber(2)}
                    {t('Baremul')}
                  </h2>
                  {stepMark(2)}
                  {!withCes && classBarem.toggle}
                </div>
                <div className="step-part">
                  {withCes && (
                    <div className="step-part-head">
                      <h3>{t('Baremul clasei')}</h3>
                      {classBarem.toggle}
                    </div>
                  )}
                  {classBarem.note}
                  {classBarem.body}
                </div>
                {hasCes && (
                  <div className="step-part" hidden={!cesOn}>
                    <div className="step-part-head">
                      <h3>
                        {t('Baremul CES')}
                        <CesTag />
                      </h3>
                      {cesBaremParts.toggle}
                    </div>
                    {cesBaremParts.note}
                    {cesBaremParts.body}
                  </div>
                )}
              </li>
            </ol>
            {selected !== '' && <MissingList missing={missing} lead={t('Încă')} after={t('Poți crea testul acum și le adaugi mai târziu.')} />}
            <div className="new-test-foot">
              <span className="form-hint">{t('Testul rămâne ciornă până apeși „Începe testul”.')}</span>
              <button className="button button-big" type="submit" disabled={create.isPending || selected === '' || preparing.size > 0}>
                <ActionIcon name="add" />
                {create.isPending ? t('Se creează…') : t('Creează testul')}
              </button>
            </div>
            {create.error && <ErrorMessage error={create.error} />}
          </form>

          <aside className="new-test-side">
            <NewTestState
              hasClass={selected !== ''}
              hasTitle={title.trim() !== ''}
              missing={missing}
              generating={generating}
              phone={phoneAsk.parts}
              wantsCes={withCes}
            />
            <section className="class-card new-test-next" aria-labelledby="new-test-next">
              <div className="class-card-head">
                <h2 id="new-test-next">{t('După ce creezi testul')}</h2>
              </div>
              <ul>
                <li>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                    <path d="M8.5 11.5a3 3 0 0 0 4.24 0l2.5-2.5a3 3 0 0 0-4.24-4.24L10 5.76" />
                    <path d="M11.5 8.5a3 3 0 0 0-4.24 0l-2.5 2.5a3 3 0 0 0 4.24 4.24l1-1" />
                  </svg>
                  <div>
                    <b>{t('Linkul elevilor e gata imediat')}</b>
                    <span>{t('Testul primește linkul și codul QR din prima clipă, ca ciornă.')}</span>
                  </div>
                </li>
                <li>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                    <path d="M5.5 7.5V3h9v4.5" />
                    <rect x="2.75" y="7.5" width="14.5" height="6.5" rx="1.5" />
                    <path d="M5.5 12h9v5h-9z" />
                  </svg>
                  <div>
                    <b>{t('Tipărești testul cu cod QR')}</b>
                    <span>{t('Din ciornă, cu zile înainte. Fiecare pagină are codul.')}</span>
                  </div>
                </li>
                <li>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                    <circle cx="7.5" cy="7" r="2.75" />
                    <path d="M2.75 16c.6-2.6 2.5-4 4.75-4s4.15 1.4 4.75 4" />
                    <path d="M13 4.6a2.6 2.6 0 0 1 0 5M14.5 12.2c1.4.5 2.4 1.8 2.75 3.8" />
                  </svg>
                  <div>
                    <b>{t('În ziua testului: Începe testul')}</b>
                    <span>{t('Elevii scanează codul și trimit pozele. Fără cont și fără aplicație.')}</span>
                  </div>
                </li>
              </ul>
            </section>
          </aside>
        </div>
      )}
      {newClass && <NewClassDialog onClose={() => setNewClass(false)} onCreated={(id) => setClassId(String(id))} />}
    </section>
  );
}

// The tile of a barem the teacher does not pick here, drawn like the file
// tiles, with nothing to click: blue once its source is chosen (the robot makes
// it from the test), an empty dashed tile while it is left for later.
function InfoTile({ kind, icon, title, line }: { kind: 'plan' | 'later'; icon: ReactNode; title: string; line: string }) {
  return (
    <div className={`pick-tile is-info is-${kind}`}>
      <span className="pick-tile-icon">{icon}</span>
      <span className="pick-tile-text">
        <b>{title}</b>
        <small>{line}</small>
      </span>
    </div>
  );
}

const TICK = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" focusable="false">
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </svg>
);
const PHONE = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="5.5" y="1.75" width="9" height="16.5" rx="1.5" />
    <path d="M9 15.5h2" />
  </svg>
);
const UPLOAD = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M10 13V4M6.5 7.5L10 4l3.5 3.5" />
    <path d="M3.5 13v3.25h13V13" />
  </svg>
);
const FROM_TEST = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M4 2.75h7l3 3V9" />
    <path d="M4 2.75v14.5h5" />
    <path d="M11 13.5h6M14 10.5l3 3-3 3" />
  </svg>
);
const LATER = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="10" cy="10" r="7.25" />
    <path d="M10 6v4.25l2.75 1.75" />
  </svg>
);
