import { getPrismaOrNull } from "./appointments-api.js";
import { normalizePhoneE164 } from "./us-phone.js";
import { sendSentDmText, sentDmConfigured } from "./sentdm.js";

export type ClientMessageDto = {
  id: string;
  salonId: string;
  appointmentId: string | null;
  clientPhone: string;
  body: string;
  channel: string;
  status: string;
  providerId: string | null;
  error: string | null;
  createdAt: string;
};

function toDto(row: {
  id: string;
  salonId: string;
  appointmentId: string | null;
  clientPhone: string;
  body: string;
  channel: string;
  status: string;
  providerId: string | null;
  error: string | null;
  createdAt: Date;
}): ClientMessageDto {
  return {
    id: row.id,
    salonId: row.salonId,
    appointmentId: row.appointmentId,
    clientPhone: row.clientPhone,
    body: row.body,
    channel: row.channel,
    status: row.status,
    providerId: row.providerId,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Staff → client note/SMS (#9). Persists a message-log row and best-effort
 * delivers via sent.dm. Delivery failures do not throw — the row records the
 * error so the owner can retry / follow up.
 */
export async function sendClientMessage(input: {
  salonId: string;
  appointmentId?: string | null;
  clientPhone: string;
  body: string;
}): Promise<ClientMessageDto | null> {
  const prisma = getPrismaOrNull();
  if (!prisma) return null;

  const e164 = normalizePhoneE164(input.clientPhone) || input.clientPhone.trim();
  const body = input.body.trim();

  let status = "queued";
  let providerId: string | null = null;
  let error: string | null = null;

  if (sentDmConfigured()) {
    try {
      const result = await sendSentDmText(e164, body);
      status = "sent";
      providerId = result.messageIds[0] ?? null;
    } catch (e) {
      status = "failed";
      error = e instanceof Error ? e.message : "send failed";
    }
  } else {
    status = "queued";
    error = "sent.dm not configured";
  }

  const row = await prisma.salonxClientMessage.create({
    data: {
      salonId: input.salonId,
      appointmentId: input.appointmentId ?? null,
      clientPhone: e164,
      body,
      channel: "sms",
      status,
      providerId,
      error,
    },
  });
  return toDto(row);
}

export async function listClientMessages(
  salonId: string,
  appointmentId?: string | null,
): Promise<ClientMessageDto[] | null> {
  const prisma = getPrismaOrNull();
  if (!prisma) return null;
  const rows = await prisma.salonxClientMessage.findMany({
    where: {
      salonId,
      ...(appointmentId ? { appointmentId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map(toDto);
}
