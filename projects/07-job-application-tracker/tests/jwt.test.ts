import { beforeAll, describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "../src/lib/auth/jwt";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
});

describe("session JWTs", () => {
  it("round-trips a signed token back to the original payload", async () => {
    const token = await signSessionToken({ userId: 42, role: "MEMBER" });
    const payload = await verifySessionToken(token);

    expect(payload).toEqual({ userId: 42, role: "MEMBER" });
  });

  it("rejects a malformed token", async () => {
    const payload = await verifySessionToken("not-a-real-jwt");
    expect(payload).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSessionToken({ userId: 1, role: "ADMIN" });

    process.env.JWT_SECRET = "a-completely-different-secret";
    const payload = await verifySessionToken(token);
    process.env.JWT_SECRET = "test-secret-do-not-use-in-production";

    expect(payload).toBeNull();
  });

  it("throws when signing without JWT_SECRET configured", async () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    await expect(signSessionToken({ userId: 1, role: "MEMBER" })).rejects.toThrow();

    process.env.JWT_SECRET = original;
  });
});
