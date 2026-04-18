import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

// POST — mark a pick as followed/unfollowed
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: followerId } = await params;
    const body = await request.json();
    const pickId = body.pick_id;
    const followed = body.followed !== false;

    if (!pickId) {
      return NextResponse.json({ error: "pick_id required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("follower_picks")
      .upsert(
        { follower_id: followerId, pick_id: pickId, followed },
        { onConflict: "follower_id,pick_id" },
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, followed });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
