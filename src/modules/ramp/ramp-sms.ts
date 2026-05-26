import type { Request } from "express";
import { normalizePhone } from "./ramp-phone.js";
import { sendSalesmsgMessage } from "./ramp-salesmsg.js";

export type SmsProvider = "mock" | "twilio" | "salesmsg";

export type SmsSendResult = {
  sent: boolean;
  mock: boolean;
  provider?: string;
  sid?: string;
};

/** Parse `RAMP_SMS_MOCK` — default `true` (demo-safe). Set `false` for live send. */
export function isRampSmsMockMode(): boolean {
  const raw = process.env.RAMP_SMS_MOCK?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no" || raw === "off") return false;
  if (raw === "true" || raw === "1" || raw === "yes" || raw === "on") return true;
  return true;
}

export function getRampSmsProvider(): SmsProvider {
  if (isRampSmsMockMode()) return "mock";

  const explicit = process.env.RAMP_SMS_PROVIDER?.trim().toLowerCase();
  if (explicit === "twilio" || explicit === "salesmsg" || explicit === "mock") {
    return explicit;
  }

  if (process.env.SALESMSG_ACCESS_TOKEN?.trim() || process.env.SALESMSG_API_TOKEN?.trim()) {
    return "salesmsg";
  }
  if (process.env.TWILIO_ACCOUNT_SID?.trim()) return "twilio";
  return "salesmsg";
}

async function sendViaTwilio(input: {
  to: string;
  body: string;
  mediaUrl?: string | null;
}): Promise<SmsSendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();

  if (!accountSid || !authToken || !from) {
    throw new Error(
      "RAMP_SMS_PROVIDER=twilio but Twilio is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)",
    );
  }

  const params = new URLSearchParams();
  params.set("To", input.to);
  params.set("From", from);
  params.set("Body", input.body);
  if (input.mediaUrl) params.set("MediaUrl", input.mediaUrl);

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );

  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) {
    throw new Error(json.message || `Twilio send failed (${res.status})`);
  }

  return {
    sent: true,
    mock: false,
    provider: "twilio",
    sid: json.sid,
  };
}

async function sendViaSalesmsg(input: {
  to: string;
  body: string;
  mediaUrl?: string | null;
}): Promise<SmsSendResult> {
  const result = await sendSalesmsgMessage(input);
  return {
    sent: true,
    mock: false,
    provider: "salesmsg",
    sid: result.messageId,
  };
}

export async function sendRampSms(input: {
  to: string;
  body: string;
  mediaUrl?: string | null;
}): Promise<SmsSendResult> {
  const to = normalizePhone(input.to);
  const body = String(input.body || "").trim();
  const mediaUrl = String(input.mediaUrl || "").trim() || null;
  if (!to || !body) {
    throw new Error("recipientPhone and message body are required");
  }

  const provider = getRampSmsProvider();

  if (provider === "mock") {
    console.info("[ramp:sms:mock]", {
      RAMP_SMS_MOCK: process.env.RAMP_SMS_MOCK ?? "(default true)",
      provider: "mock",
      to,
      body,
      ...(mediaUrl ? { mediaUrl } : {}),
    });
    return { sent: true, mock: true, provider: "mock" };
  }

  if (provider === "salesmsg") {
    return sendViaSalesmsg({ to, body, mediaUrl });
  }

  return sendViaTwilio({ to, body, mediaUrl });
}

/** Public SPA origin where `/p/:token` lives (salonx-web-v2), not demo-api. */
export function rampPublicBaseUrl(req?: Request): string {
  const env =
    process.env.RAMP_PUBLIC_BASE_URL?.trim()?.replace(/\/$/, "") ||
    process.env.VITE_APP_PUBLIC_URL?.trim()?.replace(/\/$/, "") ||
    "";
  if (env) return env;
  if (req) {
    const origin = req.get("origin")?.trim()?.replace(/\/$/, "");
    if (origin && !origin.includes("4000")) return origin;
  }
  return "http://localhost:5173";
}

export function rampLandingUrl(req: Request | undefined, token: string): string {
  const base = rampPublicBaseUrl(req).replace(/\/$/, "");
  return `${base}/p/${encodeURIComponent(token)}`;
}

/** SMS body must include the clickable link in text (not only MMS image). */
export function buildRampShareSmsBody(input: {
  caption: string;
  landingUrl: string;
}): string {
  const caption = String(input.caption || "").trim();
  const landingUrl = String(input.landingUrl || "").trim();
  if (!landingUrl) return caption;
  if (!caption) return `Your look is ready — view & share: ${landingUrl}`;
  return `${caption}\n\nView & share: ${landingUrl}`;
}

export { normalizePhone } from "./ramp-phone.js";
