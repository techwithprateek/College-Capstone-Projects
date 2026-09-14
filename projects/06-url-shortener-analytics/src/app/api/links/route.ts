import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { checkRateLimit } from "@/lib/rateLimiter";
import { createLink, SlugTakenError } from "@/lib/linkService";
import { isValidCustomSlug } from "@/lib/shortcode";
import { RATE_LIMIT, RATE_LIMIT_WINDOW_MS } from "@/lib/rateLimitConfig";

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "127.0.0.1";
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { allowed } = await checkRateLimit(getRedis(), ip, RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded: max ${RATE_LIMIT} link creations per minute` },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.targetUrl !== "string") {
    return NextResponse.json({ error: "targetUrl (string) is required" }, { status: 400 });
  }

  try {
    new URL(body.targetUrl);
  } catch {
    return NextResponse.json({ error: "targetUrl must be a valid absolute URL" }, { status: 400 });
  }

  if (body.customSlug !== undefined) {
    if (typeof body.customSlug !== "string" || !isValidCustomSlug(body.customSlug)) {
      return NextResponse.json(
        { error: "customSlug must be 3-32 characters: letters, numbers, - or _" },
        { status: 400 },
      );
    }
  }

  let expiresAt: Date | undefined;
  if (body.expiresAt !== undefined) {
    expiresAt = new Date(body.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      return NextResponse.json({ error: "expiresAt must be a valid date" }, { status: 400 });
    }
  }

  try {
    const link = await createLink(prisma, getRedis(), {
      targetUrl: body.targetUrl,
      customSlug: body.customSlug,
      expiresAt,
    });
    return NextResponse.json(link, { status: 201 });
  } catch (err) {
    if (err instanceof SlugTakenError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal error creating link" }, { status: 500 });
  }
}

export async function GET() {
  const links = await prisma.link.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { clicks: true } } },
  });
  return NextResponse.json(links);
}
