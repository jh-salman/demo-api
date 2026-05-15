-- CreateTable
CREATE TABLE "SalonxBuildConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "webProjectionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedPayload" JSONB,

    CONSTRAINT "SalonxBuildConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalonxAppointment" (
    "id" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "service" TEXT NOT NULL DEFAULT '',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "seriesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalonxAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalonxAppointment_startAt_idx" ON "SalonxAppointment"("startAt");

-- CreateIndex
CREATE INDEX "SalonxAppointment_endAt_idx" ON "SalonxAppointment"("endAt");
