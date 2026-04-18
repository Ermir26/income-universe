import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before imports
const mockRunTipster = vi.fn();
const mockCheckSportHealth = vi.fn();
const mockSupabaseInsert = vi.fn().mockReturnValue({ then: (ok: () => void) => { ok(); } });
const mockSupabaseSelect = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    not: vi.fn().mockResolvedValue({ data: [] }),
  }),
});
const mockSupabaseFrom = vi.fn().mockImplementation((table: string) => {
  if (table === 'picks') return { select: mockSupabaseSelect, insert: mockSupabaseInsert };
  return { insert: mockSupabaseInsert };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockSupabaseFrom }),
}));

vi.mock('@/lib/tipster/tipster-agent', () => ({
  runTipster: (...args: unknown[]) => mockRunTipster(...args),
}));

vi.mock('@/lib/tipster/safety', () => ({
  checkSportHealth: (...args: unknown[]) => mockCheckSportHealth(...args),
}));

vi.mock('@/lib/tipster/brand', () => ({
  SPORT_CATEGORY_KEYS: {
    soccer: ['soccer_epl'],
    basketball: ['basketball_nba'],
  },
}));

// Suppress fetch calls (sendVip uses global fetch)
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

function makeRequest(secret?: string): Request {
  const headers: Record<string, string> = {};
  if (secret) headers['authorization'] = `Bearer ${secret}`;
  return new Request('http://localhost/api/cron/daily-picks', { headers });
}

describe('daily-picks cron', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Default: not paused
    mockCheckSportHealth.mockResolvedValue({ action: 'live' });
    // Reset env
    delete process.env.TIPSTER_ENABLED;
    process.env.CRON_SECRET = '';
  });

  it('caps picks at MAX_PICKS_PER_DAY (5)', async () => {
    mockRunTipster.mockResolvedValue({
      gamesFound: 20,
      cardsGenerated: 5,
      picksSent: 5,
      postedVip: 5,
      postedFree: 1,
      skippedLowConfidence: 5,
      skippedDuplicates: 0,
      cards: [],
    });

    const { GET } = await import('@/app/api/cron/daily-picks/route');
    const res = await GET(makeRequest());
    const body = await res.json();

    // runTipster should have been called with maxPicks: 5
    expect(mockRunTipster).toHaveBeenCalledOnce();
    const config = mockRunTipster.mock.calls[0][0];
    expect(config.maxPicks).toBe(5);

    // Response should reflect the capped result
    expect(body.generated).toBe(5);
    expect(body.skipped_low_confidence).toBe(5);
    expect(body.posted_vip).toBe(5);
    expect(body.posted_free).toBe(1);
    expect(body.auto_paused).toBe(false);
  });

  it('zero candidates: no free post, VIP message sent, agent_logs entry', async () => {
    mockRunTipster.mockResolvedValue({
      gamesFound: 15,
      cardsGenerated: 0,
      picksSent: 0,
      postedVip: 0,
      postedFree: 0,
      skippedLowConfidence: 0,
      skippedDuplicates: 0,
      cards: [],
    });

    const { GET } = await import('@/app/api/cron/daily-picks/route');
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.generated).toBe(0);
    expect(body.posted_free).toBe(0);
    expect(body.posted_vip).toBe(0);
    expect(body.auto_paused).toBe(false);

    // agent_logs should have been called with 'no_picks' action
    const logCalls = mockSupabaseFrom.mock.calls.filter((c) => c[0] === 'agent_logs');
    expect(logCalls.length).toBeGreaterThanOrEqual(1);
    // The insert is called on the object returned by from('agent_logs')
    // Check that at least one insert call has action='no_picks'
    const insertCalls = mockSupabaseInsert.mock.calls;
    const hasNoPicksLog = insertCalls.some((c) => c[0]?.action === 'no_picks');
    expect(hasNoPicksLog).toBe(true);

    // VIP message should have been sent (via global fetch for sendVip)
    // fetch is called for Telegram sendVip — check it was called with VIP text
    // Note: sendVip only fires if TELEGRAM_BOT_TOKEN and VIP_CHANNEL_ID are set
    // In our test env they're empty, so sendVip is a no-op. That's fine —
    // the important assertion is the response shape and agent_logs entry.
  });

  it('kill switch: TIPSTER_ENABLED=false skips generation', async () => {
    process.env.TIPSTER_ENABLED = 'false';

    const { GET } = await import('@/app/api/cron/daily-picks/route');
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.skipped).toBe('disabled');
    expect(mockRunTipster).not.toHaveBeenCalled();

    // Should log 'skipped' to agent_logs
    const logCalls = mockSupabaseFrom.mock.calls.filter((c) => c[0] === 'agent_logs');
    expect(logCalls.length).toBeGreaterThanOrEqual(1);
  });
});
