const BUFFER_ACCESS_TOKEN = process.env.BUFFER_ACCESS_TOKEN || "";
const isMock = !BUFFER_ACCESS_TOKEN;

interface SchedulePostParams {
  text: string;
  profileIds?: string[];
  scheduledAt?: Date;
  media?: { link: string; description: string }[];
}

interface BufferProfile {
  id: string;
  service: string;
  handle: string;
}

export async function getProfiles(): Promise<BufferProfile[]> {
  if (isMock) {
    return [
      { id: "mock-1", service: "twitter", handle: "@incomeuni" },
      { id: "mock-2", service: "linkedin", handle: "Income Universe" },
    ];
  }

  try {
    const res = await fetch("https://api.bufferapp.com/1/profiles.json", {
      headers: { Authorization: `Bearer ${BUFFER_ACCESS_TOKEN}` },
    });

    if (!res.ok) {
      console.error("[Buffer] Get profiles failed:", await res.text());
      return [];
    }

    const data = await res.json();
    return (data as Record<string, unknown>[]).map((p) => ({
      id: p.id as string,
      service: p.service as string,
      handle: (p.service_username || p.service_id) as string,
    }));
  } catch (err) {
    console.error("[Buffer] Error:", err);
    return [];
  }
}

export async function schedulePost(params: SchedulePostParams): Promise<boolean> {
  if (isMock) {
    console.log(
      `[Buffer/Mock] Scheduled: "${params.text.slice(0, 50)}..." for ${
        params.scheduledAt?.toISOString() || "now"
      }`
    );
    return true;
  }

  try {
    const profiles = params.profileIds || (await getProfiles()).map((p) => p.id);

    const body: Record<string, unknown> = {
      text: params.text,
      profile_ids: profiles,
      now: !params.scheduledAt,
    };

    if (params.scheduledAt) {
      body.scheduled_at = params.scheduledAt.toISOString();
    }
    if (params.media?.length) {
      body.media = params.media[0];
    }

    const res = await fetch("https://api.bufferapp.com/1/updates/create.json", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BUFFER_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("[Buffer] Schedule failed:", await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Buffer] Error:", err);
    return false;
  }
}
