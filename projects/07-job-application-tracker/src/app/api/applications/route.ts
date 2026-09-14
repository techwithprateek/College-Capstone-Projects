import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth/session";
import { createApplication } from "@/lib/applicationService";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const applications = await prisma.application.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(applications);
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.company !== "string" || typeof body.role !== "string") {
    return NextResponse.json({ error: "company and role are required" }, { status: 400 });
  }

  const application = await createApplication(prisma, {
    userId: session.userId,
    company: body.company,
    role: body.role,
    notes: typeof body.notes === "string" ? body.notes : undefined,
  });
  return NextResponse.json(application, { status: 201 });
}
