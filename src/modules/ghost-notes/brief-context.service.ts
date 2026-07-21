import {
  clientConsultationService,
  normalizeClientKey,
} from "../client-consultation/client-consultation.service.js";
import type { GhostBriefPayload } from "./ghost-notes.types.js";

type ConsultRecord = Record<string, unknown>;

function asRecord(v: unknown): ConsultRecord {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as ConsultRecord) : {};
}

function entryTexts(entries: unknown): string[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((e) => {
      if (!e || typeof e !== "object") return "";
      const text = (e as { text?: unknown }).text;
      return typeof text === "string" ? text.trim() : "";
    })
    .filter(Boolean);
}

export function buildPriorSessionsFromRecord(record: ConsultRecord) {
  const life = entryTexts(record.LIFE_entries);
  const chair = entryTexts(record.CHAIR_entries);
  const path = entryTexts(record.PATH_entries);
  const hasHistory = life.length + chair.length + path.length > 0;
  if (!hasHistory) return [];

  return [
    {
      completed_at: typeof record.updatedAt === "number"
        ? new Date(record.updatedAt).toISOString()
        : new Date().toISOString(),
      consultation_notes: {
        LIFE: life.slice(0, 3),
        CHAIR: chair.slice(0, 3),
        PATH: path.slice(0, 3),
      },
      services_performed: [],
      back_bar_products: Array.isArray((record.ghost as ConsultRecord)?.back_bar)
        ? (record.ghost as ConsultRecord).back_bar
        : [],
    },
  ];
}

export async function loadBriefContext(
  salonId: string,
  clientKey: string,
  clientName: string,
) {
  const key = normalizeClientKey(clientKey || clientName);
  const row = await clientConsultationService.get(key, salonId);
  const record = asRecord(row.record);
  const priorSessions = buildPriorSessionsFromRecord(record);
  const isNewClient = priorSessions.length === 0;

  const allergyRaw = record.allergy_flags ?? record.allergyFlags;
  const allergyFlags = Array.isArray(allergyRaw)
    ? allergyRaw.filter((x): x is string => typeof x === "string")
    : [];

  return {
    clientKey: key,
    record,
    priorSessions,
    isNewClient,
    allergyFlags,
    lifestyleNotes: record.lifestyle_notes ?? record.lifestyleNotes ?? {},
    updatedAt: row.updatedAt ?? null,
  };
}

export function mergeGhostIntoRecord(
  record: ConsultRecord,
  ghost: GhostBriefPayload,
): ConsultRecord {
  return {
    ...record,
    updatedAt: Date.now(),
    ghost,
  };
}
