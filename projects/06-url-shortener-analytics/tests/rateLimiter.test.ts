import Redis from "ioredis";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit } from "../src/lib/rateLimiter";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

beforeEach(async () => {
  const keys = await redis.keys("ratelimit:*");
  if (keys.length) await redis.del(...keys);
});

afterAll(async () => {
  await redis.quit();
});

describe("checkRateLimit", () => {
  it("allows requests up to the limit", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(redis, "user-a", 5, 60_000);
      expect(result.allowed).toBe(true);
    }
  });

  it("rejects the request that exceeds the limit", async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(redis, "user-b", 5, 60_000);
    }
    const sixth = await checkRateLimit(redis, "user-b", 5, 60_000);

    expect(sixth.allowed).toBe(false);
  });

  it("tracks different identifiers independently", async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(redis, "user-c", 5, 60_000);
    }
    // a different identifier is unaffected by user-c's limit
    const result = await checkRateLimit(redis, "user-d", 5, 60_000);

    expect(result.allowed).toBe(true);
  });

  it("allows requests again once the window slides past old entries", async () => {
    const windowMs = 150;
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(redis, "user-e", 3, windowMs);
    }
    expect((await checkRateLimit(redis, "user-e", 3, windowMs)).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, windowMs + 50));

    expect((await checkRateLimit(redis, "user-e", 3, windowMs)).allowed).toBe(true);
  });

  it("enforces the limit correctly under real concurrency (atomic via Lua script)", async () => {
    const CONCURRENT_REQUESTS = 30;
    const LIMIT = 10;

    const results = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, () => checkRateLimit(redis, "user-f", LIMIT, 60_000)),
    );

    const allowedCount = results.filter((r) => r.allowed).length;
    // Without an atomic check-and-increment, concurrent requests could each
    // read the count before any of them write, letting more than LIMIT
    // through. The Lua script prevents that.
    expect(allowedCount).toBe(LIMIT);
  });
});
