import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient | null {
  if (!process.env.DATABASE_URL?.trim()) return null;
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log:
        process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
  }
  return globalForPrisma.prisma;
}
