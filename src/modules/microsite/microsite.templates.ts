/** Salon X microsite templates — layout is locked; theme fields are overridable. */

export const RESERVED_SLUGS = new Set([
  "www",
  "api",
  "admin",
  "app",
  "book",
  "cdn",
  "mail",
  "status",
  "demo", // demo.salonx.com = main Salon X app host
  "demo-api",
  "m",
  "salonx",
]);

export type BookingDayHours = { start: string; end: string }[];

export type BookingHours = Partial<
  Record<"sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat", BookingDayHours>
>;

export type MicrositeTemplate = {
  id: string;
  name: string;
  description: string;
  previewLabel: string;
  defaults: {
    primaryHex: string;
    tagline: string;
    about: string;
    bookingHours: BookingHours;
    theme?: Record<string, unknown>;
  };
};

const WEEKDAY_NINE_TO_FIVE: BookingDayHours = [
  { start: "09:00", end: "17:00" },
];

export const SX_BOOK_V1: MicrositeTemplate = {
  id: "sx-book-v1",
  name: "Salon X Book",
  description: "Simple landing + booking wizard. GlossGenius-style, KISS.",
  previewLabel: "Home · Book · Success",
  defaults: {
    primaryHex: "#3b82f6",
    tagline: "Book your next appointment",
    about: "Premium care, easy booking.",
    bookingHours: {
      mon: WEEKDAY_NINE_TO_FIVE,
      tue: WEEKDAY_NINE_TO_FIVE,
      wed: WEEKDAY_NINE_TO_FIVE,
      thu: WEEKDAY_NINE_TO_FIVE,
      fri: WEEKDAY_NINE_TO_FIVE,
    },
  },
};

export const MICROSITE_TEMPLATES: MicrositeTemplate[] = [SX_BOOK_V1];

export function getTemplate(id: string): MicrositeTemplate | null {
  return MICROSITE_TEMPLATES.find((t) => t.id === id) ?? null;
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,31}$/.test(slug) && !RESERVED_SLUGS.has(slug);
}

export function normalizeSlug(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}
