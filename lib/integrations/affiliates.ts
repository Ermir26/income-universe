// Affiliate Revenue Layer — bookmaker partner links, click tracking, revenue estimation
// Sharkline: monetize pick posts with affiliate links

import { type SupabaseClient } from "@supabase/supabase-js";

interface Affiliate {
  id: string;
  bookmaker: string;
  tracking_url: string;
  commission_per_signup: number;
  status: string;
}

interface AffiliateStats {
  bookmaker: string;
  clicks: number;
  estimated_signups: number;
  estimated_revenue: number;
}

// Rotation index — cycles through active affiliates
let rotationIndex = 0;

/**
 * Get the best affiliate link for a sport, rotating between active partners.
 * Prioritizes highest commission first, then rotates.
 */
export async function getAffiliateLink(
  supabase: SupabaseClient,
  sport?: string,
): Promise<{ bookmaker: string; url: string; affiliateId: string } | null> {
  const { data: affiliates } = await supabase
    .from("affiliates")
    .select("*")
    .eq("status", "active")
    .order("commission_per_signup", { ascending: false });

  if (!affiliates || affiliates.length === 0) return null;

  // Filter to affiliates with tracking URLs set
  const active = affiliates.filter((a) => a.tracking_url && a.tracking_url.length > 0);
  if (active.length === 0) return null;

  // Rotate through affiliates
  const affiliate = active[rotationIndex % active.length];
  rotationIndex++;

  return {
    bookmaker: affiliate.bookmaker,
    url: affiliate.tracking_url,
    affiliateId: affiliate.id,
  };
}

/**
 * Track a click on an affiliate link.
 */
export async function trackClick(
  supabase: SupabaseClient,
  affiliateId: string,
  source: string,
): Promise<void> {
  await supabase.from("affiliate_clicks").insert({
    affiliate_id: affiliateId,
    source,
  });
}

/**
 * Get affiliate performance stats.
 */
export async function getAffiliateStats(
  supabase: SupabaseClient,
): Promise<AffiliateStats[]> {
  const { data: affiliates } = await supabase
    .from("affiliates")
    .select("id, bookmaker, commission_per_signup")
    .eq("status", "active");

  if (!affiliates || affiliates.length === 0) return [];

  const stats: AffiliateStats[] = [];

  for (const aff of affiliates) {
    const { count } = await supabase
      .from("affiliate_clicks")
      .select("id", { count: "exact", head: true })
      .eq("affiliate_id", aff.id);

    const clicks = count ?? 0;
    const estimatedSignups = Math.round(clicks * 0.3);
    const estimatedRevenue = estimatedSignups * (aff.commission_per_signup || 0);

    stats.push({
      bookmaker: aff.bookmaker,
      clicks,
      estimated_signups: estimatedSignups,
      estimated_revenue: estimatedRevenue,
    });
  }

  return stats;
}

/**
 * Build affiliate footer for VIP analysis cards.
 * Returns HTML string to append to card, or empty string if no affiliates configured.
 */
export async function buildAffiliateFooter(
  supabase: SupabaseClient,
  sport?: string,
): Promise<string> {
  const link = await getAffiliateLink(supabase, sport);
  if (!link) return "";

  return `\n📌 Best odds at <b>${link.bookmaker}</b>: ${link.url}`;
}

/**
 * Generate weekly "best odds comparison" post with all affiliate links.
 */
export async function buildOddsComparisonPost(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data: affiliates } = await supabase
    .from("affiliates")
    .select("bookmaker, tracking_url")
    .eq("status", "active")
    .not("tracking_url", "eq", "")
    .not("tracking_url", "is", null);

  if (!affiliates || affiliates.length === 0) return null;

  let msg = `📊 <b>Where to Get the Best Odds</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `We compare lines across bookmakers so you don't have to.\n\n`;

  for (const aff of affiliates) {
    msg += `• <b>${aff.bookmaker}</b> → ${aff.tracking_url}\n`;
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `Pro tip: Having accounts at multiple books means better odds on every pick.\n`;
  msg += `🦈 Sharkline — sharkline.ai`;

  return msg;
}
