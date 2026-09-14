import { describe, expect, it } from "vitest";
import { isValidCustomSlug, toBase62 } from "../src/lib/shortcode";

describe("toBase62", () => {
  it("encodes 0 as the first alphabet character", () => {
    expect(toBase62(0)).toBe("0");
  });

  it("round-trips small numbers to distinct codes", () => {
    const codes = new Set([1, 2, 61, 62, 63, 1000, 999999].map(toBase62));
    expect(codes.size).toBe(7); // all distinct — no accidental collisions
  });

  it("is deterministic", () => {
    expect(toBase62(123456)).toBe(toBase62(123456));
  });

  it("produces shorter codes than decimal for large numbers", () => {
    const n = 1_000_000_000;
    expect(toBase62(n).length).toBeLessThan(String(n).length);
  });

  it("rejects negative numbers", () => {
    expect(() => toBase62(-1)).toThrow(RangeError);
  });

  it("rejects non-integers", () => {
    expect(() => toBase62(1.5)).toThrow(RangeError);
  });
});

describe("isValidCustomSlug", () => {
  it("accepts alphanumeric slugs with - and _", () => {
    expect(isValidCustomSlug("my-link_1")).toBe(true);
  });

  it("rejects slugs that are too short", () => {
    expect(isValidCustomSlug("ab")).toBe(false);
  });

  it("rejects slugs with spaces or slashes", () => {
    expect(isValidCustomSlug("my link")).toBe(false);
    expect(isValidCustomSlug("a/b")).toBe(false);
  });
});
