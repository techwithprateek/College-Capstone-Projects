import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: body.email } });
  // Same error for "no such user" and "wrong password" — a different
  // message for each would let a caller enumerate which emails have
  // accounts.
  const invalidCredentials = () => NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  if (!user || !user.passwordHash) return invalidCredentials();

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) return invalidCredentials();

  const response = NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  await setSessionCookie(response, { userId: user.id, role: user.role });
  return response;
}
