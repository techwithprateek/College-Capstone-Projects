export class IdempotencyConflictError extends Error {
  constructor(key: string) {
    super(`Idempotency-Key "${key}" was already used with a different request payload`);
    this.name = "IdempotencyConflictError";
  }
}
