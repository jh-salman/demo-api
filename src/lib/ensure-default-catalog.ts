import type { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { DEFAULT_CLIENTS, DEFAULT_SERVICES, DEFAULT_STAFF } from "../seed/default-catalog.js";
import { DEFAULT_PRODUCTS } from "../seed/default-products.js";
import { emitClientsCatalogUpdated } from "../realtime/io.js";
import { emitServiceCatalogUpdated } from "../realtime/io.js";
import { emitProductCatalogUpdated } from "../realtime/io.js";
import { LEGACY_SALON_ID } from "./tenant.js";

function catalogEmpty(items: unknown): boolean {
  return !Array.isArray(items) || items.length === 0;
}

/**
 * Ensure a clients catalog row exists for this salon/org.
 * Legacy `"default"` gets mock seed; org salons start empty (org-owned).
 */
export async function ensureDefaultClientCatalog(
  catalogId: string = LEGACY_SALON_ID,
): Promise<boolean> {
  const prisma = getPrisma();
  if (!prisma) return false;
  const id = catalogId || LEGACY_SALON_ID;

  const row = await prisma.salonxClientCatalog.findUnique({ where: { id } });
  if (row) return false;

  const useMocks = id === LEGACY_SALON_ID;
  const clients = useMocks ? [...DEFAULT_CLIENTS] : [];
  const payload = clients as Prisma.InputJsonValue;
  await prisma.salonxClientCatalog.create({
    data: { id, items: payload },
  });

  const updated = await prisma.salonxClientCatalog.findUnique({ where: { id } });
  emitClientsCatalogUpdated(id, {
    stored: true,
    clients,
    updatedAt: updated?.updatedAt.toISOString(),
  });
  return true;
}

export async function ensureDefaultStaffCatalog(
  catalogId: string = LEGACY_SALON_ID,
): Promise<boolean> {
  const prisma = getPrisma();
  if (!prisma) return false;
  const id = catalogId || LEGACY_SALON_ID;

  const row = await prisma.salonxStaffCatalog.findUnique({ where: { id } });
  const items = row?.items;
  if (row && !catalogEmpty(items)) return false;

  // Org salons start empty — owner/stylists are linked via ensureStaffCatalogForMember.
  const useMocks = id === LEGACY_SALON_ID;
  const payload = (useMocks ? [...DEFAULT_STAFF] : []) as Prisma.InputJsonValue;
  await prisma.salonxStaffCatalog.upsert({
    where: { id },
    create: { id, items: payload },
    update: { items: payload },
  });
  return true;
}

export async function ensureDefaultServiceCatalog(
  catalogId: string = LEGACY_SALON_ID,
): Promise<boolean> {
  const prisma = getPrisma();
  if (!prisma) return false;
  const id = catalogId || LEGACY_SALON_ID;

  const row = await prisma.salonxServiceCatalog.findUnique({ where: { id } });
  const items = row?.items;
  if (row && !catalogEmpty(items)) return false;

  const payload = [...DEFAULT_SERVICES] as Prisma.InputJsonValue;
  await prisma.salonxServiceCatalog.upsert({
    where: { id },
    create: { id, items: payload },
    update: { items: payload },
  });

  const updated = await prisma.salonxServiceCatalog.findUnique({ where: { id } });
  emitServiceCatalogUpdated(id, {
    stored: true,
    serviceCatalog: DEFAULT_SERVICES,
    updatedAt: updated?.updatedAt.toISOString(),
  });
  return true;
}

export async function ensureDefaultProductCatalog(
  catalogId: string = LEGACY_SALON_ID,
): Promise<boolean> {
  const prisma = getPrisma();
  if (!prisma) return false;
  const id = catalogId || LEGACY_SALON_ID;

  const row = await prisma.salonxProductCatalog.findUnique({ where: { id } });
  const items = row?.items;
  if (row && !catalogEmpty(items)) return false;

  const payload = [...DEFAULT_PRODUCTS] as Prisma.InputJsonValue;
  await prisma.salonxProductCatalog.upsert({
    where: { id },
    create: { id, items: payload },
    update: { items: payload },
  });

  const updated = await prisma.salonxProductCatalog.findUnique({ where: { id } });
  emitProductCatalogUpdated(id, {
    stored: true,
    products: DEFAULT_PRODUCTS,
    updatedAt: updated?.updatedAt.toISOString(),
  });
  return true;
}

/** Seed all operational catalogs for a new salon (org create / onboard). */
export async function seedSalonCatalogs(salonId: string): Promise<void> {
  await Promise.all([
    ensureDefaultClientCatalog(salonId),
    ensureDefaultStaffCatalog(salonId),
    ensureDefaultServiceCatalog(salonId),
    ensureDefaultProductCatalog(salonId),
  ]);
}
