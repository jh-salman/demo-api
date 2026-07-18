/** US NANP phone helpers — store as E.164 +1XXXXXXXXXX */

export function digitsOnlyPhone(input: string): string {
  return String(input || "").replace(/\D/g, "");
}

/** Normalize to +1XXXXXXXXXX or null if invalid US. */
export function normalizeUsPhoneE164(input: string): string | null {
  let d = digitsOnlyPhone(input);
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10) return null;
  // Area code first digit 2–9 (NANP). Exchange relaxed for demo/mock numbers.
  const area = d[0];
  if (area < "2" || area > "9") return null;
  return `+1${d}`;
}

export function isValidUsPhone(input: string): boolean {
  return normalizeUsPhoneE164(input) != null;
}
