-- Calendar client + service catalog (salonx-web-v2 picker lists).
CREATE TABLE "SalonxClientCatalog" (
    "id" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalonxClientCatalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalonxServiceCatalog" (
    "id" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalonxServiceCatalog_pkey" PRIMARY KEY ("id")
);
