/**
 * PostgreSQL backup for demo-api (Prisma / DATABASE_URL).
 *
 * Requires `pg_dump` on PATH (PostgreSQL client tools).
 * When R2 env vars are set, uploads the backup to Cloudflare R2 after pg_dump.
 *
 * Usage:
 *   npm run db:backup
 *   npm run db:backup -- --dir=./backups
 *   npm run db:backup -- --out=./backups/manual.sql
 *   npm run db:backup -- --gzip
 *   npm run db:backup -- --no-r2          # skip R2 upload even if configured
 *   npm run db:backup -- --format=custom   # pg_restore-compatible .dump
 *
 * R2 (.env):
 *   R2_ACCOUNT_ID=
 *   R2_ACCESS_KEY_ID=
 *   R2_SECRET_ACCESS_KEY=
 *   R2_BUCKET_NAME=
 *   R2_BACKUP_PREFIX=demo-api/backups/   # optional
 *   R2_ENDPOINT=                         # optional (default: account R2 endpoint)
 *
 * Restore (plain SQL):
 *   npm run db:restore -- backups/demo-api-....sql
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { requireDatabaseUrl } from "./db-url.js";
import { readR2UploadConfigFromEnv, uploadBackupToR2 } from "./r2-upload.js";

type BackupFormat = "plain" | "custom";

function parseArgs() {
  const outArg = process.argv.find((a) => a.startsWith("--out="));
  const dirArg = process.argv.find((a) => a.startsWith("--dir="));
  const formatArg = process.argv.find((a) => a.startsWith("--format="));

  const formatRaw = formatArg?.slice("--format=".length) ?? "plain";
  const format: BackupFormat = formatRaw === "custom" ? "custom" : "plain";

  return {
    out: outArg ? outArg.slice("--out=".length) : null,
    dir: dirArg ? dirArg.slice("--dir=".length) : "backups",
    gzip: process.argv.includes("--gzip") && format === "plain",
    format,
    skipR2: process.argv.includes("--no-r2"),
  };
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function requirePgTool(name: "pg_dump" | "pg_restore") {
  const check = spawnSync(name, ["--version"], { encoding: "utf8" });
  if (check.status !== 0) {
    console.error(
      `[db-backup] ${name} not found. Install PostgreSQL client tools (e.g. brew install libpq).`,
    );
    process.exit(1);
  }
  return (check.stdout || check.stderr || "").trim();
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

function fileSizeLabel(path: string) {
  const bytes = statSync(path).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  let databaseUrl: string;
  try {
    databaseUrl = requireDatabaseUrl();
  } catch (err) {
    console.error(`[db-backup] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const pgVersion = requirePgTool("pg_dump");
  const { out, dir, gzip, format, skipR2 } = parseArgs();

  const backupDir = resolve(process.cwd(), dir);
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  let targetPath: string;
  if (out) {
    targetPath = resolve(process.cwd(), out);
    if (format === "plain" && !gzip && !targetPath.endsWith(".sql")) {
      targetPath = `${targetPath}.sql`;
    }
    const parent = join(targetPath, "..");
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
  } else if (format === "custom") {
    targetPath = join(backupDir, `demo-api-${timestampSlug()}.dump`);
  } else if (gzip) {
    targetPath = join(backupDir, `demo-api-${timestampSlug()}.sql.gz`);
  } else {
    targetPath = join(backupDir, `demo-api-${timestampSlug()}.sql`);
  }

  console.log(`[db-backup] ${pgVersion}`);
  console.log(`[db-backup] Writing ${targetPath}`);

  const commonArgs = [databaseUrl, "--no-owner", "--no-acl", "--clean", "--if-exists"];

  if (format === "custom") {
    run("pg_dump", [...commonArgs, "-Fc", "-f", targetPath]);
  } else if (gzip) {
    const sqlPath = targetPath.endsWith(".gz")
      ? targetPath.slice(0, -3)
      : targetPath.endsWith(".sql")
        ? targetPath
        : `${targetPath}.sql`;
    const gzPath = `${sqlPath}.gz`;
    run("pg_dump", [...commonArgs, "-f", sqlPath]);
    run("gzip", ["-f", sqlPath]);
    if (gzPath !== targetPath) {
      run("mv", [gzPath, targetPath]);
    }
    targetPath = targetPath.endsWith(".gz") ? targetPath : gzPath;
  } else {
    run("pg_dump", [...commonArgs, "-f", targetPath]);
  }

  console.log(`[db-backup] Done — ${fileSizeLabel(targetPath)}`);

  if (skipR2) {
    console.log("[db-backup] R2 upload skipped (--no-r2).");
    return;
  }

  let r2Config;
  try {
    r2Config = readR2UploadConfigFromEnv();
  } catch (err) {
    console.error(`[db-backup] R2 config error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  if (!r2Config) {
    console.log(
      "[db-backup] R2 not configured (set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME). Local file only.",
    );
    return;
  }

  console.log(`[db-backup] Uploading to R2 bucket ${r2Config.bucket}…`);
  try {
    const uploaded = await uploadBackupToR2(targetPath, r2Config);
    console.log(`[db-backup] R2 upload OK — s3://${uploaded.bucket}/${uploaded.key}`);
  } catch (err) {
    console.error("[db-backup] R2 upload failed:", err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
