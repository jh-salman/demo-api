import { promises as fs } from "fs";
import path from "path";
import {
  type SalonxV2AdminConfig,
  defaultConfig,
  mergeWithDefaults,
} from "./salonx-config.js";
import { getPrisma } from "./prisma.js";
import {
  clearPrismaDbBackoff,
  isTransientPrismaDbError,
  notePrismaDbFailure,
  prismaErrorSummary,
  shouldSkipPrismaDb,
} from "./prisma-resilience.js";

const configPath = () => path.join(process.cwd(), "data", "config.json");
const publishedConfigPath = () =>
  path.join(process.cwd(), "data", "published-config.json");
const webProjectionPath = () =>
  path.join(process.cwd(), "data", "web-projection-at.txt");

export type ConfigReadMeta = {
  config: SalonxV2AdminConfig;
  revision: string;
  webProjectionRevision: string;
};

async function readWebProjectionFile(): Promise<string> {
  try {
    const t = await fs.readFile(webProjectionPath(), "utf8");
    return t.trim();
  } catch {
    return "";
  }
}

async function writeWebProjectionFile(iso: string): Promise<void> {
  const p = webProjectionPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, `${iso}\n`, "utf8");
}

async function readConfigMetaFromFiles(): Promise<ConfigReadMeta> {
  try {
    const p = configPath();
    const raw = await fs.readFile(p, "utf8");
    const st = await fs.stat(p);
    let webRev = await readWebProjectionFile();
    if (!webRev) {
      webRev = new Date(st.mtimeMs).toISOString();
      await writeWebProjectionFile(webRev);
    }
    return {
      config: mergeWithDefaults(JSON.parse(raw)),
      revision: `file:${st.mtimeMs}`,
      webProjectionRevision: webRev,
    };
  } catch {
    return {
      config: structuredClone(defaultConfig),
      revision: "file:default",
      webProjectionRevision: "file:default",
    };
  }
}

export async function readConfigWithMeta(): Promise<ConfigReadMeta> {
  const prisma = getPrisma();
  if (prisma && !shouldSkipPrismaDb()) {
    try {
      const row = await prisma.salonxBuildConfig.findUnique({
        where: { id: "default" },
      });
      clearPrismaDbBackoff();
      if (row) {
        return {
          config: mergeWithDefaults(row.payload as unknown as SalonxV2AdminConfig),
          revision: row.updatedAt.toISOString(),
          webProjectionRevision: row.webProjectionAt.toISOString(),
        };
      }
      return {
        config: structuredClone(defaultConfig),
        revision: "db:empty",
        webProjectionRevision: "db:empty",
      };
    } catch (e) {
      if (isTransientPrismaDbError(e)) {
        notePrismaDbFailure(e);
        console.warn(
          "[demo-api] Prisma read failed (DB unreachable). Using data/config.json fallback.",
          prismaErrorSummary(e),
        );
      } else {
        console.warn("[demo-api] Prisma read failed. Using data/config.json fallback.", e);
      }
      return readConfigMetaFromFiles();
    }
  }

  return readConfigMetaFromFiles();
}

async function readLiveAppFromFiles(): Promise<ConfigReadMeta> {
  const draftMeta = await readConfigMetaFromFiles();
  const pubPath = publishedConfigPath();
  let pubRaw: string;
  try {
    pubRaw = await fs.readFile(pubPath, "utf8");
  } catch {
    await fs.mkdir(path.dirname(pubPath), { recursive: true });
    await fs.writeFile(
      pubPath,
      `${JSON.stringify(draftMeta.config, null, 2)}\n`,
      "utf8",
    );
    pubRaw = await fs.readFile(pubPath, "utf8");
  }
  const config = mergeWithDefaults(JSON.parse(pubRaw));
  let webRev = await readWebProjectionFile();
  if (!webRev) {
    const st = await fs.stat(pubPath);
    webRev = new Date(st.mtimeMs).toISOString();
    await writeWebProjectionFile(webRev);
  }
  return {
    config,
    revision: draftMeta.revision,
    webProjectionRevision: webRev,
  };
}

export async function readConfigForLiveApp(): Promise<ConfigReadMeta> {
  const prisma = getPrisma();
  if (prisma && !shouldSkipPrismaDb()) {
    try {
      const row = await prisma.salonxBuildConfig.findUnique({
        where: { id: "default" },
      });
      clearPrismaDbBackoff();
      if (row) {
        const src =
          row.publishedPayload != null ? row.publishedPayload : row.payload;
        return {
          config: mergeWithDefaults(src as unknown as SalonxV2AdminConfig),
          revision: row.updatedAt.toISOString(),
          webProjectionRevision: row.webProjectionAt.toISOString(),
        };
      }
      const empty = structuredClone(defaultConfig);
      return {
        config: empty,
        revision: "db:empty",
        webProjectionRevision: "db:empty",
      };
    } catch (e) {
      if (isTransientPrismaDbError(e)) {
        notePrismaDbFailure(e);
        console.warn(
          "[demo-api] Prisma read failed for live app (DB unreachable). Using published file fallback.",
          prismaErrorSummary(e),
        );
      } else {
        console.warn(
          "[demo-api] Prisma read failed for live app. Using published file fallback.",
          e,
        );
      }
      return readLiveAppFromFiles();
    }
  }

  return readLiveAppFromFiles();
}

export async function readConfig(): Promise<SalonxV2AdminConfig> {
  const { config } = await readConfigWithMeta();
  return config;
}

export async function writeConfig(
  config: SalonxV2AdminConfig,
  options?: { publishToApp?: boolean },
): Promise<void> {
  const prisma = getPrisma();
  const serialized = JSON.parse(JSON.stringify(config)) as object;
  const publish = Boolean(options?.publishToApp);

  if (prisma && !shouldSkipPrismaDb()) {
    try {
      await prisma.salonxBuildConfig.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          payload: serialized,
          publishedPayload: serialized,
        },
        update: {
          payload: serialized,
          ...(publish
            ? {
                publishedPayload: serialized,
                webProjectionAt: new Date(),
              }
            : {}),
        },
      });
      clearPrismaDbBackoff();
      return;
    } catch (e) {
      if (isTransientPrismaDbError(e)) {
        notePrismaDbFailure(e);
        console.warn(
          "[demo-api] Prisma write failed; persisting to data/*.json instead.",
          prismaErrorSummary(e),
        );
      } else {
        console.warn("[demo-api] Prisma write failed; persisting to data/*.json instead.", e);
      }
    }
  }

  const p = configPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  if (publish) {
    const pub = publishedConfigPath();
    await fs.mkdir(path.dirname(pub), { recursive: true });
    await fs.writeFile(pub, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    await writeWebProjectionFile(new Date().toISOString());
  }
}
