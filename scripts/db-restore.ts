/**
 * Restore demo-api PostgreSQL backup created by db-backup.ts.
 *
 * Usage:
 *   npm run db:restore -- backups/demo-api-2026-07-23T12-00-00.sql.gz
 *   npm run db:restore -- backups/demo-api-2026-07-23T12-00-00.dump
 *   npm run db:restore -- backups/demo-api-2026-07-23T12-00-00.sql.gz --yes
 *
 * WARNING: overwrites data in the target DATABASE_URL database.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { requireDatabaseUrl } from "./db-url.js";

function parseArgs() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const yes = args.includes("--yes");
  const file = args.find((a) => !a.startsWith("--")) ?? null;
  return { file, yes };
}

function run(cmd: string, args: string[]) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function confirm(message: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolveAnswer) => {
    rl.question(`${message} [y/N] `, resolveAnswer);
  });
  rl.close();
  return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
}

async function main() {
  let databaseUrl: string;
  try {
    databaseUrl = requireDatabaseUrl();
  } catch (err) {
    console.error(`[db-restore] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const { file, yes } = parseArgs();
  if (!file) {
    console.error("[db-restore] Pass backup file path, e.g. npm run db:restore -- backups/demo-api-....sql.gz");
    process.exit(1);
  }

  const backupPath = resolve(process.cwd(), file);
  if (!existsSync(backupPath)) {
    console.error(`[db-restore] File not found: ${backupPath}`);
    process.exit(1);
  }

  if (!yes) {
    const ok = await confirm(
      `[db-restore] Restore ${backupPath} into DATABASE_URL? This will overwrite existing data.`,
    );
    if (!ok) {
      console.log("[db-restore] Cancelled.");
      process.exit(0);
    }
  }

  if (backupPath.endsWith(".dump")) {
    run("pg_restore", [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-acl",
      "-d",
      databaseUrl,
      backupPath,
    ]);
  } else if (backupPath.endsWith(".gz")) {
    run("sh", ["-c", `gunzip -c ${JSON.stringify(backupPath)} | psql ${JSON.stringify(databaseUrl)}`]);
  } else {
    run("psql", [databaseUrl, "-f", backupPath]);
  }

  console.log("[db-restore] Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
