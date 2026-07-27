import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export type R2UploadConfig = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  prefix: string;
};

/** @returns null when R2 is not configured (local-only backup). */
export function readR2UploadConfigFromEnv(): R2UploadConfig | null {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket =
    process.env.R2_BUCKET_NAME?.trim() ?? process.env.R2_BUCKET?.trim() ?? "";
  const accountId = process.env.R2_ACCOUNT_ID?.trim() ?? "";

  if (!accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }

  const endpoint =
    process.env.R2_ENDPOINT?.trim()?.replace(/\/$/, "") ||
    (accountId
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : "");

  if (!endpoint) {
    throw new Error(
      "R2 upload requires R2_ACCOUNT_ID or R2_ENDPOINT when access keys are set.",
    );
  }

  const prefixRaw = process.env.R2_BACKUP_PREFIX?.trim() || "demo-api/backups/";
  const prefix = prefixRaw.endsWith("/") ? prefixRaw : `${prefixRaw}/`;

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    prefix,
  };
}

function contentTypeForBackup(path: string): string {
  if (path.endsWith(".sql")) return "application/sql";
  if (path.endsWith(".sql.gz")) return "application/gzip";
  if (path.endsWith(".dump")) return "application/octet-stream";
  return "application/octet-stream";
}

/** Upload a local backup file to Cloudflare R2 (S3-compatible). */
export async function uploadBackupToR2(
  localPath: string,
  config: R2UploadConfig,
): Promise<{ bucket: string; key: string }> {
  const key = `${config.prefix}${basename(localPath)}`;
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: createReadStream(localPath),
      ContentType: contentTypeForBackup(localPath),
      Metadata: {
        source: "demo-api",
        "backup-file": basename(localPath),
      },
    }),
  );

  return { bucket: config.bucket, key };
}
