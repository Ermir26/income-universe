import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createSessionToken,
  validatePasswordStrength,
  checkRateLimit,
} from "@/lib/admin/auth";

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const { allowed } = checkRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again in 1 minute." },
        { status: 429 },
      );
    }

    // Validate password strength
    const strength = validatePasswordStrength();
    if (!strength.ok) {
      return NextResponse.json(
        { error: "Admin auth not configured properly" },
        { status: 500 },
      );
    }

    const body = await request.json();
    const { password } = body as { password?: string };

    const adminPassword = process.env.ADMIN_DASHBOARD_PASSWORD;
    if (!password || password !== adminPassword) {
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 },
      );
    }

    const token = await createSessionToken();
    const cookieStore = await cookies();
    cookieStore.set("admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 24 * 60 * 60, // 24 hours
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
