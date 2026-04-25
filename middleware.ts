import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/dashboard/:path*"],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page through
  if (pathname === "/dashboard/login") {
    return NextResponse.next();
  }

  // Allow dashboard API login/logout endpoints through (they handle their own auth)
  if (
    pathname === "/api/dashboard/login" ||
    pathname === "/api/dashboard/logout"
  ) {
    return NextResponse.next();
  }

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
    const password = process.env.ADMIN_DASHBOARD_PASSWORD ?? "";
    if (!password) return false;

    const [payloadB64, sigHex] = token.split(".");
    if (!payloadB64 || !sigHex) return false;

    const payload = atob(payloadB64);
    const parsed = JSON.parse(payload);
    if (parsed.role !== "admin") return false;

    // 24-hour expiry (matches auth.ts)
    const age = Date.now() - (parsed.iat ?? 0);
    if (age > 24 * 60 * 60 * 1000) return false;

    const algorithm = { name: "HMAC", hash: "SHA-256" } as const;
    const encoder = new TextEncoder();
    const keyMaterial = encoder.encode(password + "_admin_signing_key");
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
