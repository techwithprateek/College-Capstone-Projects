import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET } from "../src/app/[slug]/route";
import { createLink } from "../src/lib/linkService";

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

function makeRequest(slug: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000/${slug}`, { headers });
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("waitFor timed out");
}

describe("GET /[slug]", () => {
  it("redirects to the target URL with a 302", async () => {
    const link = await createLink(prisma, redis, { targetUrl: "https://example.com/hello" });

    const res = await GET(makeRequest(link.slug), { params: Promise.resolve({ slug: link.slug }) });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com/hello");

    // The redirect deliberately doesn't await click recording (see
    // linkService.ts), but this test must before it ends — otherwise that
    // fire-and-forget write can land AFTER the next test's beforeEach has
    // already deleted this Link row, causing a spurious foreign-key error
    // logged against an unrelated test.
    await waitFor(async () => (await prisma.click.count({ where: { linkId: link.id } })) === 1);
  });

  it("returns 404 for an unknown slug", async () => {
    const res = await GET(makeRequest("nope"), { params: Promise.resolve({ slug: "nope" }) });
    expect(res.status).toBe(404);
  });

  it("returns 410 for an expired link", async () => {
    const link = await createLink(prisma, redis, {
      targetUrl: "https://example.com/gone",
      expiresAt: new Date(Date.now() + 50),
    });
    await new Promise((r) => setTimeout(r, 100));

    const res = await GET(makeRequest(link.slug), { params: Promise.resolve({ slug: link.slug }) });

    expect(res.status).toBe(410);
  });

  it("records a click without delaying the redirect response", async () => {
    const link = await createLink(prisma, redis, { targetUrl: "https://example.com/tracked" });

    const res = await GET(makeRequest(link.slug, { referer: "https://twitter.com" }), {
      params: Promise.resolve({ slug: link.slug }),
    });
    expect(res.status).toBe(302); // response already returned

    // the click write happens after the response — poll briefly for it
    await waitFor(async () => (await prisma.click.count({ where: { linkId: link.id } })) === 1);
    const [click] = await prisma.click.findMany({ where: { linkId: link.id } });
    expect(click.referrer).toBe("https://twitter.com");
  });
});
