import type { CSSProperties } from 'react';

// Each class gets its own colour, so a teacher can tell the classes apart at a
// glance. The hue steps by the golden angle, so classes with close ids are far
// apart, and the lightness cycles through three levels. The colour follows the
// class id and never changes; the class name is always written next to it.
const GOLDEN_ANGLE = 137.508;
const LIGHTNESS_LEVELS = [84, 76, 90];

export function classToneHue(classId: number): number {
  return Math.round((classId * GOLDEN_ANGLE) % 360);
}

export function classToneLightness(classId: number): number {
  return LIGHTNESS_LEVELS[classId % LIGHTNESS_LEVELS.length]!;
}

export function classToneClass(): string {
  return 'class-tone';
}

export function classToneStyle(classId: number): CSSProperties {
  return { '--tone-hue': classToneHue(classId), '--tone-light': `${classToneLightness(classId)}%` } as CSSProperties;
}
