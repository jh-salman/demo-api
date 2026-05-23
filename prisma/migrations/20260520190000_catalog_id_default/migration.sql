-- Align catalog id defaults with schema.prisma (@default("default")).
ALTER TABLE "SalonxClientCatalog" ALTER COLUMN "id" SET DEFAULT 'default';
ALTER TABLE "SalonxServiceCatalog" ALTER COLUMN "id" SET DEFAULT 'default';
