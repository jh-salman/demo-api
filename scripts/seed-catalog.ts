/**
 * One-shot seed: `npm run db:seed-catalog` (from demo-api, with DATABASE_URL set).
 */
import "dotenv/config";
import {
  ensureDefaultClientCatalog,
  ensureDefaultProductCatalog,
  ensureDefaultServiceCatalog,
} from "../src/lib/ensure-default-catalog.js";

async function main() {
  const clients = await ensureDefaultClientCatalog();
  const services = await ensureDefaultServiceCatalog();
  const products = await ensureDefaultProductCatalog();
  console.log(
    clients ? "Seeded client catalog." : "Client catalog already present (skipped).",
  );
  console.log(
    services ? "Seeded service catalog." : "Service catalog already present (skipped).",
  );
  console.log(
    products ? "Seeded product catalog." : "Product catalog already present (skipped).",
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
