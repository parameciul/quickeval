const POSITIVE_ID = /^[1-9]\d{0,15}$/;

// Ids in URLs are plain positive integers written in digits only: "12" is an
// id, but "012", "1e3", "0x10", " 5 " and "-1" are not. Returns null for
// anything else, so a typed or broken URL shows "not found".
export function parsePositiveId(raw: string | undefined): number | null {
  if (raw === undefined || !POSITIVE_ID.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}
