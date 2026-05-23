import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient | null {
  if (!process.env.DATABASE_URL?.trim()) return null;
  if (!globalForPrisma.prisma) {
    const devLogs =
      process.env.PRISMA_LOG_QUERIES === "true"
        ? (["query", "error", "warn"] as const)
        : (["error", "warn"] as const);
    globalForPrisma.prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? [...devLogs] : ["error"],
    });
  }
  return globalForPrisma.prisma;
}
