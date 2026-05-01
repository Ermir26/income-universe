import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/dashboard/:path*"],
};

const BASIC_AUTH_USER = process.env.DASHBOARD_BASIC_AUTH_USER ?? "admin";
const BASIC_AUTH_PASS =
  process.env.DASHBOARD_BASIC_AUTH_PASS ??
  process.env.ADMIN_DASHBOARD_PASSWORD ??
  "";

function checkBasicAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get("authorization");

  if (!BASIC_AUTH_PASS) {
    // No password configured — skip Basic Auth (dev fallback)
    return null;
  }

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Sharkline Admin"' },
    });
  }

  try {
    const decoded = atob(authHeader.slice(6));
    const [user, ...passParts] = decoded.split(":");
    const pass = passParts.join(":"); // password may contain colons

    if (user === BASIC_AUTH_USER && pass === BASIC_AUTH_PASS) {
      return null; // auth passed
    }
  } catch {
    // malformed base64
  }

  return new NextResponse("Invalid credentials", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Sharkline Admin"' },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip Basic Auth for login/logout endpoints (they issue/clear session cookies)
  if (
    pathname === "/dashboard/login" ||
    pathname === "/api/dashboard/login" ||
    pathname === "/api/dashboard/logout"
  ) {
    return NextResponse.next();
  }

  // Basic Auth gate — browser prompts natively
  const basicAuthResponse = checkBasicAuth(request);
  if (basicAuthResponse) {
    return basicAuthResponse;
  }

  // Session cookie check (existing machinery)
  const sessionCookie = request.cookies.get("admin_session");
  if (!sessionCookie?.value) {
    return NextResponse.redirect(new URL("/dashboard/login", request.url));
  }

  const valid = await verifyTokenInMiddleware(sessionCookie.value);
  if (!valid) {
    const response = NextResponse.redirect(
      new URL("/dashboard/login", request.url),
    );
    response.cookies.delete("admin_session");
    return response;
  }

  return NextResponse.next();
}

async function verifyTokenInMiddleware(token: string): Promise<boolean> {
  try {
    const secret =
      process.env.ADMIN_DASHBOARD_PASSWORD ?? "dev-signing-secret-local-only";

    const [payloadB64, sigHex] = token.split(".");
    if (!payloadB64 || !sigHex) return false;

    const payload = atob(payloadB64);
    const parsed = JSON.parse(payload);
    if (parsed.role !== "admin") return false;

    // 24-hour expiry
    const age = Date.now() - (parsed.iat ?? 0);
    if (age > 24 * 60 * 60 * 1000) return false;

    const algorithm = { name: "HMAC", hash: "SHA-256" } as const;
    const encoder = new TextEncoder();
    const keyMaterial = encoder.encode(secret + "_admin_signing_key");
    const key = await crypto.subtle.importKey(
      "raw",
      keyMaterial,
      algorithm,
      false,
      ["verify"],
    );
    const sigBytes = new Uint8Array(
      sigHex.match(/.{2}/g)!.map((h: string) => parseInt(h, 16)),
    );
    return crypto.subtle.verify(
      algorithm.name,
      key,
      sigBytes,
      encoder.encode(payload),
    );
  } catch {
    return false;
  }
}
