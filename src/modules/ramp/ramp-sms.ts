import type { Request } from "express";
import { normalizePhone } from "./ramp-phone.js";
import { sendSalesmsgMessage } from "./ramp-salesmsg.js";
import { RAMP_DEMO_PROFILE } from "./ramp-demo-profile.js";

export type SmsProvider = "mock" | "twilio" | "salesmsg";

export type SmsSendResult = {
  sent: boolean;
  mock: boolean;
  provider?: string;
  sid?: string;
};

/**
 * Live carrier SMS/MMS (Salesmsg, Twilio). Demo default: OFF.
 * Set `RAMP_CARRIER_SMS_ENABLED=true` only for production carrier send.
 */
export function isCarrierSmsEnabled(): boolean {
  const raw = process.env.RAMP_CARRIER_SMS_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

/** Parse `RAMP_SMS_MOCK` — default `true` (demo-safe). Set `false` for live send. */
export function isRampSmsMockMode(): boolean {
  if (!isCarrierSmsEnabled()) return true;
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
      RAMP_CARRIER_SMS_ENABLED: process.env.RAMP_CARRIER_SMS_ENABLED ?? "(default off)",
      RAMP_SMS_MOCK: process.env.RAMP_SMS_MOCK ?? "(default true)",
      provider: "demo_manual",
      to,
      body,
      ...(mediaUrl ? { mediaUrl } : {}),
    });
    return { sent: false, mock: true, provider: "demo_manual" };
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

/** RAMP share SMS/MMS — caption only; image rides as MMS media (no link in text). */
export function buildRampShareSmsBody(input: {
  caption: string;
  landingUrl?: string;
}): string {
  return String(input.caption || "").trim();
}

/** Client Care Card — thank-you text only; card image is MMS media (no link in text). */
export function buildClientCareSmsBody(input: {
  recipientName: string;
  stylistName: string;
  landingUrl?: string;
}): string {
  const first =
    String(input.recipientName || "Guest")
      .trim()
      .split(/\s+/)[0] || "Guest";
  const stylist = String(input.stylistName || RAMP_DEMO_PROFILE.stylistName).trim();
  return `Thank you, ${first}! Your Client Care Card from ${stylist} is ready.`;
}

export { normalizePhone } from "./ramp-phone.js";
