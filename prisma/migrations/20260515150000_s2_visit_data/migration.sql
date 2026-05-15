-- CreateTable
CREATE TABLE "SalonxClientConsultation" (
    "clientKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalonxClientConsultation_pkey" PRIMARY KEY ("clientKey")
);

-- CreateTable
CREATE TABLE "SalonxAppointmentVisit" (
    "appointmentId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalonxAppointmentVisit_pkey" PRIMARY KEY ("appointmentId")
);

-- CreateTable
CREATE TABLE "SalonxProductCatalog" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "items" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalonxProductCatalog_pkey" PRIMARY KEY ("id")
);
