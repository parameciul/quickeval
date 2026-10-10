import { describe, expect, it } from 'vitest';
import {
  confidenceLabel,
  countLabel,
  formatDateTime,
  formatFileSize,
  pageLabel,
  parsePoints,
  robotStartMessage,
  studentCountLabel,
  testStatusLabel,
  uploadStatusLabel,
} from './format.ts';

describe('studentCountLabel', () => {
  it('uses Romanian number words', () => {
    expect(studentCountLabel(0)).toBe('niciun elev');
    expect(studentCountLabel(1)).toBe('1 elev');
    expect(studentCountLabel(2)).toBe('2 elevi');
    expect(studentCountLabel(19)).toBe('19 elevi');
    expect(studentCountLabel(20)).toBe('20 de elevi');
    expect(studentCountLabel(28)).toBe('28 de elevi');
    expect(studentCountLabel(101)).toBe('101 elevi');
    expect(studentCountLabel(200)).toBe('200 de elevi');
  });
});

describe('countLabel', () => {
  it('counts any noun the Romanian way', () => {
    expect(countLabel(0, 'lucrare', 'lucrări')).toBe('0 lucrări');
    expect(countLabel(1, 'lucrare', 'lucrări')).toBe('1 lucrare');
    expect(countLabel(3, 'lucrare', 'lucrări')).toBe('3 lucrări');
    expect(countLabel(25, 'lucrare', 'lucrări')).toBe('25 de lucrări');
  });
});

describe('status labels', () => {
  it('names test and upload states in Romanian', () => {
    expect(testStatusLabel('draft')).toBe('Ciornă');
    expect(testStatusLabel('open')).toBe('Deschis');
    expect(uploadStatusLabel('none')).toBe('Nu a trimis');
    expect(uploadStatusLabel('uploading')).toBe('Încarcă…');
    expect(uploadStatusLabel('submitted')).toBe('Trimis');
  });
});

describe('formatDateTime', () => {
  it('shows Romania local time, in summer and in winter', () => {
    expect(formatDateTime('2026-10-06T07:15:00.000Z')).toBe('6 oct. 2026, 10:15');
    expect(formatDateTime('2027-01-15T07:05:00.000Z')).toBe('15 ian. 2027, 09:05');
  });
});

describe('formatFileSize', () => {
  it('uses KB below one megabyte and MB with one decimal above', () => {
    expect(formatFileSize(300)).toBe('1 KB');
    expect(formatFileSize(820 * 1024)).toBe('820 KB');
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe('1,3 MB');
    expect(formatFileSize(25 * 1024 * 1024)).toBe('25 MB');
  });
});

describe('robotStartMessage', () => {
  it('says when the robot starts, or that it could not start it', () => {
    expect(robotStartMessage('dispatched')).toBe('Robotul pornește în aproximativ un minut.');
    expect(robotStartMessage('next_check')).toBe('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.');
  });
});

describe('result labels', () => {
  it('names how sure the robot is', () => {
    expect(confidenceLabel('high')).toBe('Mare');
    expect(confidenceLabel('medium')).toBe('Medie');
    expect(confidenceLabel('low')).toBe('Mică');
  });

  it('names the pages that the robot could not read as the page numbers them', () => {
    expect(pageLabel('student/page-02.jpg')).toBe('Pagina 2');
    expect(pageLabel('page-11.pdf')).toBe('Pagina 11');
    expect(pageLabel('ceva.jpg')).toBe('ceva.jpg');
  });
});

describe('parsePoints', () => {
  it('reads points with a comma or a point', () => {
    expect(parsePoints('2,5')).toBe(2.5);
    expect(parsePoints(' 3.25 ')).toBe(3.25);
    expect(parsePoints('0')).toBe(0);
  });

  it('refuses anything that is not a number', () => {
    expect(parsePoints('')).toBeNull();
    expect(parsePoints('-1')).toBeNull();
    expect(parsePoints('2,5,1')).toBeNull();
    expect(parsePoints('doi')).toBeNull();
  });
});
