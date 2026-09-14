import type Redis from "ioredis";

// KEYS[1] = rate limit key, ARGV = [now, windowMs, limit, member]
const SLIDING_WINDOW_SCRIPT = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1] - ARGV[2])
local count = redis.call('ZCARD', KEYS[1])
if count < tonumber(ARGV[3]) then
  redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  return 1
else
  return 0
end
`;

export interface RateLimitResult {
  allowed: boolean;
}

/**
 * A true sliding-window-log rate limiter, not the more common (and subtly
 * wrong) fixed-window counter. A fixed window lets a client burst up to 2x
 * the limit right across a window boundary — e.g. 10 requests in the last
 * second of minute N, another 10 in the first second of minute N+1, with
 * no window ever "seeing" more than 10. Storing each request's own
 * timestamp in a Redis sorted set and counting only the ones still inside
 * the trailing window avoids that.
 *
 * Runs as a single Lua script (`EVAL`) so the whole check-then-increment
 * is atomic. Without that, two concurrent requests could both read a count
 * just under the limit before either writes anything, and both get
 * allowed through — overshooting the limit under real concurrency, the
 * same class of bug the idempotent-payment-gateway project is about.
 */
export async function checkRateLimit(
  redis: Redis,
  identifier: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const key = `ratelimit:${identifier}`;
  const now = Date.now();
  const member = `${now}-${Math.random().toString(36).slice(2)}`;

  const result = await redis.eval(SLIDING_WINDOW_SCRIPT, 1, key, now, windowMs, limit, member);
  return { allowed: result === 1 };
}
