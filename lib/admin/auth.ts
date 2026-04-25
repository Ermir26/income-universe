const ADMIN_PASSWORD = process.env.ADMIN_DASHBOARD_PASSWORD ?? "";
const ALGORITHM = { name: "HMAC", hash: "SHA-256" } as const;

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
  // token = base64(payload).sigHex
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

    // Reject tokens older than 7 days
    const age = Date.now() - (parsed.iat ?? 0);
    if (age > 7 * 24 * 60 * 60 * 1000) return false;

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
