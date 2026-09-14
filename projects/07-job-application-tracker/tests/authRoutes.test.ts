import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "../src/app/api/auth/register/route";
import { POST as login } from "../src/app/api/auth/login/route";
import { POST as logout } from "../src/app/api/auth/logout/route";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/session";
import { makeRequest } from "./testUtils";

const prisma = new PrismaClient();

beforeAll(() => {
  process.env.JWT_SECRET ??= "test-secret-do-not-use-in-production";
});

beforeEach(async () => {
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/auth/register", () => {
  it("creates a user, hashes the password, and sets a session cookie", async () => {
    const res = await register(
      makeRequest("http://localhost/api/auth/register", {
        method: "POST",
        body: { email: "alice@example.com", password: "hunter22222" },
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe("alice@example.com");
    expect(body).not.toHaveProperty("passwordHash");
    expect(res.cookies.get(SESSION_COOKIE_NAME)).toBeDefined();

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "alice@example.com" } });
    expect(user.passwordHash).not.toBe("hunter22222"); // never stored in plain text
  });

  it("rejects a duplicate email", async () => {
    await register(
      makeRequest("http://localhost/api/auth/register", {
        method: "POST",
        body: { email: "bob@example.com", password: "hunter22222" },
      }),
    );

    const res = await register(
      makeRequest("http://localhost/api/auth/register", {
        method: "POST",
        body: { email: "bob@example.com", password: "different123" },
      }),
    );

    expect(res.status).toBe(409);
  });

  it("rejects a too-short password", async () => {
    const res = await register(
      makeRequest("http://localhost/api/auth/register", {
        method: "POST",
        body: { email: "carol@example.com", password: "short" },
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await register(
      makeRequest("http://localhost/api/auth/register", {
        method: "POST",
        body: { email: "dave@example.com", password: "correct-password" },
      }),
    );
  });

  it("logs in with correct credentials", async () => {
    const res = await login(
      makeRequest("http://localhost/api/auth/login", {
        method: "POST",
        body: { email: "dave@example.com", password: "correct-password" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.cookies.get(SESSION_COOKIE_NAME)).toBeDefined();
  });

  it("rejects an incorrect password with 401", async () => {
    const res = await login(
      makeRequest("http://localhost/api/auth/login", {
        method: "POST",
        body: { email: "dave@example.com", password: "wrong-password" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a nonexistent email with the SAME error as a wrong password (no user enumeration)", async () => {
    const res = await login(
      makeRequest("http://localhost/api/auth/login", {
        method: "POST",
        body: { email: "nobody@example.com", password: "whatever123" },
      }),
    );
    const wrongPasswordRes = await login(
      makeRequest("http://localhost/api/auth/login", {
        method: "POST",
        body: { email: "dave@example.com", password: "wrong-password" },
      }),
    );

    expect(res.status).toBe(wrongPasswordRes.status);
    expect(await res.json()).toEqual(await wrongPasswordRes.json());
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie", async () => {
    const res = await logout();
    const cookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie?.value).toBe("");
  });
});
