import express, { type Request, type Response } from "express";
import { prisma } from "./prismaClient.js";
import { FakeProcessor } from "./processor.js";
import { withIdempotency } from "./idempotency.js";
import { IdempotencyConflictError } from "./errors.js";

export function createApp(processor: FakeProcessor = new FakeProcessor()) {
  const app = express();
  app.use(express.json());

  app.post("/charges", async (req: Request, res: Response) => {
    const idempotencyKey = req.header("Idempotency-Key");
    if (!idempotencyKey) {
      return res.status(400).json({ error: "Idempotency-Key header is required" });
    }

    const { amount, currency, customerId } = req.body ?? {};
    if (typeof amount !== "number" || amount <= 0 || !currency || !customerId) {
      return res.status(400).json({
        error: "amount (positive number), currency, and customerId are required",
      });
    }

    try {
      const result = await withIdempotency(prisma, idempotencyKey, req.body, async () => {
        const charge = await processor.charge({ amount, currency, customerId });
        await prisma.charge.create({
          data: {
            idempotencyKey,
            processorChargeId: charge.id,
            amount: charge.amount,
            currency: charge.currency,
            customerId: charge.customerId,
            status: charge.status,
          },
        });
        return { status: 201, body: charge };
      });

      res.status(result.status).set("Idempotent-Replayed", String(result.replayed)).json(result.body);
    } catch (err) {
      if (err instanceof IdempotencyConflictError) {
        return res.status(422).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: "Internal error processing charge" });
    }
  });

  app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  createApp().listen(port, () => {
    console.log(`Payment gateway listening on http://localhost:${port}`);
  });
}
