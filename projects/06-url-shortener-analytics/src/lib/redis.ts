import Redis from "ioredis";

let client: Redis | null = null;

/** Lazily constructed so importing this module never requires Redis to
 * already be reachable — only actually using it does. */
export function getRedis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  }
  return client;
}
