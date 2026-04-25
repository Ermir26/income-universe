const ADMIN_PASSWORD = process.env.ADMIN_DASHBOARD_PASSWORD ?? "";
const ALGORITHM = { name: "HMAC", hash: "SHA-256" } as const;
const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Validate password strength at import time
if (
  typeof process !== "undefined" &&
  process.env.ADMIN_DASHBOARD_PASSWORD !== undefined &&
  process.env.ADMIN_DASHBOARD_PASSWORD.length < 24
) {
  console.error(
    "[ADMIN AUTH] ADMIN_DASHBOARD_PASSWORD must be at least 24 characters. Current length:",
    process.env.ADMIN_DASHBOARD_PASSWORD.length,
  );
}

export function validatePasswordStrength(): { ok: boolean; error?: string } {
  const pw = process.env.ADMIN_DASHBOARD_PASSWORD;
  if (!pw) return { ok: false, error: "ADMIN_DASHBOARD_PASSWORD is not set" };
  if (pw.length < 24)
    return {
      ok: false,
      error: `ADMIN_DASHBOARD_PASSWORD must be at least 24 characters (currently ${pw.length})`,
    };
  return { ok: true };
}

async function getSigningKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(ADMIN_PASSWORD + "_admin_signing_key");
  return crypto.subtle.importKey("raw", keyMaterial, ALGORITHM, false, [
    "sign",
    "verify",
  ]);
}

export async function createSessionToken(): Promise<string> {
  const key = await getSigningKey();
  const payload = JSON.stringify({
    role: "admin",
    iat: Date.now(),
  });
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    ALGORITHM.name,
    key,
    encoder.encode(payload),
  );
  const sigHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const payloadB64 = btoa(payload);
  return `${payloadB64}.${sigHex}`;
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    if (!ADMIN_PASSWORD) return false;
    const [payloadB64, sigHex] = token.split(".");
    if (!payloadB64 || !sigHex) return false;

    const payload = atob(payloadB64);
    const parsed = JSON.parse(payload);
    if (parsed.role !== "admin") return false;

    // 24-hour expiry
    const age = Date.now() - (parsed.iat ?? 0);
    if (age > TOKEN_MAX_AGE_MS) return false;

    const key = await getSigningKey();
    const encoder = new TextEncoder();
    const sigBytes = new Uint8Array(
      sigHex.match(/.{2}/g)!.map((h: string) => parseInt(h, 16)),
    );
    return crypto.subtle.verify(
      ALGORITHM.name,
      key,
      sigBytes,
      encoder.encode(payload),
    );
  } catch {
    return false;
  }
}

// ── Rate limiter (in-memory, per-process) ──

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000; // 1 minute

export function checkRateLimit(ip: string): { allowed: boolean } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  entry.count++;
  if (entry.count > MAX_ATTEMPTS) {
    return { allowed: false };
  }
  return { allowed: true };
}
