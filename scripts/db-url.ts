/**
 * Prisma DATABASE_URL often includes query params that libpq tools reject
 * (e.g. connection_limit, pool_timeout, schema). Strip those for pg_dump/psql.
 */
const PRISMA_ONLY_QUERY_PARAMS = new Set([
  "connection_limit",
  "pool_timeout",
  "pgbouncer",
  "schema",
  "socket_timeout",
  "statement_cache_size",
]);

export function resolveDatabaseUrlForPgTools(raw: string): string {
  const url = new URL(raw);
  for (const key of [...url.searchParams.keys()]) {
    if (PRISMA_ONLY_QUERY_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}

export function requireDatabaseUrl(envVar = "DATABASE_URL"): string {
  const raw = process.env[envVar]?.trim();
  if (!raw) {
    throw new Error(`${envVar} is not set (.env or environment).`);
  }
  if (!/^postgres(ql)?:\/\//i.test(raw)) {
    throw new Error(`${envVar} must be a PostgreSQL connection string.`);
  }
  return resolveDatabaseUrlForPgTools(raw);
}
