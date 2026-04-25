import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSessionToken } from "@/lib/admin/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { password } = body as { password?: string };

    const adminPassword = process.env.ADMIN_DASHBOARD_PASSWORD;
    if (!adminPassword) {
      return NextResponse.json(
        { error: "Admin auth not configured" },
        { status: 500 },
      );
    }

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
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
