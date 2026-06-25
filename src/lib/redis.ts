import { Redis } from "@upstash/redis";
import { env } from "../config/env.js";

let client: Redis | null | undefined;

/** Upstash Redis REST client (redis.io / Upstash). Null when not configured. */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    client = null;
    return client;
  }
  client = new Redis({ url, token });
  return client;
}

export function isRedisEnabled(): boolean {
  return getRedis() !== null;
}
