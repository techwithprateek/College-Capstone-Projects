import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/prismaClient.js";
import { withIdempotency } from "../src/idempotency.js";
import { IdempotencyConflictError } from "../src/errors.js";

beforeEach(async () => {
  await prisma.charge.deleteMany();
  await prisma.idempotencyKey.deleteMany();
});

describe("withIdempotency", () => {
  it("runs the handler exactly once, even under real concurrency", async () => {
    let callCount = 0;
    const handler = async () => {
      callCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 50)); // simulate slow work
      return { status: 201, body: { chargedAt: Date.now() } };
    };

    const CONCURRENT_REQUESTS = 20;
    const results = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, () =>
        withIdempotency(prisma, "key-concurrent", { amount: 500 }, handler),
      ),
    );

    expect(callCount).toBe(1);

    const [first, ...rest] = results;
    for (const result of rest) {
      expect(result.body).toEqual(first.body);
    }
    // Exactly one caller should have actually done the work; every other
    // caller — including concurrent ones — got a replayed result.
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(results.filter((r) => r.replayed)).toHaveLength(CONCURRENT_REQUESTS - 1);

    const rows = await prisma.idempotencyKey.findMany({ where: { key: "key-concurrent" } });
    expect(rows).toHaveLength(1);
  });

  it("replays the stored response on a sequential retry with the same payload", async () => {
    let callCount = 0;
    const handler = async () => {
      callCount += 1;
      return { status: 201, body: { id: "charge-1" } };
    };

    const first = await withIdempotency(prisma, "key-retry", { amount: 100 }, handler);
    const second = await withIdempotency(prisma, "key-retry", { amount: 100 }, handler);

    expect(callCount).toBe(1);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.body).toEqual(first.body);
  });

  it("rejects reuse of the same key with a different payload", async () => {
    const handler = async () => ({ status: 201, body: { id: "charge-1" } });

    await withIdempotency(prisma, "key-reused", { amount: 100 }, handler);

    await expect(
      withIdempotency(prisma, "key-reused", { amount: 999 }, handler),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("does not poison the key on failure — a fresh key can still succeed", async () => {
    const failingHandler = async (): Promise<never> => {
      throw new Error("processor declined");
    };

    await expect(
      withIdempotency(prisma, "key-fails", { amount: 100 }, failingHandler),
    ).rejects.toThrow("processor declined");

    const row = await prisma.idempotencyKey.findUnique({ where: { key: "key-fails" } });
    expect(row?.status).toBe("failed");

    // A different key for a different request is unaffected.
    const okHandler = async () => ({ status: 201, body: { id: "charge-ok" } });
    const result = await withIdempotency(prisma, "key-ok", { amount: 100 }, okHandler);
    expect(result.replayed).toBe(false);
  });
});
