const ETSY_API_KEY = process.env.ETSY_API_KEY || "";
const isMock = !ETSY_API_KEY;

interface EtsyListing {
  title: string;
  description: string;
  price: number;
  tags: string[];
  category: string;
}

interface EtsyTrend {
  keyword: string;
  volume: string;
  competition: string;
}

export async function searchTrends(query: string): Promise<EtsyTrend[]> {
  if (isMock) {
    console.log(`[Etsy/Mock] Searching trends: ${query}`);
    return [
      { keyword: `${query} planner`, volume: "high", competition: "medium" },
      { keyword: `${query} template`, volume: "medium", competition: "low" },
      { keyword: `${query} printable`, volume: "high", competition: "high" },
    ];
  }

  try {
    const res = await fetch(
      `https://openapi.etsy.com/v3/application/listings/active?keywords=${encodeURIComponent(query)}&limit=10`,
      { headers: { "x-api-key": ETSY_API_KEY } }
    );

    if (!res.ok) {
      console.error("[Etsy] Search failed:", await res.text());
      return [];
    }

    const data = await res.json();
    // Extract trend insights from listing data
    const keywords = new Map<string, number>();
    for (const listing of data.results || []) {
      for (const tag of listing.tags || []) {
        keywords.set(tag, (keywords.get(tag) || 0) + 1);
      }
    }

    return Array.from(keywords.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword, count]) => ({
        keyword,
        volume: count > 5 ? "high" : count > 2 ? "medium" : "low",
        competition: "medium",
      }));
  } catch (err) {
    console.error("[Etsy] Error:", err);
    return [];
  }
}

export async function createListing(listing: EtsyListing): Promise<string | null> {
  if (isMock) {
    console.log(`[Etsy/Mock] Created listing: ${listing.title} ($${listing.price})`);
    return `mock-listing-${Date.now()}`;
  }

  // Etsy v3 API requires OAuth 2.0 — this would need a full OAuth flow
  console.log(`[Etsy] Would create listing: ${listing.title}`);
  return null;
}

export async function getShopStats(): Promise<{
  totalListings: number;
  totalSales: number;
  revenue: number;
}> {
  if (isMock) {
    return { totalListings: 0, totalSales: 0, revenue: 0 };
  }

  // Would require shop_id and OAuth token
  return { totalListings: 0, totalSales: 0, revenue: 0 };
}
