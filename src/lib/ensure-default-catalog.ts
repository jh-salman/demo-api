import type { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { DEFAULT_CLIENTS, DEFAULT_SERVICES } from "../seed/default-catalog.js";
import { DEFAULT_PRODUCTS } from "../seed/default-products.js";
import { emitClientsCatalogUpdated } from "../realtime/io.js";
import { emitServiceCatalogUpdated } from "../realtime/io.js";
import { emitProductCatalogUpdated } from "../realtime/io.js";

function catalogEmpty(items: unknown): boolean {
  return !Array.isArray(items) || items.length === 0;
}

/** Seed mock catalog into Postgres when missing (first GET / deploy). */
export async function ensureDefaultClientCatalog(): Promise<boolean> {
  const prisma = getPrisma();
  if (!prisma) return false;

  const row = await prisma.salonxClientCatalog.findUnique({ where: { id: "default" } });
  const items = row?.items;
  if (row && !catalogEmpty(items)) return false;

  const payload = [...DEFAULT_CLIENTS] as Prisma.InputJsonValue;
  await prisma.salonxClientCatalog.upsert({
    where: { id: "default" },
    create: { id: "default", items: payload },
    update: { items: payload },
  });

  const updated = await prisma.salonxClientCatalog.findUnique({ where: { id: "default" } });
  emitClientsCatalogUpdated({
    stored: true,
    clients: DEFAULT_CLIENTS,
    updatedAt: updated?.updatedAt.toISOString(),
  });
  return true;
}

export async function ensureDefaultServiceCatalog(): Promise<boolean> {
  const prisma = getPrisma();
  if (!prisma) return false;

  const row = await prisma.salonxServiceCatalog.findUnique({ where: { id: "default" } });
  const items = row?.items;
  if (row && !catalogEmpty(items)) return false;

  const payload = [...DEFAULT_SERVICES] as Prisma.InputJsonValue;
  await prisma.salonxServiceCatalog.upsert({
    where: { id: "default" },
    create: { id: "default", items: payload },
    update: { items: payload },
  });

  const updated = await prisma.salonxServiceCatalog.findUnique({ where: { id: "default" } });
  emitServiceCatalogUpdated({
    stored: true,
    serviceCatalog: DEFAULT_SERVICES,
    updatedAt: updated?.updatedAt.toISOString(),
  });
  return true;
}

export async function ensureDefaultProductCatalog(): Promise<boolean> {
  const prisma = getPrisma();
  if (!prisma) return false;

  const row = await prisma.salonxProductCatalog.findUnique({ where: { id: "default" } });
  const items = row?.items;
  if (row && !catalogEmpty(items)) return false;

  const payload = [...DEFAULT_PRODUCTS] as Prisma.InputJsonValue;
  await prisma.salonxProductCatalog.upsert({
    where: { id: "default" },
    create: { id: "default", items: payload },
    update: { items: payload },
  });

  const updated = await prisma.salonxProductCatalog.findUnique({ where: { id: "default" } });
  emitProductCatalogUpdated({
    stored: true,
    products: DEFAULT_PRODUCTS,
    updatedAt: updated?.updatedAt.toISOString(),
  });
  return true;
}
