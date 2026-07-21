import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { env } from "../../config/env.js";
import type { BriefGenerationResult, GhostPlant } from "./ghost-notes.types.js";

export type ColdStartInput = {
  clientName: string;
  services: string[];
  appointmentNotes?: string | null;
  allergyFlags?: string[];
  lifestyleNotes?: unknown;
  hasReferencePhoto?: boolean;
};

function loadReturningClientPrompt(): string {
  const candidates = [
    join(process.cwd(), "src/modules/ghost-notes/prompts/returning_client.txt"),
    join(process.cwd(), "dist/modules/ghost-notes/prompts/returning_client.txt"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, "utf8");
    }
  }
  return "Generate a JSON brief for client {first_name} {last_name} with services {services_booked}.";
}

const returningClientPrompt = loadReturningClientPrompt();

function openAiClient(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

function defaultBackBar(services: string[]) {
  const serviceStr = services.join(" ").toLowerCase();
  const isMale =
    serviceStr.includes("men") ||
    serviceStr.includes("barber") ||
    serviceStr.includes("beard");
  return isMale
    ? [{ product_name: "Styling Wax or Palmade", brand: "", qty: 1, default: true }]
    : [
        { product_name: "Styling Product (gel/lotion)", brand: "", qty: 1, default: true },
        { product_name: "Heat Protectant", brand: "", qty: 1, default: true },
      ];
}

function firstNameOf(clientName: string) {
  return clientName.trim().split(/\s+/)[0] || "Client";
}

/** Factual first-visit brief — only uses data on file, no invented history. */
function buildFirstVisitBriefText(input: ColdStartInput): string {
  const firstName = firstNameOf(input.clientName);
  const serviceStr = input.services.filter(Boolean).join(", ") || "General service";
  const lines: string[] = [`${firstName} — first visit, booked for ${serviceStr}.`];

  const notes = input.appointmentNotes?.trim();
  if (notes) {
    lines.push(`Booking note: ${notes.slice(0, 240)}`);
  }
  if (input.hasReferencePhoto) {
    lines.push("Client shared a reference image — review in LOOK before you begin.");
  }
  const allergies = (input.allergyFlags || []).filter(Boolean);
  if (allergies.length) {
    lines.push(`Allergy flags on file: ${allergies.join(", ")}.`);
  }
  const lifestyle = input.lifestyleNotes;
  if (lifestyle && typeof lifestyle === "object" && !Array.isArray(lifestyle)) {
    const keys = Object.keys(lifestyle as Record<string, unknown>);
    if (keys.length) {
      lines.push(
        `Lifestyle notes: ${JSON.stringify(lifestyle).slice(0, 160)}`,
      );
    }
  }

  return lines.join(" ");
}

function buildFirstVisitPlants(input: ColdStartInput): GhostPlant[] {
  const plants: GhostPlant[] = [
    {
      id: "cold_start_1",
      text: "First visit. Ask what brought them in today.",
      type: "curiosity",
    },
  ];
  const notes = input.appointmentNotes?.trim();
  if (notes) {
    plants.push({
      id: "cold_start_2",
      text: `On file from booking: ${notes.slice(0, 120)}`,
      type: "context",
    });
  } else if (input.hasReferencePhoto) {
    plants.push({
      id: "cold_start_2",
      text: "Reference photo on file — review in LOOK before you start.",
      type: "look",
    });
  }
  return plants;
}

export function generateColdStartBrief(input: ColdStartInput): BriefGenerationResult {
  return {
    brief: buildFirstVisitBriefText(input),
    plants: buildFirstVisitPlants(input),
    back_bar: defaultBackBar(input.services),
    retail_suggestions: [],
  };
}

function fallbackBrief(services: string[]): BriefGenerationResult {
  return {
    brief: null,
    plants: [],
    back_bar: defaultBackBar(services),
    retail_suggestions: [],
  };
}

function parseBriefJson(text: string, services: string[]): BriefGenerationResult {
  try {
    const parsed = JSON.parse(text) as Partial<BriefGenerationResult>;
    return {
      brief: typeof parsed.brief === "string" ? parsed.brief : null,
      plants: Array.isArray(parsed.plants) ? parsed.plants : [],
      back_bar: Array.isArray(parsed.back_bar) ? parsed.back_bar : defaultBackBar(services),
      retail_suggestions: Array.isArray(parsed.retail_suggestions)
        ? parsed.retail_suggestions
        : [],
    };
  } catch {
    console.error("[ghost-notes] JSON parse failed — using fallback brief");
    return fallbackBrief(services);
  }
}

export async function generateReturningClientBrief(input: {
  clientName: string;
  services: string[];
  priorSessions: unknown[];
  allergyFlags?: string[];
  lifestyleNotes?: unknown;
}): Promise<BriefGenerationResult> {
  const client = openAiClient();
  if (!client) {
    return fallbackBrief(input.services);
  }

  const parts = input.clientName.trim().split(/\s+/);
  const firstName = parts[0] || "Client";
  const lastName = parts.slice(1).join(" ");

  const prompt = returningClientPrompt
    .replace("{first_name}", firstName)
    .replace("{last_name}", lastName)
    .replace("{services_booked}", input.services.join(", ") || "General service")
    .replace(
      "{allergy_flags}",
      (input.allergyFlags || []).join(", ") || "None on file",
    )
    .replace("{lifestyle_notes}", JSON.stringify(input.lifestyleNotes ?? {}))
    .replace("{prior_sessions_json}", JSON.stringify(input.priorSessions, null, 2));

  try {
    const response = await client.chat.completions.create({
      model: env.GHOST_NOTES_MODEL,
      max_tokens: 1000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are the intelligence layer of a professional salon platform.
Your job is to build a pre-consultation brief for a stylist before they serve a client.
The brief must be warm, specific, and human.
Reference real details from prior sessions.
Never be generic. Never be clinical.
Respond ONLY with valid JSON.`,
        },
        { role: "user", content: prompt },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) return fallbackBrief(input.services);
    return parseBriefJson(text, input.services);
  } catch (err) {
    console.error("[ghost-notes] OpenAI brief failed:", err);
    return fallbackBrief(input.services);
  }
}

export async function generateBrief(input: {
  clientName: string;
  services: string[];
  isNewClient: boolean;
  priorSessions: unknown[];
  allergyFlags?: string[];
  lifestyleNotes?: unknown;
  appointmentNotes?: string | null;
  hasReferencePhoto?: boolean;
}): Promise<BriefGenerationResult> {
  if (input.isNewClient || input.priorSessions.length === 0) {
    return generateColdStartBrief({
      clientName: input.clientName,
      services: input.services,
      appointmentNotes: input.appointmentNotes,
      allergyFlags: input.allergyFlags,
      lifestyleNotes: input.lifestyleNotes,
      hasReferencePhoto: input.hasReferencePhoto,
    });
  }
  return generateReturningClientBrief(input);
}
