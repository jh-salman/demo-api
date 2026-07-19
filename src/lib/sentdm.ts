/**
 * sent.dm v3 messaging client.
 *
 * Docs: https://docs.sent.dm/reference/api
 *   POST https://api.sent.dm/v3/messages
 *   Header: x-api-key: <uuid>
 *   Body:   { to: ["+1..."], channel: ["sms"], text: "..." }
 *
 * SMS supports free-form `text` (no template needed) — ideal for OTP codes.
 * WhatsApp/RCS require pre-approved templates.
 */

const SENT_DM_BASE = "https://api.sent.dm/v3";
const SEND_TIMEOUT_MS = 10_000;

export function sentDmConfigured(): boolean {
  return Boolean(process.env.SENT_DM_API_KEY?.trim());
}

function channels(): string[] {
  const raw = process.env.SENT_DM_CHANNEL?.trim() || "sms";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function sandboxEnabled(): boolean {
  return String(process.env.SENT_DM_SANDBOX || "").toLowerCase() === "true";
}

/**
 * Send a free-form text message via sent.dm (SMS channel by default).
 * Throws on misconfiguration or a non-2xx response so callers can surface the
 * failure (e.g. Better Auth returns an error to the client).
 */
export async function sendSentDmText(to: string, text: string): Promise<void> {
  const apiKey = process.env.SENT_DM_API_KEY?.trim();
  if (!apiKey) throw new Error("SENT_DM_API_KEY not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(`${SENT_DM_BASE}/messages`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: [to],
        channel: channels(),
        text,
        sandbox: sandboxEnabled(),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`sent.dm send failed (${res.status}): ${body}`);
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("sent.dm request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
