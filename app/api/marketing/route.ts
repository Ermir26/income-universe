import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function GET() {
  if (!SUPABASE_URL) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Get today's unposted marketing content
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: posts, error } = await supabase
    .from("marketing_posts")
    .select("id, platform, content, based_on_record, created_at")
    .eq("posted", false)
    .gte("created_at", today.toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by platform for easy copy-paste
  const grouped: Record<string, Array<{ id: string; content: string; created_at: string }>> = {};
  for (const post of posts || []) {
    if (!grouped[post.platform]) grouped[post.platform] = [];
    grouped[post.platform].push({
      id: post.id,
      content: post.content,
      created_at: post.created_at,
    });
  }

  return NextResponse.json({
    date: today.toISOString().split("T")[0],
    total: posts?.length || 0,
    posts: grouped,
  });
}
