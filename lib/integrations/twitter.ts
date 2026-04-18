const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN || "";
const isMock = !TWITTER_BEARER_TOKEN;

interface Tweet {
  id: string;
  text: string;
  author: string;
  createdAt: string;
  metrics: { likes: number; retweets: number; replies: number };
}

export async function searchTweets(query: string, maxResults = 10): Promise<Tweet[]> {
  if (isMock) {
    console.log(`[Twitter/Mock] Searching: ${query}`);
    return [
      {
        id: "mock-1",
        text: `Just found an amazing way to monetize ${query}! Thread:`,
        author: "mockuser",
        createdAt: new Date().toISOString(),
        metrics: { likes: 142, retweets: 38, replies: 12 },
      },
      {
        id: "mock-2",
        text: `${query} is the next big thing for passive income. Here's why...`,
        author: "indiehacker",
        createdAt: new Date().toISOString(),
        metrics: { likes: 89, retweets: 21, replies: 7 },
      },
    ];
  }

  try {
    const url = new URL("https://api.twitter.com/2/tweets/search/recent");
    url.searchParams.set("query", query);
    url.searchParams.set("max_results", String(maxResults));
    url.searchParams.set("tweet.fields", "created_at,public_metrics,author_id");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${TWITTER_BEARER_TOKEN}` },
    });

    if (!res.ok) {
      console.error("[Twitter] Search failed:", await res.text());
      return [];
    }

    const data = await res.json();
    return (data.data || []).map((tweet: Record<string, unknown>) => ({
      id: tweet.id as string,
      text: tweet.text as string,
      author: tweet.author_id as string,
      createdAt: tweet.created_at as string,
      metrics: {
        likes: (tweet.public_metrics as Record<string, number>)?.like_count || 0,
        retweets: (tweet.public_metrics as Record<string, number>)?.retweet_count || 0,
        replies: (tweet.public_metrics as Record<string, number>)?.reply_count || 0,
      },
    }));
  } catch (err) {
    console.error("[Twitter] Error:", err);
    return [];
  }
}

export async function postTweet(text: string): Promise<string | null> {
  if (isMock) {
    console.log(`[Twitter/Mock] Would post: ${text.slice(0, 50)}...`);
    return `mock-tweet-${Date.now()}`;
  }

  // Twitter v2 POST requires OAuth 1.0a user context — not supported with bearer token
  console.log("[Twitter] Posting requires OAuth 1.0a user context");
  return null;
}
