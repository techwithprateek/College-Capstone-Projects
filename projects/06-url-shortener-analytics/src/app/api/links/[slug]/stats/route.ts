import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;

  const link = await prisma.link.findUnique({ where: { slug } });
  if (!link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  const clicks = await prisma.click.findMany({ where: { linkId: link.id } });

  const byReferrer: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  for (const click of clicks) {
    const referrer = click.referrer ?? "(direct)";
    const country = click.country ?? "Unknown";
    byReferrer[referrer] = (byReferrer[referrer] ?? 0) + 1;
    byCountry[country] = (byCountry[country] ?? 0) + 1;
  }

  return NextResponse.json({
    slug: link.slug,
    targetUrl: link.targetUrl,
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    totalClicks: clicks.length,
    byReferrer,
    byCountry,
    recentClicks: clicks
      .slice()
      .sort((a, b) => b.clickedAt.getTime() - a.clickedAt.getTime())
      .slice(0, 20)
      .map((c) => ({ clickedAt: c.clickedAt, referrer: c.referrer, country: c.country, city: c.city })),
  });
}
