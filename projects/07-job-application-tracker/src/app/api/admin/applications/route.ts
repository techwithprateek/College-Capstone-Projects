import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth/session";

/**
 * The one genuinely role-gated capability in this project: an ADMIN can
 * see every user's applications (e.g. for a team-wide view of who's
 * applying where); a MEMBER gets a 403, not a filtered/empty result — the
 * distinction matters, since a filtered response can leak the existence
 * of an admin-only feature while a 403 is an honest "you can't do this."
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const applications = await prisma.application.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  return NextResponse.json(applications);
}
