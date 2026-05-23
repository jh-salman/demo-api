-- RAMP runtime tables (Client Care Card + public token flow)

CREATE TABLE "RampDemoPost" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "brandSlug" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL DEFAULT '',
    "stylistName" TEXT NOT NULL DEFAULT '',
    "products" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'care_sent',
    "sourceType" TEXT NOT NULL DEFAULT 'client_care',
    "careCardUrl" TEXT,
    "compositeUrl" TEXT,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RampDemoPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RampVisit" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RampVisit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RampSharedAsset" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "brandSlug" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'web_upload',
    "phone" TEXT,
    "mediaUrl" TEXT,
    "cloudinaryUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RampSharedAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RampDemoPost_token_key" ON "RampDemoPost"("token");
CREATE INDEX "RampDemoPost_recipientPhone_idx" ON "RampDemoPost"("recipientPhone");
CREATE INDEX "RampDemoPost_brandSlug_idx" ON "RampDemoPost"("brandSlug");
CREATE INDEX "RampVisit_token_idx" ON "RampVisit"("token");
CREATE INDEX "RampSharedAsset_token_idx" ON "RampSharedAsset"("token");

ALTER TABLE "RampVisit" ADD CONSTRAINT "RampVisit_token_fkey" FOREIGN KEY ("token") REFERENCES "RampDemoPost"("token") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RampSharedAsset" ADD CONSTRAINT "RampSharedAsset_token_fkey" FOREIGN KEY ("token") REFERENCES "RampDemoPost"("token") ON DELETE CASCADE ON UPDATE CASCADE;
