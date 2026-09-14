import { SignJWT, jwtVerify } from "jose";

/**
 * Session tokens, signed with HS256 using a server-only secret. Built
 * directly on `jose` rather than a full auth framework — the point of this
 * project is to actually understand what a JWT session is doing, not to
 * configure a library that does it invisibly.
 */

export interface SessionPayload {
  userId: number;
  role: "MEMBER" | "ADMIN";
}

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ userId: payload.userId, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.userId !== "number" || typeof payload.role !== "string") {
      return null;
    }
    return { userId: payload.userId, role: payload.role as SessionPayload["role"] };
  } catch {
    // Expired, malformed, or signed with a different secret — all treated
    // the same way: no valid session.
    return null;
  }
}
