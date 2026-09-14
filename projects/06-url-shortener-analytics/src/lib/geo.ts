/**
 * Best-effort IP geolocation for click analytics. "Best-effort" is load-
 * bearing here: geo enrichment must never be allowed to break click
 * recording. A third-party API being slow, rate-limited, or down is
 * expected to happen eventually — the click still gets recorded, just
 * without a country/city.
 *
 * Uses ip-api.com's free, no-API-key JSON endpoint (rate-limited to 45
 * req/min on the free tier — fine for a capstone project, not for
 * production traffic).
 */

export interface GeoResult {
  country: string | null;
  city: string | null;
}

const UNKNOWN: GeoResult = { country: null, city: null };

function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip) return true;
  const normalized = ip.replace(/^::ffff:/, "");
  return (
    normalized === "::1" ||
    normalized === "127.0.0.1" ||
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
  );
}

export async function lookupGeo(ip: string, fetchImpl: typeof fetch = fetch): Promise<GeoResult> {
  if (isPrivateOrLocalIp(ip)) {
    return UNKNOWN;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetchImpl(`http://ip-api.com/json/${ip}?fields=status,country,city`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return UNKNOWN;
    const data = await res.json();
    if (data.status !== "success") return UNKNOWN;

    return { country: data.country ?? null, city: data.city ?? null };
  } catch {
    // Network error, timeout, rate limit, malformed response — any failure
    // here degrades to "unknown location", never throws.
    return UNKNOWN;
  }
}
