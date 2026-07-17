-- CreateTable
CREATE TABLE "Salon" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "templateId" TEXT NOT NULL DEFAULT 'sx-book-v1',
    "phone" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "primaryHex" TEXT NOT NULL DEFAULT '#3b82f6',
    "logoUrl" TEXT,
    "tagline" TEXT,
    "about" TEXT,
    "bookingHours" JSONB NOT NULL DEFAULT '{}',
    "micrositeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Salon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Salon_slug_key" ON "Salon"("slug");

-- CreateIndex
CREATE INDEX "Salon_micrositeEnabled_idx" ON "Salon"("micrositeEnabled");

-- AlterTable
ALTER TABLE "SalonxAppointment" ADD COLUMN IF NOT EXISTS "salonId" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "SalonxAppointment" ADD COLUMN IF NOT EXISTS "clientPhone" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalonxAppointment_salonId_startAt_idx" ON "SalonxAppointment"("salonId", "startAt");
