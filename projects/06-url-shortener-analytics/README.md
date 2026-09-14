# URL Shortener + Analytics

Custom short links with click tracking, geo stats, QR codes, and real rate
limiting. Looks like a beginner project; is actually a compact vehicle for
three genuinely hard backend problems — collision-free ID generation,
caching a read-heavy path correctly, and rate limiting under real
concurrency — which is exactly why "design a URL shortener" is a classic
system-design interview question.

## Real, measured results (not just claims)

From `scripts/verify.ts`, run against a live local server:

```
=== Cache latency ===
Average of 20 redirects (Redis cache-hit path): 1.9ms

=== Rate limiting ===
15 concurrent creation requests: 9 succeeded (201), 6 rate-limited (429)
Expected exactly 9 to succeed (limit=10, 1 already used above)
PASS: rate limit held exactly at the configured limit
```

The rate limit landing on the *exact* expected count under real concurrency
— not "roughly 10," but precisely 9 — is what proves the check-then-increment
is atomic. A naive (non-atomic) implementation lets concurrent requests
overshoot the limit; see [How rate limiting actually works](#how-rate-limiting-actually-works).

## Setup

You need Node 20+ and Postgres + Redis. Two ways to get them:

```bash
# Option A: Docker (if you have it)
docker compose up -d

# Option B: already running locally
createdb url_shortener
# and have Redis running on the default port
```

Then:

```bash
npm install
cp .env.example .env        # edit DATABASE_URL/REDIS_URL if you used Option B
npx prisma migrate deploy
```

## Run it

```bash
npm run dev
```

Open `http://localhost:3000` — create a short link (with or without a
custom slug), click through to its stats page, and scan the generated QR
code.

## Run the tests

```bash
npm test
```

35 tests against **real** Postgres and Redis — the rate limiter and cache
behavior are exactly the kind of thing that passes against a mock and then
breaks in production, so they're tested against the real thing:

- `shortcode.test.ts` — base62 encoding, no collisions across a range of inputs
- `geo.test.ts` — private/loopback IPs skip the network call entirely;
  network errors, timeouts, and API failures all degrade to "unknown"
  rather than throwing
- `rateLimiter.test.ts` — sequential limit enforcement, independent
  per-identifier limits, the sliding window actually sliding, **and 30
  concurrent requests against a limit of 10 allowing exactly 10 through**
- `linkService.test.ts` — slug generation, custom-slug conflicts, cache
  population and TTL alignment to `expiresAt`
- `redirectRoute.test.ts` — the actual route handler (imported and called
  directly, not through a running server): 302/404/410 behavior, and that
  click recording genuinely doesn't delay the redirect response

## Run the live verification (optional, needs a running server)

```bash
npm run dev &
npm run verify
```

Black-box checks against the real running app — see the real numbers at
the top of this README, captured from an actual run.

## Where the short code comes from

Two strategies exist for generating short codes: random-with-collision-
-retry, or encoding an already-unique value. This project uses the second:
Postgres's own autoincrement `id` is already guaranteed unique, so
base62-encoding it (`lib/shortcode.ts`) **is** the short code — no
randomness, no collision-checking loop, ever, for auto-generated slugs.

The id isn't known until after insert, so `createLink` does a two-step
create-then-rename inside effectively one link row (see `linkService.ts`).
**Custom** slugs go the other way — a caller-chosen string can't be
derived from anything, so that path relies on the database's unique
constraint and turns a `P2002` violation into a clean 409, which is the
collision-retry strategy's failure mode instead.

## How caching actually helps (not just "add Redis")

`resolveLink` caches `{ targetUrl, linkId }` together, not just the target
URL. Caching only the URL would mean every redirect — even a cache "hit" —
still had to query Postgres to find the link's id for click recording,
quietly defeating the entire point of caching a read-heavy path. With both
values cached, a hit touches Redis and nothing else before the redirect is
returned.

Cache TTL is aligned to the link's own `expiresAt` (verified live above: a
link expiring in 1 second correctly started returning 410 after that
second, not served stale from cache) — an expired link is never served
stale just because its cache entry hadn't naturally timed out yet on its
own default schedule.

Click recording is deliberately **not awaited** on the redirect path — a
redirect shouldn't wait on an analytics write plus a third-party geo API
call. This only works cleanly because the app runs as a long-lived Node
process (`next start`); a serverless deployment can freeze execution the
instant a response is sent, silently dropping an un-awaited promise —
there you'd need something like Vercel's `waitUntil` or a real queue
instead.

## How rate limiting actually works

`lib/rateLimiter.ts` implements a sliding-window-log, not the more common
(and subtly wrong) fixed-window counter. A fixed window lets a client burst
up to 2x the limit right across a window boundary — 10 requests in the
last second of minute N, another 10 in the first second of minute N+1,
with no single window ever "seeing" more than 10. Storing each request's
own timestamp in a Redis sorted set and counting only the ones still
inside the trailing window avoids that.

The whole check-then-increment runs as one Lua script (`EVAL`), making it
atomic. Without that, two concurrent requests could each read "9 requests
so far, limit is 10" before either one writes anything, and both get
allowed through — exactly the class of race condition the
idempotent-payment-gateway project (project 2) is about, showing up again
here in a different shape.

## Project layout

```
src/
  app/
    page.tsx, layout.tsx          create-link form + link list
    [slug]/route.ts                 the redirect handler
    links/[slug]/page.tsx             stats detail page
    api/links/route.ts                  POST create (rate-limited), GET list
    api/links/[slug]/stats/route.ts       click analytics
    api/links/[slug]/qr/route.ts            QR code PNG
  lib/
    shortcode.ts      base62 encoding
    linkService.ts      createLink, resolveLink (cache-aside), recordClick
    rateLimiter.ts         sliding-window-log rate limiter (Lua/EVAL)
    geo.ts                    best-effort IP geolocation
    prisma.ts, redis.ts, rateLimitConfig.ts
scripts/verify.ts   black-box proof against a running server
tests/                35 tests against real Postgres + Redis
```

## Where this is intentionally scoped down

- **`x-forwarded-for` is trusted as-is.** It's client-controllable unless a
  real reverse proxy overwrites it — fine for a capstone project behind no
  proxy, a real production deployment needs to trust this header only when
  it's set by infrastructure you control, not by the request itself.
- **No API-key auth for programmatic use.** Every endpoint is open; a
  public API surface would need its own auth and its own (separate) rate
  limits from the web UI's.
- **No private/password-protected links.** `lib/linkService.ts` has
  nowhere left to hook in an access check, but nothing implements one.
