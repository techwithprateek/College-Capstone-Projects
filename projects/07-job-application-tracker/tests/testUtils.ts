import { NextRequest } from "next/server";
import { signSessionToken, type SessionPayload } from "../src/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/session";

export async function makeAuthenticatedRequest(
  url: string,
  session: SessionPayload,
  init: { method?: string; body?: unknown } = {},
): Promise<NextRequest> {
  const token = await signSessionToken(session);
  return new NextRequest(url, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

export function makeRequest(url: string, init: { method?: string; body?: unknown } = {}): NextRequest {
  return new NextRequest(url, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}
