// Each class gets one of eight light colours, so a teacher can tell the
// classes apart at a glance. The colour follows the class id and never
// changes; the class name is always written next to it.
export const CLASS_TONE_COUNT = 8;

export function classTone(classId: number): number {
  return classId % CLASS_TONE_COUNT;
}

export function classToneClass(classId: number): string {
  return `class-tone-${classTone(classId)}`;
}
