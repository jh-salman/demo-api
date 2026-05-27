import { normalizePhone } from "./ramp-phone.js";

const SALESMSG_API_BASE =
  process.env.SALESMSG_API_BASE?.trim()?.replace(/\/$/, "") ||
  "https://api.salesmessage.com/pub/v2.2";

type SalesmsgJson = Record<string, unknown>;

function salesmsgToken(): string {
  const token =
    process.env.SALESMSG_ACCESS_TOKEN?.trim() ||
    process.env.SALESMSG_API_TOKEN?.trim() ||
    "";
  if (!token) {
    throw new Error(
      "SALESMSG_ACCESS_TOKEN is required when RAMP_SMS_PROVIDER=salesmsg",
    );
  }
  return token;
}

function salesmsgTeamId(): number {
  const raw =
    process.env.SALESMSG_TEAM_ID?.trim() ||
    process.env.SALESMSG_INBOX_ID?.trim() ||
    "";
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("SALESMSG_TEAM_ID (or SALESMSG_INBOX_ID) is required");
  }
  return id;
}

function salesmsgNumberId(): number {
  const raw = process.env.SALESMSG_NUMBER_ID?.trim() || "";
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("SALESMSG_NUMBER_ID is required");
  }
  return id;
}

async function salesmsgRequest<T extends SalesmsgJson>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${SALESMSG_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${salesmsgToken()}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Accept", "application/json");

  const res = await fetch(url, { ...init, headers });
  const json = (await res.json().catch(() => ({}))) as T & {
    message?: string;
    error?: string;
  };

  if (!res.ok) {
    const detail =
      (typeof json.message === "string" && json.message) ||
      (typeof json.error === "string" && json.error) ||
      `Salesmsg request failed (${res.status})`;
    throw new Error(detail);
  }

  return json;
}

async function findContactByPhone(phone: string): Promise<{ id: number } | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const search = encodeURIComponent(normalized);
  const list = await salesmsgRequest<{ data?: Array<{ id?: number; number?: string }> }>(
    `/contacts?search=${search}&length=5&page=1`,
    { method: "GET" },
  );

  const rows = Array.isArray(list.data) ? list.data : [];
  const exact = rows.find(
    (row) => normalizePhone(String(row.number || "")) === normalized,
  );
  if (exact?.id) return { id: Number(exact.id) };

  if (rows[0]?.id) return { id: Number(rows[0].id) };
  return null;
}

async function createContact(phone: string): Promise<{ id: number }> {
  const normalized = normalizePhone(phone);
  const created = await salesmsgRequest<{ id?: number }>("/contacts", {
    method: "POST",
    body: JSON.stringify({ number: normalized }),
  });
  if (!created.id) throw new Error("Salesmsg contact create returned no id");
  return { id: Number(created.id) };
}

async function openConversation(contactId: number): Promise<{ id: number }> {
  const created = await salesmsgRequest<{ id?: number }>("/conversations", {
    method: "POST",
    body: JSON.stringify({
      contact_id: contactId,
      team_id: salesmsgTeamId(),
      number_id: salesmsgNumberId(),
    }),
  });
  if (!created.id) throw new Error("Salesmsg conversation create returned no id");
  return { id: Number(created.id) };
}

export async function sendSalesmsgMessage(input: {
  to: string;
  body: string;
  mediaUrl?: string | null;
}): Promise<{ messageId?: string; conversationId?: number }> {
  const to = normalizePhone(input.to);
  const body = String(input.body || "").trim();
  const mediaUrl = String(input.mediaUrl || "").trim();
  if (!to || !body) throw new Error("recipientPhone and message body are required");

  let contact = await findContactByPhone(to);
  if (!contact) {
    try {
      contact = await createContact(to);
    } catch {
      contact = await findContactByPhone(to);
      if (!contact) throw new Error("Salesmsg could not find or create contact");
    }
  }

  const conversation = await openConversation(contact.id);

  // Salesmsg MMS uses query params — JSON `{ media: [...] }` is ignored by the API.
  const params = new URLSearchParams();
  params.set("message", body);
  if (mediaUrl) {
    params.append("media_url[][url]", mediaUrl);
  }

  const sent = await salesmsgRequest<{ id?: number; type?: string; media?: unknown[] }>(
    `/messages/${conversation.id}?${params.toString()}`,
    { method: "POST" },
  );

  if (mediaUrl && (!Array.isArray(sent.media) || sent.media.length === 0)) {
    console.warn("[ramp:salesmsg] MMS media missing in API response", {
      conversationId: conversation.id,
      messageId: sent.id,
      type: sent.type,
      mediaUrl,
    });
  }

  return {
    messageId: sent.id != null ? String(sent.id) : undefined,
    conversationId: conversation.id,
  };
}
