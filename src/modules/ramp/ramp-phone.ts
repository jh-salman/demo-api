/** E.164-ish normalization for outbound SMS and inbound phone matching. */
export function normalizePhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (String(raw || "").trim().startsWith("+")) return String(raw).trim();
  return `+${digits}`;
}

/** Last 10 digits — stable match key for US numbers in inbound webhooks. */
export function phoneDigitKey(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

export function phonesMatch(a: string, b: string): boolean {
  const ka = phoneDigitKey(a);
  const kb = phoneDigitKey(b);
  if (!ka || !kb) return false;
  return ka === kb;
}
