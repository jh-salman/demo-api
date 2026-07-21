/**
 * sent.dm v3 messaging client — OTP via approved AUTHENTICATION template.
 *
 * Docs: https://docs.sent.dm/reference/api
 *   POST https://api.sent.dm/v3/messages
 *   Header: x-api-key: <uuid>
 *
 * Account note (Salon X):
 *   Template `sent_Verify_Code_2` (AUTHENTICATION, APPROVED) — var_1 = OTP code.
 *   Free-text SMS fails when SMS channel is not configured / BD route unavailable.
 *   Prefer the auth template on both sms + whatsapp.
 */

const SENT_DM_BASE = "https://api.sent.dm/v3";
const SEND_TIMEOUT_MS = 12_000;

/** Default AUTHENTICATION OTP template on this Sent account. */
const DEFAULT_OTP_TEMPLATE_ID = "3baa38bf-d10d-4a6a-9d83-e68896f2e4c8";
const DEFAULT_OTP_TEMPLATE_NAME = "sent_Verify_Code_2";
const DEFAULT_OTP_PARAM = "var_1";

export function sentDmConfigured(): boolean {
  return Boolean(process.env.SENT_DM_API_KEY?.trim());
}

function channelsFor(to: string): string[] {
  const raw = process.env.SENT_DM_CHANNEL?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  // BD: WhatsApp first (SMS often unconfigured / route-denied).
  // US: SMS first, WhatsApp fallback.
  if (to.startsWith("+880")) return ["whatsapp", "sms"];
  return ["sms", "whatsapp"];
}

function sandboxEnabled(): boolean {
  return String(process.env.SENT_DM_SANDBOX || "").toLowerCase() === "true";
}

function otpParamKey(): string {
  return process.env.SENT_DM_OTP_PARAM?.trim() || DEFAULT_OTP_PARAM;
}

type SendResult = {
  messageIds: string[];
  raw: unknown;
};

async function postMessage(body: Record<string, unknown>): Promise<SendResult> {
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
      body: JSON.stringify(body),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        (raw as { error?: { message?: string; code?: string } })?.error
          ?.message ||
        JSON.stringify(raw) ||
        res.statusText;
      const code = (raw as { error?: { code?: string } })?.error?.code;
      throw new Error(
        `sent.dm send failed (${res.status}${code ? ` ${code}` : ""}): ${msg}`,
      );
    }
    const recipients =
      (
        raw as {
          data?: { recipients?: Array<{ message_id?: string }> };
        }
      )?.data?.recipients || [];
    return {
      messageIds: recipients
        .map((r) => r.message_id)
        .filter((id): id is string => Boolean(id)),
      raw,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("sent.dm request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send OTP via the approved AUTHENTICATION template (not free-text).
 * Free-text SMS fails when the account has no SMS sender profile configured.
 */
export async function sendSentDmOtp(to: string, code: string): Promise<void> {
  const paramKey = otpParamKey();
  const id =
    process.env.SENT_DM_OTP_TEMPLATE_ID?.trim() || DEFAULT_OTP_TEMPLATE_ID;
  const name =
    process.env.SENT_DM_OTP_TEMPLATE_NAME?.trim() || DEFAULT_OTP_TEMPLATE_NAME;
  const channel = channelsFor(to);

  const result = await postMessage({
    to: [to],
    channel,
    template: {
      id,
      name,
      parameters: { [paramKey]: code },
    },
    sandbox: sandboxEnabled(),
  });

  console.log(
    `[sent.dm] OTP queued → ${to} channels=${channel.join(",")} ids=${result.messageIds.join(",") || "n/a"}`,
  );
}

/**
 * Free-form text (legacy). Prefer sendSentDmOtp for verification codes.
 * Kept for RAMP / care-card style sends once SMS is configured.
 */
export async function sendSentDmText(
  to: string,
  text: string,
): Promise<SendResult> {
  return postMessage({
    to: [to],
    channel: channelsFor(to),
    text,
    sandbox: sandboxEnabled(),
  });
}
