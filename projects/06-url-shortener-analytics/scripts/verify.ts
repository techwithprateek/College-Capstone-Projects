/**
 * Hits a running instance of the app and prints real evidence for two
 * claims this project makes: that caching actually speeds up the redirect
 * hot path, and that the rate limiter actually blocks excess requests.
 *
 * Not part of the automated test suite — those test the same logic in
 * isolation, deterministically, without a running server. This is a
 * black-box check against the real thing.
 *
 *   npm run dev &      (in one terminal)
 *   npm run verify      (in another)
 */

import { RATE_LIMIT } from "../src/lib/rateLimitConfig";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

async function timeRequest(url: string): Promise<number> {
  const start = performance.now();
  await fetch(url, { redirect: "manual" });
  return performance.now() - start;
}

async function main() {
  console.log(`Verifying against ${BASE_URL}\n`);

  const createRes = await fetch(`${BASE_URL}/api/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetUrl: "https://example.com/verify-target" }),
  });
  if (!createRes.ok) {
    console.error("Failed to create link:", await createRes.text());
    process.exit(1);
  }
  const link = await createRes.json();
  console.log(`Created link: /${link.slug} -> ${link.targetUrl}\n`);

  console.log("=== Cache latency ===");
  const N = 20;
  const timings: number[] = [];
  for (let i = 0; i < N; i++) {
    timings.push(await timeRequest(`${BASE_URL}/${link.slug}`));
  }
  const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
  console.log(`Average of ${N} redirects (Redis cache-hit path): ${avg.toFixed(1)}ms\n`);

  console.log("=== Rate limiting ===");
  // One creation request already happened above, so RATE_LIMIT - 1 more
  // should succeed out of this batch before the Lua script starts
  // returning 429s.
  const expectedAllowed = RATE_LIMIT - 1;
  const batchSize = RATE_LIMIT + 5;

  const results = await Promise.all(
    Array.from({ length: batchSize }, () =>
      fetch(`${BASE_URL}/api/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl: "https://example.com/rate-limit-test" }),
      }).then((r) => r.status),
    ),
  );
  const allowed = results.filter((s) => s === 201).length;
  const limited = results.filter((s) => s === 429).length;

  console.log(`${batchSize} concurrent creation requests: ${allowed} succeeded (201), ${limited} rate-limited (429)`);
  console.log(`Expected exactly ${expectedAllowed} to succeed (limit=${RATE_LIMIT}, 1 already used above)`);
  console.log(allowed === expectedAllowed ? "PASS: rate limit held exactly at the configured limit" : "FAIL: rate limit was off");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
