/** After transient DB errors, skip Prisma for a while so polling does not hammer/logs. */
const PRISMA_DB_BACKOFF_MS = 60_000;
let prismaDbBackoffUntil = 0;

export function clearPrismaDbBackoff(): void {
  prismaDbBackoffUntil = 0;
}

export function shouldSkipPrismaDb(): boolean {
  return Date.now() < prismaDbBackoffUntil;
}

export function isTransientPrismaDbError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const any = e as { code?: string; name?: string; message?: string };
  const code = any.code;
  if (
    code === "P1001" ||
    code === "P1000" ||
    code === "P1017" ||
    code === "P1011"
  ) {
    return true;
  }
  /* First query can throw PrismaClientInitializationError (no `code`) when TCP/SSL to DB fails. */
  if (any.name === "PrismaClientInitializationError") {
    return true;
  }
  const msg = typeof any.message === "string" ? any.message.toLowerCase() : "";
  if (
    msg.includes("can't reach database") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("connection timed out")
  ) {
    return true;
  }
  return false;
}

export function notePrismaDbFailure(e: unknown): void {
  if (!isTransientPrismaDbError(e)) return;
  prismaDbBackoffUntil = Date.now() + PRISMA_DB_BACKOFF_MS;
}

export function prismaErrorSummary(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = String((e as { message: string }).message);
    return m.split("\n").find((line) => line.trim().length > 0) ?? m;
  }
  return String(e);
}
