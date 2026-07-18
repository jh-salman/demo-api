import nodemailer from "nodemailer";

function webOrigin(): string {
  return (
    process.env.WEB_ORIGIN?.trim().replace(/\/$/, "") ||
    process.env.BETTER_AUTH_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:5173"
  );
}

/**
 * Staff invite email via Nodemailer SMTP (Gmail App Password, etc.).
 *
 * Required env:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, INVITE_FROM_EMAIL
 */
export async function sendInviteEmail(data: {
  email: string;
  invitation: { id: string };
  organization: { name: string };
  inviter: { user: { name: string | null; email: string | null } };
}): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.INVITE_FROM_EMAIL?.trim() || user;

  if (!host || !user || !pass || !from) {
    throw new Error(
      "SMTP_HOST, SMTP_USER, SMTP_PASS, and INVITE_FROM_EMAIL are required for invites",
    );
  }

  const acceptUrl = `${webOrigin()}/invite/${data.invitation.id}`;
  const inviterLabel =
    data.inviter.user.name || data.inviter.user.email || "A teammate";
  const fromAddress = from.includes("<") ? from : `Salon X <${from}>`;

  const transporter = nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : 587,
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: data.email,
      subject: `Join ${data.organization.name} on Salon X`,
      html: `
        <p>${inviterLabel} invited you to <strong>${data.organization.name}</strong> on Salon X.</p>
        <p><a href="${acceptUrl}">Accept invitation</a></p>
        <p>After opening the link, sign in with your US phone number.</p>
      `,
      text: `${inviterLabel} invited you to ${data.organization.name} on Salon X.\n\nAccept: ${acceptUrl}\n`,
    });
    console.log(
      `[invite-email] sent → ${data.email} messageId=${info.messageId || "?"}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to send invitation email";
    console.error("[invite-email] SMTP error:", msg);
    throw new Error(msg);
  }
}
