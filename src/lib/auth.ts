import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization, phoneNumber } from "better-auth/plugins";
import { getPrisma } from "./prisma.js";
import { sendInviteEmail } from "./invite-email.js";
import { sendSentDmText, sentDmConfigured } from "./sentdm.js";
import { isValidPhone, normalizePhoneE164 } from "./us-phone.js";

function webOrigin(): string {
  return (
    process.env.WEB_ORIGIN?.trim().replace(/\/$/, "") ||
    process.env.BETTER_AUTH_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:5173"
  );
}

/**
 * Public origin where the browser calls auth (Vite proxy or production API host).
 * Must match the URL the auth client uses (e.g. http://localhost:5173/salonx-demo-api).
 */
function authBaseUrl(): string {
  return (
    process.env.BETTER_AUTH_URL?.trim().replace(/\/$/, "") ||
    process.env.DEMO_API_PUBLIC_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:4000"
  );
}

function otpMockEnabled(): boolean {
  return String(process.env.AUTH_OTP_MOCK || "true").toLowerCase() === "true";
}

function mockOtpCode(): string {
  return String(process.env.AUTH_MOCK_OTP_CODE || "123456").trim() || "123456";
}

const prisma = getPrisma();
if (!prisma) {
  throw new Error("DATABASE_URL required for Better Auth");
}

const isProd = process.env.NODE_ENV === "production";

/**
 * Cross-site session cookies (browser on demo.salonx.com → API on another host)
 * require `SameSite=None; Secure`. In local dev (same-origin Vite proxy) keep
 * `Lax` so cookies still set over http. Better Auth flags them httpOnly + signed.
 */
const cookieSameSite =
  (process.env.COOKIE_SAMESITE?.trim().toLowerCase() as
    | "lax"
    | "strict"
    | "none"
    | undefined) || (isProd ? "none" : "lax");

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET || "dev-only-change-me",
  baseURL: authBaseUrl(),
  trustedOrigins: [
    webOrigin(),
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://demo.salonx.com",
  ],
  advanced: {
    useSecureCookies: isProd,
    defaultCookieAttributes: {
      httpOnly: true,
      secure: isProd || cookieSameSite === "none",
      sameSite: cookieSameSite,
    },
    ...(process.env.COOKIE_DOMAIN?.trim()
      ? {
          crossSubDomainCookies: {
            enabled: true,
            domain: process.env.COOKIE_DOMAIN.trim(),
          },
        }
      : {}),
  },
  emailAndPassword: { enabled: false },
  user: {
    additionalFields: {},
  },
  plugins: [
    phoneNumber({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 5,
      phoneNumberValidator: (phone) => isValidPhone(phone),
      sendOTP: async ({ phoneNumber: phone, code }) => {
        const e164 = normalizePhoneE164(phone) || phone;
        if (otpMockEnabled()) {
          console.log(
            `[AUTH_OTP_MOCK] ${e164} → enter ${mockOtpCode()} (server also generated ${code})`,
          );
          return;
        }
        if (sentDmConfigured()) {
          const text = `Your Salon X verification code is ${code}. It expires in 5 minutes.`;
          await sendSentDmText(e164, text);
          console.log(`[AUTH_OTP] sent.dm → ${e164}`);
          return;
        }
        // No SMS provider configured — log generated code for manual tests.
        console.warn(`[AUTH_OTP] ${e164} → ${code}`);
      },
      ...(otpMockEnabled()
        ? {
            verifyOTP: async ({ code }: { code: string }) =>
              String(code).trim() === mockOtpCode(),
          }
        : {}),
      signUpOnVerification: {
        getTempEmail: (phone) => {
          const e164 = normalizePhoneE164(phone) || phone;
          const local = e164.replace(/\D/g, "");
          return `u${local}@users.salonx.local`;
        },
        getTempName: (phone) => normalizePhoneE164(phone) || phone,
      },
    }),
    organization({
      allowUserToCreateOrganization: true,
      creatorRole: "owner",
      sendInvitationEmail: async (data) => {
        await sendInviteEmail(data as Parameters<typeof sendInviteEmail>[0]);
      },
    }),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
