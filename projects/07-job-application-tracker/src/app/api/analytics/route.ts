import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth/session";
import { computeAnalytics } from "@/lib/analytics";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const applications = await prisma.application.findMany({
    where: { userId: session.userId },
    select: { status: true, statusHistory: { select: { toStatus: true } } },
  });

  return NextResponse.json(computeAnalytics(applications));
}
