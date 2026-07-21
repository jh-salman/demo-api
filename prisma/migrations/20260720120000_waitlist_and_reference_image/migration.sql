-- AlterTable
ALTER TABLE "SalonxAppointment" ADD COLUMN IF NOT EXISTS "referenceImageUrl" TEXT;
ALTER TABLE "SalonxAppointment" ADD COLUMN IF NOT EXISTS "referenceImageReviewedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SalonxWaitlistEntry" (
    "id" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientPhone" TEXT NOT NULL,
    "serviceId" TEXT,
    "staffId" TEXT,
    "preferredDates" JSONB NOT NULL DEFAULT '[]',
    "preferredWindow" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalonxWaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalonxWaitlistEntry_salonId_status_createdAt_idx" ON "SalonxWaitlistEntry"("salonId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "SalonxWaitlistEntry_salonId_createdAt_idx" ON "SalonxWaitlistEntry"("salonId", "createdAt");
