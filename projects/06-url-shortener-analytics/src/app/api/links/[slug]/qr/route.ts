import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;

  const link = await prisma.link.findUnique({ where: { slug } });
  if (!link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  const baseUrl = process.env.BASE_URL ?? new URL(request.url).origin;
  const shortUrl = `${baseUrl}/${slug}`;
  const png = await QRCode.toBuffer(shortUrl, { type: "png", width: 300 });

  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
