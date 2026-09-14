import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type Redis from "ioredis";
import { lookupGeo } from "./geo";
import { toBase62 } from "./shortcode";

const DEFAULT_CACHE_TTL_SECONDS = 3600;

export class SlugTakenError extends Error {
  constructor(slug: string) {
    super(`Slug "${slug}" is already taken`);
    this.name = "SlugTakenError";
  }
}

interface CachedLink {
  targetUrl: string;
  linkId: number;
}

function cacheKey(slug: string): string {
  return `link:${slug}`;
}

/**
 * Caches BOTH the redirect target and the link's id — not just the target
 * URL. Click recording needs the id as a foreign key, and caching only the
 * target would mean a cache "hit" still had to hit Postgres to look the id
 * up, quietly defeating the point of caching a read-heavy path at all.
 *
 * TTL is aligned to the link's own expiration (if any) so an expired link
 * can never be served stale from cache after Postgres would already say
 * "gone" — the cache entry disappears at the same moment the link does.
 */
async function cacheLink(redis: Redis, slug: string, value: CachedLink, expiresAt: Date | null): Promise<void> {
  const ttlSeconds = expiresAt
    ? Math.floor((expiresAt.getTime() - Date.now()) / 1000)
    : DEFAULT_CACHE_TTL_SECONDS;
  if (ttlSeconds <= 0) return; // already expired — don't cache a dead link
  await redis.set(cacheKey(slug), JSON.stringify(value), "EX", ttlSeconds);
}

export interface CreateLinkInput {
  targetUrl: string;
  customSlug?: string;
  expiresAt?: Date;
}

export async function createLink(prisma: PrismaClient, redis: Redis, input: CreateLinkInput) {
  let link;

  if (input.customSlug) {
    try {
      link = await prisma.link.create({
        data: { targetUrl: input.targetUrl, slug: input.customSlug, expiresAt: input.expiresAt ?? null },
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new SlugTakenError(input.customSlug);
      }
      throw err;
    }
  } else {
    // The autoincrement id is only known after insert, so: create with a
    // guaranteed-unique placeholder, then rename to the id's base62 form.
    // See shortcode.ts for why this needs no collision retry loop at all.
    const placeholder = `_tmp_${randomUUID()}`;
    const created = await prisma.link.create({
      data: { targetUrl: input.targetUrl, slug: placeholder, expiresAt: input.expiresAt ?? null },
    });
    link = await prisma.link.update({
      where: { id: created.id },
      data: { slug: toBase62(created.id) },
    });
  }

  await cacheLink(redis, link.slug, { targetUrl: link.targetUrl, linkId: link.id }, link.expiresAt);
  return link;
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

export type ResolveResult =
  | { status: "found"; targetUrl: string; linkId: number; fromCache: boolean }
  | { status: "not_found" }
  | { status: "expired" };

export async function resolveLink(prisma: PrismaClient, redis: Redis, slug: string): Promise<ResolveResult> {
  const cached = await redis.get(cacheKey(slug));
  if (cached) {
    const parsed = JSON.parse(cached) as CachedLink;
    return { status: "found", targetUrl: parsed.targetUrl, linkId: parsed.linkId, fromCache: true };
  }

  const link = await prisma.link.findUnique({ where: { slug } });
  if (!link) return { status: "not_found" };

  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
    return { status: "expired" };
  }

  await cacheLink(redis, link.slug, { targetUrl: link.targetUrl, linkId: link.id }, link.expiresAt);
  return { status: "found", targetUrl: link.targetUrl, linkId: link.id, fromCache: false };
}

/**
 * Deliberately NOT awaited by callers on the redirect hot path — a
 * redirect should return the instant the target URL is known, not wait on
 * an analytics write plus a third-party geo API call. See the README for
 * what changes about this in a serverless deployment (you'd need
 * `waitUntil` or a queue instead of a bare fire-and-forget promise, since
 * a serverless function can be frozen the instant it returns a response).
 */
export async function recordClick(
  prisma: PrismaClient,
  linkId: number,
  meta: { referrer: string | null; ip: string | null },
): Promise<void> {
  const geo = meta.ip ? await lookupGeo(meta.ip) : { country: null, city: null };
  await prisma.click.create({
    data: {
      linkId,
      referrer: meta.referrer,
      ip: meta.ip,
      country: geo.country,
      city: geo.city,
    },
  });
}
