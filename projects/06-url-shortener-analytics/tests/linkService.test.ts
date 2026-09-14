import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { createLink, recordClick, resolveLink, SlugTakenError } from "../src/lib/linkService";
import { toBase62 } from "../src/lib/shortcode";

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

beforeEach(async () => {
  await prisma.click.deleteMany();
  await prisma.link.deleteMany();
  const keys = await redis.keys("link:*");
  if (keys.length) await redis.del(...keys);
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});

describe("createLink", () => {
  it("auto-generates a slug as the base62 encoding of the row's own id", async () => {
    const link = await createLink(prisma, redis, { targetUrl: "https://example.com/a" });

    expect(link.slug).toBe(toBase62(link.id));
  });

  it("accepts a custom slug", async () => {
    const link = await createLink(prisma, redis, {
      targetUrl: "https://example.com/b",
      customSlug: "my-custom-link",
    });

    expect(link.slug).toBe("my-custom-link");
  });

  it("rejects a custom slug that's already taken", async () => {
    await createLink(prisma, redis, { targetUrl: "https://example.com/c", customSlug: "taken" });

    await expect(
      createLink(prisma, redis, { targetUrl: "https://example.com/d", customSlug: "taken" }),
    ).rejects.toBeInstanceOf(SlugTakenError);
  });

  it("populates the Redis cache on creation", async () => {
    const link = await createLink(prisma, redis, { targetUrl: "https://example.com/e" });

    const cached = await redis.get(`link:${link.slug}`);
    expect(cached).not.toBeNull();
    expect(JSON.parse(cached!)).toEqual({ targetUrl: "https://example.com/e", linkId: link.id });
  });

  it("does not cache a link created already expired", async () => {
    const link = await createLink(prisma, redis, {
      targetUrl: "https://example.com/f",
      expiresAt: new Date(Date.now() - 1000),
    });

    expect(await redis.get(`link:${link.slug}`)).toBeNull();
  });
});

describe("resolveLink", () => {
  it("resolves from the DB and populates the cache on a miss", async () => {
    const link = await createLink(prisma, redis, { targetUrl: "https://example.com/g" });
    await redis.del(`link:${link.slug}`); // force a cache miss

    const result = await resolveLink(prisma, redis, link.slug);

    expect(result).toEqual({ status: "found", targetUrl: "https://example.com/g", linkId: link.id, fromCache: false });
    expect(await redis.get(`link:${link.slug}`)).not.toBeNull(); // now cached
  });

  it("resolves from the cache without needing the DB row afterward", async () => {
    const link = await createLink(prisma, redis, { targetUrl: "https://example.com/h" });

    const result = await resolveLink(prisma, redis, link.slug);

    expect(result).toEqual({ status: "found", targetUrl: "https://example.com/h", linkId: link.id, fromCache: true });
  });

  it("returns not_found for an unknown slug", async () => {
    const result = await resolveLink(prisma, redis, "does-not-exist");
    expect(result).toEqual({ status: "not_found" });
  });

  it("returns expired for a link past its expiresAt, even though it still exists in the DB", async () => {
    const link = await createLink(prisma, redis, {
      targetUrl: "https://example.com/i",
      expiresAt: new Date(Date.now() + 50),
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const result = await resolveLink(prisma, redis, link.slug);

    expect(result).toEqual({ status: "expired" });
  });
});

describe("recordClick", () => {
  it("creates a Click row linked to the given link id", async () => {
    const link = await createLink(prisma, redis, { targetUrl: "https://example.com/j" });

    await recordClick(prisma, link.id, { referrer: "https://google.com", ip: "127.0.0.1" });

    const clicks = await prisma.click.findMany({ where: { linkId: link.id } });
    expect(clicks).toHaveLength(1);
    expect(clicks[0].referrer).toBe("https://google.com");
  });

  it("stores a null geo when no IP is available, without failing", async () => {
    const link = await createLink(prisma, redis, { targetUrl: "https://example.com/k" });

    await recordClick(prisma, link.id, { referrer: null, ip: null });

    const [click] = await prisma.click.findMany({ where: { linkId: link.id } });
    expect(click.country).toBeNull();
  });
});
