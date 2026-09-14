import { NextRequest, NextResponse } from "next/server";
import type { ApplicationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth/session";
import { transitionApplicationStatus, ApplicationNotFoundError } from "@/lib/applicationService";
import { InvalidTransitionError } from "@/lib/statusMachine";

const VALID_STATUSES: ApplicationStatus[] = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "REJECTED"];

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await context.params;
  const applicationId = Number(id);
  if (!Number.isInteger(applicationId)) {
    return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  // Ownership check: a MEMBER may only change the status of their own
  // applications. An ADMIN's elevated access is scoped to read-only
  // cross-user visibility (see /api/admin/applications) — it does not
  // extend to editing other people's data.
  const existing = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!existing || existing.userId !== session.userId) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  try {
    const updated = await transitionApplicationStatus(prisma, applicationId, body.status);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof ApplicationNotFoundError) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal error updating status" }, { status: 500 });
  }
}
