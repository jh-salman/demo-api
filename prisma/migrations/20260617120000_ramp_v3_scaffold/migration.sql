-- RAMP V3 scaffold — additive only (does not touch existing Salonx* tables).
-- Recreates Ramp* tables dropped in 20260616120000_drop_ramp with the web-v2 post shape.

CREATE TABLE "RampDemoPost" (
    "id" TEXT NOT NULL,
    "salonId" TEXT NOT NULL DEFAULT 'default',
    "stylistId" TEXT,
    "target" JSONB NOT NULL DEFAULT '{}',
    "caption" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'Curiosity',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "links" JSONB NOT NULL DEFAULT '[]',
    "heroId" TEXT NOT NULL DEFAULT 's0',
    "heroTab" TEXT NOT NULL DEFAULT 'ramp',
    "captureAssetId" TEXT,
    "capturePlacement" JSONB,
    "backgrounds" JSONB NOT NULL DEFAULT '[]',
    "backgroundIndex" INTEGER NOT NULL DEFAULT 0,
    "templateId" TEXT NOT NULL DEFAULT 'tem1',
    "posterByTemplate" JSONB NOT NULL DEFAULT '{}',
    "dirty" JSONB NOT NULL DEFAULT '{}',
    "genState" TEXT NOT NULL DEFAULT 'idle',
    "composedAssetId" TEXT,
    "shipMode" TEXT,
    "shippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RampDemoPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RampVisit" (
    "id" TEXT NOT NULL,
    "salonId" TEXT NOT NULL DEFAULT 'default',
    "stylistId" TEXT,
    "clientId" TEXT,
    "clientName" TEXT NOT NULL,
    "clientSub" TEXT,
    "clientEmoji" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "captureAssetId" TEXT,
    "postId" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RampVisit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RampSharedAsset" (
    "id" TEXT NOT NULL,
    "salonId" TEXT NOT NULL DEFAULT 'default',
    "clientId" TEXT,
    "postId" TEXT,
    "visitId" TEXT,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "url" TEXT NOT NULL,
    "thumbUrl" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RampSharedAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RampVisit_postId_key" ON "RampVisit"("postId");
CREATE INDEX "RampVisit_salonId_status_queuedAt_idx" ON "RampVisit"("salonId", "status", "queuedAt");
CREATE INDEX "RampDemoPost_salonId_genState_idx" ON "RampDemoPost"("salonId", "genState");
CREATE INDEX "RampSharedAsset_salonId_clientId_kind_idx" ON "RampSharedAsset"("salonId", "clientId", "kind");
CREATE INDEX "RampSharedAsset_postId_idx" ON "RampSharedAsset"("postId");
CREATE INDEX "RampSharedAsset_visitId_idx" ON "RampSharedAsset"("visitId");

ALTER TABLE "RampVisit" ADD CONSTRAINT "RampVisit_postId_fkey" FOREIGN KEY ("postId") REFERENCES "RampDemoPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
