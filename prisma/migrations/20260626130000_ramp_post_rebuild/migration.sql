-- RAMP rebuild — drop the old V3 scaffold tables and replace with a single
-- RampPost record (queue row + build doc combined). Demo/scaffold data only.

DROP TABLE IF EXISTS "RampSharedAsset";
DROP TABLE IF EXISTS "RampVisit";
DROP TABLE IF EXISTS "RampDemoPost";

CREATE TABLE "RampPost" (
    "id" TEXT NOT NULL,
    "salonId" TEXT NOT NULL DEFAULT 'default',
    "clientId" TEXT,
    "clientName" TEXT NOT NULL,
    "clientSub" TEXT,
    "clientEmoji" TEXT DEFAULT '🧑',
    "stylistId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'capture',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "capturedImages" JSONB NOT NULL DEFAULT '[]',
    "generatedImages" JSONB NOT NULL DEFAULT '[]',
    "heroImage" TEXT,
    "caption" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'Curiosity',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "links" JSONB NOT NULL DEFAULT '[]',
    "backgroundId" TEXT NOT NULL DEFAULT 'bg1',
    "genState" TEXT NOT NULL DEFAULT 'idle',
    "shipMode" TEXT,
    "shippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RampPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RampPost_salonId_status_createdAt_idx" ON "RampPost"("salonId", "status", "createdAt");
CREATE INDEX "RampPost_clientId_idx" ON "RampPost"("clientId");
