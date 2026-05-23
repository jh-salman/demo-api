/**
 * One-time repair for Render Postgres migration drift:
 * - Removes orphan `20260515104514_init` (applied on DB, never in repo) OR materializes it from logs
 * - Optionally syncs `20260515120000_calendar_catalog` checksum (restore file from git 192486c)
 *
 * Run: npm run db:reconcile-migrations
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const GHOST = "20260515104514_init";
const CALENDAR = "20260515120000_calendar_catalog";

function checksum(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

async function main() {
  const prisma = new PrismaClient();
  const migrationsDir = path.join(process.cwd(), "prisma", "migrations");

  try {
    const rows = await prisma.$queryRaw<
      Array<{ migration_name: string; checksum: string; logs: string | null }>
    >`SELECT migration_name, checksum, logs FROM "_prisma_migrations" ORDER BY started_at`;

    console.log("[reconcile] Applied migrations on DB:");
    for (const row of rows) {
      console.log(`  - ${row.migration_name}`);
    }

    const ghost = rows.find((r) => r.migration_name === GHOST);
    if (ghost) {
      const ghostDir = path.join(migrationsDir, GHOST);
      const ghostFile = path.join(ghostDir, "migration.sql");
      if (ghost.logs?.trim()) {
        await mkdir(ghostDir, { recursive: true });
        await writeFile(ghostFile, ghost.logs.trimEnd() + "\n", "utf8");
        const local = checksum(await readFile(ghostFile));
        if (local !== ghost.checksum) {
          console.warn(
            `[reconcile] Wrote ${GHOST} from DB logs but checksum differs — update _prisma_migrations manually if migrate dev still fails.`,
          );
        } else {
          console.log(`[reconcile] Materialized ${GHOST}/migration.sql from DB logs.`);
        }
      } else {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "_prisma_migrations" WHERE migration_name = $1`,
          GHOST,
        );
        console.log(
          `[reconcile] Removed orphan DB row "${GHOST}" (no logs — not in repo; safe for current schema).`,
        );
      }
    } else {
      console.log(`[reconcile] No orphan "${GHOST}" on DB.`);
    }

    const calendarRow = rows.find((r) => r.migration_name === CALENDAR);
    const calendarFile = path.join(migrationsDir, CALENDAR, "migration.sql");
    if (calendarRow) {
      const localSql = await readFile(calendarFile, "utf8");
      const localSum = checksum(localSql);
      if (localSum !== calendarRow.checksum) {
        console.log(
          `[reconcile] ${CALENDAR} checksum mismatch — local file must match DB-applied SQL (see git 192486c).`,
        );
        console.log(`  DB:    ${calendarRow.checksum}`);
        console.log(`  Local: ${localSum}`);
      } else {
        console.log(`[reconcile] ${CALENDAR} checksum OK.`);
      }
    }

    console.log("[reconcile] Done. Run: npx prisma migrate status");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
