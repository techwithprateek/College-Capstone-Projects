import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { buildGithubAuthorizeUrl } from "@/lib/auth/github";
import { GITHUB_STATE_COOKIE_NAME } from "@/lib/auth/oauthState";

function getRedirectUri(): string {
  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/auth/github/callback`;
}

export async function GET() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "GITHUB_CLIENT_ID is not configured" }, { status: 500 });
  }

  // A random, unguessable value that must round-trip through GitHub
  // unchanged — proves the callback request actually followed from an
  // authorize request THIS server issued, not a forged callback hit
  // directly by an attacker with a stolen/guessed code.
  const state = randomUUID();
  const authorizeUrl = buildGithubAuthorizeUrl(clientId, getRedirectUri(), state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(GITHUB_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes — the OAuth flow should complete well within this
  });
  return response;
}
