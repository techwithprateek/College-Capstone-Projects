import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exchangeCodeForAccessToken, fetchGithubProfile } from "@/lib/auth/github";
import { GITHUB_STATE_COOKIE_NAME } from "@/lib/auth/oauthState";
import { setSessionCookie } from "@/lib/auth/session";

function getRedirectUri(): string {
  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/auth/github/callback`;
}

export async function GET(request: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "GitHub OAuth is not configured" }, { status: 500 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.cookies.get(GITHUB_STATE_COOKIE_NAME)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.json({ error: "Invalid or missing OAuth state" }, { status: 400 });
  }

  let profile;
  try {
    const accessToken = await exchangeCodeForAccessToken(
      { clientId, clientSecret, code, redirectUri: getRedirectUri() },
    );
    profile = await fetchGithubProfile(accessToken);
  } catch (err) {
    console.error("GitHub OAuth failed:", err);
    return NextResponse.json({ error: "GitHub sign-in failed" }, { status: 502 });
  }

  // Find-or-create: a githubId match wins first; otherwise link to an
  // existing password account with the same (verified) email, so someone
  // who registered with email/password and later clicks "Sign in with
  // GitHub" using the same address gets ONE account, not two.
  let user = await prisma.user.findUnique({ where: { githubId: profile.githubId } });
  if (!user) {
    const existingByEmail = await prisma.user.findUnique({ where: { email: profile.email } });
    if (existingByEmail) {
      user = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: { githubId: profile.githubId },
      });
    } else {
      user = await prisma.user.create({
        data: { email: profile.email, githubId: profile.githubId, name: profile.name },
      });
    }
  }

  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  const response = NextResponse.redirect(`${baseUrl}/dashboard`);
  response.cookies.set(GITHUB_STATE_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  await setSessionCookie(response, { userId: user.id, role: user.role });
  return response;
}
