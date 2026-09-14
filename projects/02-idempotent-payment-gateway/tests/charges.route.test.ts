import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/prismaClient.js";
import { createApp } from "../src/server.js";
import { FakeProcessor } from "../src/processor.js";

beforeEach(async () => {
  await prisma.charge.deleteMany();
  await prisma.idempotencyKey.deleteMany();
});

describe("POST /charges", () => {
  it("requires an Idempotency-Key header", async () => {
    const app = createApp();
    const res = await request(app).post("/charges").send({ amount: 500, currency: "usd", customerId: "cus_1" });

    expect(res.status).toBe(400);
  });

  it("validates the request body", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/charges")
      .set("Idempotency-Key", "k1")
      .send({ amount: -5, currency: "usd", customerId: "cus_1" });

    expect(res.status).toBe(400);
  });

  it("charges once and replays the same response on retry", async () => {
    const processor = new FakeProcessor();
    const app = createApp(processor);
    const payload = { amount: 1500, currency: "usd", customerId: "cus_42" };

    const first = await request(app).post("/charges").set("Idempotency-Key", "k-route-1").send(payload);
    expect(first.status).toBe(201);
    expect(first.headers["idempotent-replayed"]).toBe("false");

    const second = await request(app).post("/charges").set("Idempotency-Key", "k-route-1").send(payload);
    expect(second.status).toBe(201);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.body).toEqual(first.body);

    expect(processor.callCount).toBe(1);

    const charges = await prisma.charge.findMany({ where: { idempotencyKey: "k-route-1" } });
    expect(charges).toHaveLength(1);
  });

  it("rejects the same key reused with a different payload", async () => {
    const app = createApp();

    await request(app)
      .post("/charges")
      .set("Idempotency-Key", "k-conflict")
      .send({ amount: 1000, currency: "usd", customerId: "cus_1" });

    const res = await request(app)
      .post("/charges")
      .set("Idempotency-Key", "k-conflict")
      .send({ amount: 2000, currency: "usd", customerId: "cus_1" });

    expect(res.status).toBe(422);
  });

  it("charges exactly once under real concurrent duplicate requests", async () => {
    const processor = new FakeProcessor();
    const app = createApp(processor);
    const payload = { amount: 750, currency: "usd", customerId: "cus_race" };

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).post("/charges").set("Idempotency-Key", "k-race").send(payload),
      ),
    );

    expect(processor.callCount).toBe(1);
    for (const res of responses) {
      expect(res.status).toBe(201);
      expect(res.body.id).toBe(responses[0].body.id);
    }

    const charges = await prisma.charge.findMany({ where: { idempotencyKey: "k-race" } });
    expect(charges).toHaveLength(1);
  });
});
