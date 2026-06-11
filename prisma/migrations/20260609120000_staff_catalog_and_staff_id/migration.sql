-- AlterTable
ALTER TABLE "SalonxAppointment" ADD COLUMN "staffId" TEXT;

-- CreateIndex
CREATE INDEX "SalonxAppointment_staffId_idx" ON "SalonxAppointment"("staffId");

-- CreateTable
CREATE TABLE "SalonxStaffCatalog" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "items" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalonxStaffCatalog_pkey" PRIMARY KEY ("id")
);
