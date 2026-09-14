import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { resolveLink, recordClick } from "@/lib/linkService";

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || null;
}

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const result = await resolveLink(prisma, getRedis(), slug);

  if (result.status === "not_found") {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }
  if (result.status === "expired") {
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  }

  // Fire-and-forget: the redirect must not wait on an analytics write or a
  // third-party geo lookup. This works because this app runs as a
  // long-lived Node process (`next start`), which keeps executing after
  // the response is sent. On a serverless platform, the process can be
  // frozen the instant the response goes out, silently dropping this —
  // there you'd reach for something like Vercel's `waitUntil` API or push
  // the click onto a queue instead of awaiting it inline like this.
  recordClick(prisma, result.linkId, {
    referrer: request.headers.get("referer"),
    ip: getClientIp(request),
  }).catch((err) => console.error("Failed to record click:", err));

  return NextResponse.redirect(result.targetUrl, { status: 302 });
}
