import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }
  if (body.password.length < 8) {
    return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(body.password);
  const user = await prisma.user.create({
    data: { email: body.email, passwordHash, name: body.name ?? null },
  });

  const response = NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role }, { status: 201 });
  await setSessionCookie(response, { userId: user.id, role: user.role });
  return response;
}
