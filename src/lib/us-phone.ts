/**
 * Phone helpers — store as E.164.
 *
 * Supported countries:
 *   • US  (NANP):  +1XXXXXXXXXX   — 10 national digits, area code 2–9
 *   • BD (Bangladesh): +8801XXXXXXXXX — national "01[3-9]XXXXXXXX"
 *
 * The two are unambiguous at 10 national digits: US area codes start 2–9,
 * BD mobile numbers start with 1.
 */

export function digitsOnlyPhone(input: string): string {
  return String(input || "").replace(/\D/g, "");
}

/** 10-digit US national number (area code 2–9). */
function isUsNational(d: string): boolean {
  return d.length === 10 && d[0] >= "2" && d[0] <= "9";
}

/** 10-digit BD national mobile "1[3-9]XXXXXXXX" (no leading 0). */
function isBdNational(d: string): boolean {
  return d.length === 10 && d[0] === "1" && d[1] >= "3" && d[1] <= "9";
}

/** Normalize a US number to +1XXXXXXXXXX, or null if invalid. */
export function normalizeUsPhoneE164(input: string): string | null {
  let d = digitsOnlyPhone(input);
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return isUsNational(d) ? `+1${d}` : null;
}

export function isValidUsPhone(input: string): boolean {
  return normalizeUsPhoneE164(input) != null;
}

/**
 * Normalize a US or Bangladeshi number to E.164, or null if invalid.
 * Accepts: +8801…, 01[3-9]…, bare BD national, +1…, 1…, bare US national.
 */
export function normalizePhoneE164(input: string): string | null {
  const d = digitsOnlyPhone(input);
  if (!d) return null;

  // Explicit BD country code (8801XXXXXXXXX).
  if (d.startsWith("880")) {
    const nat = d.slice(3);
    return isBdNational(nat) ? `+880${nat}` : null;
  }

  // BD national with leading 0 (01712345678 → drop the 0).
  if (d.length === 11 && d[0] === "0" && isBdNational(d.slice(1))) {
    return `+880${d.slice(1)}`;
  }

  // US with country code (1XXXXXXXXXX).
  if (d.length === 11 && d[0] === "1") {
    const nat = d.slice(1);
    return isUsNational(nat) ? `+1${nat}` : null;
  }

  // Bare 10-digit national — US vs BD by first digit.
  if (d.length === 10) {
    if (isBdNational(d)) return `+880${d}`;
    if (isUsNational(d)) return `+1${d}`;
    return null;
  }

  return null;
}

export function isValidPhone(input: string): boolean {
  return normalizePhoneE164(input) != null;
}
