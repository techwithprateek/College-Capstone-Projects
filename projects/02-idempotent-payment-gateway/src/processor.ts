import { randomUUID } from "node:crypto";

/**
 * Stands in for a real payment processor (Stripe, etc). Simulates network
 * latency so tests exercise the actual race condition idempotency is meant
 * to prevent, rather than resolving so fast the race never has a chance to
 * happen.
 */

export interface ChargeInput {
  amount: number;
  currency: string;
  customerId: string;
}

export interface ChargeResult {
  id: string;
  amount: number;
  currency: string;
  customerId: string;
  status: "succeeded";
}

const LATENCY_MS = 80;

export class FakeProcessor {
  callCount = 0;

  async charge(input: ChargeInput): Promise<ChargeResult> {
    this.callCount += 1;
    await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

    if (input.amount <= 0) {
      throw new Error("Amount must be a positive integer (smallest currency unit, e.g. cents)");
    }

    return {
      id: `ch_${randomUUID()}`,
      amount: input.amount,
      currency: input.currency,
      customerId: input.customerId,
      status: "succeeded",
    };
  }
}
