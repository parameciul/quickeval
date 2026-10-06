// Romanian counts: "1 elev", "2 elevi", "20 de elevi" (20 or more, and round
// hundreds, take "de").
export function studentCountLabel(count: number): string {
  if (count === 0) return 'niciun elev';
  if (count === 1) return '1 elev';
  const lastTwo = count % 100;
  return lastTwo >= 20 || lastTwo === 0 ? `${count} de elevi` : `${count} elevi`;
}
