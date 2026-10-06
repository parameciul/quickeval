import { z } from 'zod';
import { normalizeClassName } from './classes.ts';
import { isValidSchoolYear } from './schoolYear.ts';
import { cleanStudentName, MAX_NAME_LENGTH, MAX_NAMES_PER_REQUEST } from './students.ts';

// Request bodies of the teacher API. The server parses every body with these
// schemas; the browser uses the inferred types.

export const schoolYearSchema = z
  .number()
  .refine(isValidSchoolYear, { message: 'Anul școlar nu este valid.' });

export const classNameSchema = z.string().transform((raw, ctx) => {
  const name = normalizeClassName(raw);
  if (name === null) {
    ctx.addIssue({ code: 'custom', message: 'Numele clasei are 1-8 litere și cifre, de exemplu 6E2.' });
    return z.NEVER;
  }
  return name;
});

export const studentNameSchema = z
  .string()
  .transform(cleanStudentName)
  .pipe(
    z
      .string()
      .min(1, { message: 'Numele elevului lipsește.' })
      .max(MAX_NAME_LENGTH, { message: `Numele unui elev are cel mult ${MAX_NAME_LENGTH} de caractere.` }),
  );

export const createClassBody = z.object({
  name: classNameSchema,
  schoolYear: schoolYearSchema,
});

export const updateClassBody = z
  .object({
    name: classNameSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine((body) => body.name !== undefined || body.archived !== undefined, {
    message: 'Nu ai schimbat nimic.',
  });

export const addStudentsBody = z.object({
  names: z
    .array(studentNameSchema)
    .min(1, { message: 'Scrie cel puțin un nume.' })
    .max(MAX_NAMES_PER_REQUEST, { message: `Adaugă cel mult ${MAX_NAMES_PER_REQUEST} de nume odată.` }),
});

export const setEnrollmentBody = z.object({ active: z.boolean() });

export const renameStudentBody = z.object({ fullName: studentNameSchema });

export type CreateClassInput = z.input<typeof createClassBody>;
export type UpdateClassInput = z.input<typeof updateClassBody>;

// Response shapes of the teacher API.

export interface Teacher {
  id: number;
  email: string;
  name: string;
}

export interface ClassSummary {
  id: number;
  name: string;
  schoolYear: number;
  archived: boolean;
  studentCount: number;
}

export interface StudentRow {
  id: number;
  fullName: string;
  active: boolean;
}

export interface ClassDetail {
  class: ClassSummary;
  students: StudentRow[];
}
