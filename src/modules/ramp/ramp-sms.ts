import type { Request } from "express";

export type SmsSendResult = {
  sent: boolean;
  mock: boolean;
  provider?: string;
  sid?: string;
};

/** Parse `RAMP_SMS_MOCK` — default `true` (demo-safe). Set `false` to use Twilio when creds exist. */
export function isRampSmsMockMode(): boolean {
  const raw = process.env.RAMP_SMS_MOCK?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no" || raw === "off") return false;
  if (raw === "true" || raw === "1" || raw === "yes" || raw === "on") return true;
  return true;
}

function normalizePhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (String(raw || "").trim().startsWith("+")) return String(raw).trim();
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export async function sendRampSms(input: {
  to: string;
  body: string;
  mediaUrl?: string | null;
}): Promise<SmsSendResult> {
  const to = normalizePhone(input.to);
  const body = String(input.body || "").trim();
  const mediaUrl = String(input.mediaUrl || "").trim();
  if (!to || !body) {
    throw new Error("recipientPhone and message body are required");
  }

  if (isRampSmsMockMode()) {
    console.info("[ramp:sms:mock]", {
      RAMP_SMS_MOCK: process.env.RAMP_SMS_MOCK ?? "(default true)",
      to,
      body,
      ...(mediaUrl ? { mediaUrl } : {}),
    });
    return { sent: true, mock: true, provider: "mock" };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();

  if (!accountSid || !authToken || !from) {
    throw new Error(
      "RAMP_SMS_MOCK=false but Twilio is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)",
    );
  }

  const params = new URLSearchParams();
  params.set("To", to);
  params.set("From", from);
  params.set("Body", body);
  if (mediaUrl) params.set("MediaUrl", mediaUrl);

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
