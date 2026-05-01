import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSessionToken } from "@/lib/admin/auth";

export async function POST() {
  try {
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
