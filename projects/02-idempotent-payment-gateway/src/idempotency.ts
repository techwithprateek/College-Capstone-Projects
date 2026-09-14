import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { IdempotencyConflictError } from "./errors.js";

const MAX_ATTEMPTS = 50;
const RETRY_DELAY_MS = 20;

function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface HandlerResult<T> {
  status: number;
  body: T;
}

export interface IdempotentResult<T> extends HandlerResult<T> {
  /** True if this response came from a stored prior result, not fresh work. */
  replayed: boolean;
}

/**
 * Runs `handler` at most once for a given idempotency key, no matter how
 * many times or how concurrently this function is called with that key.
 *
 * The safety property comes entirely from the database: `IdempotencyKey.key`
 * has a unique constraint, so when N concurrent callers race to claim the
 * same key, exactly one `create()` succeeds and every other caller gets a
 * unique-constraint violation. Losers don't error out — they loop back
 * around and wait for the winner to finish, then replay its stored result.
 * This is deliberately NOT implemented with an in-process lock (e.g. a Map
 * of in-flight promises): an in-process lock only protects a single server
 * instance, while the database constraint is safe across any number of
 * server instances handling requests concurrently.
 */
export async function withIdempotency<T>(
  prisma: PrismaClient,
  key: string,
  requestPayload: unknown,
  handler: () => Promise<HandlerResult<T>>,
): Promise<IdempotentResult<T>> {
  const requestHash = hashPayload(requestPayload);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const existing = await prisma.idempotencyKey.findUnique({ where: { key } });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new IdempotencyConflictError(key);
      }
      if (existing.status === "completed") {
        return {
          status: existing.responseStatus!,
          body: existing.responseBody as T,
          replayed: true,
        };
      }
      if (existing.status === "failed") {
        throw new Error(`Idempotency key "${key}" previously failed; not retrying automatically`);
      }
      // status === "processing": another request (or another concurrent
      // caller) owns this key right now. Wait for it to finish.
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    try {
      await prisma.idempotencyKey.create({
        data: { key, requestHash, status: "processing" },
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        // Lost the race to claim this key between our findUnique and
        // create — someone else is now the owner. Loop back and wait.
        continue;
      }
      throw err;
    }

    // We won the race to claim this key — we're the only caller that will
    // ever execute the handler for it.
    try {
      const result = await handler();
      await prisma.idempotencyKey.update({
        where: { key },
        data: {
          status: "completed",
          responseStatus: result.status,
          responseBody: result.body as Prisma.InputJsonValue,
        },
      });
      return { ...result, replayed: false };
    } catch (err) {
      await prisma.idempotencyKey.update({
        where: { key },
        data: { status: "failed" },
      });
      throw err;
    }
  }

  throw new Error(`Idempotency key "${key}" did not resolve after ${MAX_ATTEMPTS} attempts`);
}
