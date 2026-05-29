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
    const err = new SalesmsgError(detail, res.status, json);
    throw err;
  }

  return json;
}

/** Error that preserves the parsed Salesmsg response body (e.g. validation `contact_id`). */
class SalesmsgError extends Error {
  status: number;
  body: SalesmsgJson;
  constructor(message: string, status: number, body: SalesmsgJson) {
    super(message);
    this.name = "SalesmsgError";
    this.status = status;
    this.body = body;
  }
}

/** Pull an existing contact id out of a "contact already exists" validation body. */
function existingContactIdFromError(err: unknown): number | null {
  if (!(err instanceof SalesmsgError)) return null;
  const raw = (err.body as { contact_id?: unknown })?.contact_id;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function findContactByPhone(phone: string): Promise<{ id: number } | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const search = encodeURIComponent(normalized);
  let list: { data?: Array<{ id?: number; number?: string }> };
  try {
    list = await salesmsgRequest<{ data?: Array<{ id?: number; number?: string }> }>(
      `/contacts?search=${search}&length=5&page=1`,
      { method: "GET" },
    );
  } catch (err) {
    console.warn("[ramp:salesmsg] contact search failed", {
      phone: normalized,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

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
  try {
    // Salesmsg returns ContactResource directly, but some tenants wrap it in `data`.
    const created = await salesmsgRequest<{ id?: number; data?: { id?: number } }>(
      "/contacts",
      {
        method: "POST",
        body: JSON.stringify({ number: normalized }),
      },
    );
    const id = created.id ?? created.data?.id;
    if (!id) {
      console.warn("[ramp:salesmsg] contact create returned no id", {
        phone: normalized,
        response: created,
      });
      throw new Error("Salesmsg contact create returned no id");
    }
    return { id: Number(id) };
  } catch (err) {
    // "A contact already exists for this number" → body carries the existing id.
    const existingId = existingContactIdFromError(err);
    if (existingId) return { id: existingId };
    throw err;
  }
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
    let createError: unknown = null;
    try {
      contact = await createContact(to);
    } catch (err) {
      createError = err;
      contact = await findContactByPhone(to);
    }
    if (!contact) {
      const detail =
        createError instanceof Error ? createError.message : String(createError || "");
      console.error("[ramp:salesmsg] could not resolve contact", {
        to,
        createError: detail,
      });
      throw new Error(
        `Salesmsg could not find or create contact for ${to}` +
          (detail ? ` — ${detail}` : ""),
      );
    }
  }

  const conversation = await openConversation(contact.id);

  // Salesmsg MMS uses query params — JSON `{ media: [...] }` is ignored by the API.
  const params = new URLSearchParams();
  params.set("message", body);
  if (mediaUrl) {
    params.append("media_url[][url]", mediaUrl);
  }

  const sent = await salesmsgRequest<SalesmsgMessage>(
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

  console.log("[ramp:salesmsg] message accepted", {
    conversationId: conversation.id,
    messageId: sent.id,
    type: sent.type,
    initialStatus: sent.status,
    mmsStatus: sent.mms_status,
    hasMedia: Array.isArray(sent.media) && sent.media.length > 0,
  });

  // Fire-and-forget delivery poll — surfaces trial-block vs real-block in logs
  // without blocking the API response.
  if (sent.id != null) {
    void pollSalesmsgDeliveryStatus(conversation.id, Number(sent.id)).catch(
      (err) => {
        console.warn("[ramp:salesmsg] delivery poll error", {
          conversationId: conversation.id,
          messageId: sent.id,
          error: err instanceof Error ? err.message : String(err),
        });
      },
    );
  }

  return {
    messageId: sent.id != null ? String(sent.id) : undefined,
    conversationId: conversation.id,
  };
}

type SalesmsgMessage = {
  id?: number;
  type?: string;
  status?: string;
  mms_status?: string;
  sent_at?: string | null;
  delivered_at?: string | null;
  failed_at?: string | null;
  failed_reason?: string | null;
  media?: unknown[];
};

const TERMINAL_STATUSES = new Set(["delivered", "failed", "undelivered"]);

/**
 * Poll Salesmsg for the message's delivery status after send and log the
 * outcome to the terminal. Distinguishes a trial/account block (status stuck on
 * `queued`/`sent` or `failed` with a carrier reason) from a real delivery.
 */
async function pollSalesmsgDeliveryStatus(
  conversationId: number,
  messageId: number,
  attempts = 6,
  intervalMs = 5000,
): Promise<void> {
  let lastStatus = "";
  for (let i = 0; i < attempts; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    let rows: SalesmsgMessage[] = [];
    try {
      const raw = (await salesmsgRequest<SalesmsgJson>(
        `/messages/${conversationId}?limit=20`,
        { method: "GET" },
      )) as unknown;
      const data = (raw as { data?: unknown })?.data;
      rows = Array.isArray(raw)
        ? (raw as SalesmsgMessage[])
        : Array.isArray(data)
          ? (data as SalesmsgMessage[])
          : [];
    } catch (err) {
      console.warn("[ramp:salesmsg] status fetch failed", {
        conversationId,
        messageId,
        attempt: i + 1,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const msg = rows.find((row) => Number(row.id) === messageId);
    if (!msg) continue;

    const status = String(msg.status || "").toLowerCase();
    if (status && status !== lastStatus) {
      lastStatus = status;
      console.log("[ramp:salesmsg] delivery status", {
        conversationId,
        messageId,
        attempt: i + 1,
        status: msg.status,
        mmsStatus: msg.mms_status,
        sentAt: msg.sent_at,
        deliveredAt: msg.delivered_at,
        failedAt: msg.failed_at,
        failedReason: msg.failed_reason,
      });
    }

    if (TERMINAL_STATUSES.has(status)) {
      if (status === "delivered") {
        console.log("[ramp:salesmsg] ✅ DELIVERED to carrier", {
          conversationId,
          messageId,
          deliveredAt: msg.delivered_at,
        });
      } else {
        console.warn(
          "[ramp:salesmsg] ❌ NOT DELIVERED — likely trial/account/A2P block",
          {
            conversationId,
            messageId,
            status: msg.status,
            failedReason:
              msg.failed_reason || "(no reason from Salesmsg — check trial limits / number registration)",
          },
        );
      }
      return;
    }
  }

  console.warn("[ramp:salesmsg] ⏳ no terminal delivery status after polling", {
    conversationId,
    messageId,
    lastStatus: lastStatus || "(unknown)",
    note: "stuck on queued/sent usually = trial mode or unregistered number (A2P 10DLC)",
  });
}
