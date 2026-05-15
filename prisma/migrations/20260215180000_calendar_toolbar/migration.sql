-- CreateTable
CREATE TABLE "SalonxCalendarToolbar" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "parkedFromDrag" JSONB NOT NULL,
    "toolbarEvents" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalonxCalendarToolbar_pkey" PRIMARY KEY ("id")
);
