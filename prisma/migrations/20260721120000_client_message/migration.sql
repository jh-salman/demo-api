-- CreateTable
CREATE TABLE IF NOT EXISTS "SalonxClientMessage" (
    "id" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "clientPhone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'sms',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "providerId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalonxClientMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalonxClientMessage_salonId_createdAt_idx" ON "SalonxClientMessage"("salonId", "createdAt");
CREATE INDEX IF NOT EXISTS "SalonxClientMessage_appointmentId_idx" ON "SalonxClientMessage"("appointmentId");
