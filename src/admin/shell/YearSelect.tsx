import { formatSchoolYear, schoolYearOf } from '../../../shared/schoolYear.ts';
import { schoolYearOptions, useSchoolYear } from '../SchoolYearContext.tsx';

// The school year switch, in the top bar and in the phone menu.
export function YearSelect({ id, labelClassName }: { id: string; labelClassName?: string }) {
  const { year, setYear } = useSchoolYear();
  return (
    <>
      <label className={labelClassName} htmlFor={id}>
        Anul școlar
      </label>
      <select id={id} value={year} onChange={(event) => setYear(Number(event.target.value))}>
        {schoolYearOptions(schoolYearOf(new Date())).map((option) => (
          <option key={option} value={option}>
            {formatSchoolYear(option)}
          </option>
        ))}
      </select>
    </>
  );
}
