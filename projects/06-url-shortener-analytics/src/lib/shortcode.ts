const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BASE = ALPHABET.length; // 62

/**
 * Base62-encodes a positive integer.
 *
 * This is the entire short-code generation strategy: the database's own
 * autoincrement id is already guaranteed unique, so encoding it in a
 * URL-safe alphabet IS the short code. No randomness, no "generate and
 * check for collision, retry" loop needed — the alternative strategy some
 * shorteners use, and the one custom slugs still need (see
 * linkService.ts's handling of a unique-constraint violation on a
 * caller-chosen slug).
 */
export function toBase62(n: number): string {
  if (n < 0 || !Number.isInteger(n)) {
    throw new RangeError(`toBase62 requires a non-negative integer, got ${n}`);
  }
  if (n === 0) return ALPHABET[0];

  let result = "";
  let value = n;
  while (value > 0) {
    result = ALPHABET[value % BASE] + result;
    value = Math.floor(value / BASE);
  }
  return result;
}

const SLUG_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;

export function isValidCustomSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}
