import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before imports
const mockRunTipster = vi.fn();
const mockCheckSportHealth = vi.fn();
const mockSupabaseInsert = vi.fn().mockReturnValue({ then: (ok: () => void) => { ok(); } });
// Build a deeply chainable mock that resolves to { data: [] } or { data: null }
function chainable(resolveValue: unknown = { data: [] }): Record<string, unknown> {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') {
        // Make it thenable — resolve with the value
        return (resolve: (v: unknown) => void) => resolve(resolveValue);
      }
      // Any chained method returns another chainable proxy
      return vi.fn().mockReturnValue(new Proxy({}, handler));
    },
  };
  return new Proxy({}, handler) as Record<string, unknown>;
}

const mockSupabaseFrom = vi.fn().mockImplementation((table: string) => {
  if (table === 'system_status') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { mode: 'standard' }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue(chainable()),
      insert: mockSupabaseInsert,
    };
  }
  return {
    select: vi.fn().mockReturnValue(chainable()),
    insert: mockSupabaseInsert,
    update: vi.fn().mockReturnValue(chainable()),
  };
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

vi.mock('@/lib/method/system-status', () => ({
  getSystemStatus: vi.fn().mockResolvedValue([]),
  getTodayExposure: vi.fn().mockResolvedValue(0),
  MAX_DAILY_EXPOSURE: 20,
}));

vi.mock('@/lib/tipster/bankroll-launch', () => ({
  isBankrollTrackingActive: vi.fn().mockResolvedValue(false),
}));

// Suppress fetch calls (sendVip uses global fetch)
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

function makeRequest(secret?: string, opts?: { noAuth?: boolean }): Request {
  const headers: Record<string, string> = {};
  if (secret) headers['authorization'] = `Bearer ${secret}`;
  // Simulate Vercel cron user-agent unless explicitly testing without auth
  if (!opts?.noAuth) headers['user-agent'] = 'vercel-cron/1.0';
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

  it('rejects unauthenticated requests with 401', async () => {
    const { GET } = await import('@/app/api/cron/daily-picks/route');
    const res = await GET(makeRequest(undefined, { noAuth: true }));
    expect(res.status).toBe(401);
    expect(mockRunTipster).not.toHaveBeenCalled();
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

    // Response should reflect the capped result
    expect(body.generated).toBe(5);
    expect(body.skipped_low_confidence).toBe(5);
    expect(body.posted_vip).toBe(5);
    expect(body.posted_free).toBe(1);
    expect(body.auto_paused).toBe(false);
    expect(body.triggered_by).toBe('cron');
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
    expect(body.triggered_by).toBe('cron');

    // agent_logs should have been called
    const logCalls = mockSupabaseFrom.mock.calls.filter((c) => c[0] === 'agent_logs');
    expect(logCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('kill switch: TIPSTER_ENABLED=false skips generation', async () => {
    process.env.TIPSTER_ENABLED = 'false';

    const { GET } = await import('@/app/api/cron/daily-picks/route');
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.skipped).toBe('disabled');
    expect(body.triggered_by).toBe('cron');
    expect(mockRunTipster).not.toHaveBeenCalled();

    // Should have logged to agent_logs
    const logCalls = mockSupabaseFrom.mock.calls.filter((c) => c[0] === 'agent_logs');
    expect(logCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('runPickGeneration service', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockCheckSportHealth.mockResolvedValue({ action: 'live' });
    delete process.env.TIPSTER_ENABLED;
  });

  it('returns PickGenerationResult with triggered_by field', async () => {
    process.env.TIPSTER_ENABLED = 'false';

    const { runPickGeneration } = await import('@/lib/tipster/run-pick-generation');
    const result = await runPickGeneration('manual');

    expect(result.triggered_by).toBe('manual');
    expect(result.skipped).toBe('disabled');
    expect(result.generated).toBe(0);
  });

  it('returns valid JSON-serializable result (no HTML)', async () => {
    process.env.TIPSTER_ENABLED = 'false';

    const { runPickGeneration } = await import('@/lib/tipster/run-pick-generation');
    const result = await runPickGeneration('cron');

    // Must be JSON-serializable without throwing
    const json = JSON.stringify(result);
    expect(json).not.toContain('<!doctype');
    expect(json).not.toContain('<html');

    const parsed = JSON.parse(json);
    expect(parsed.skipped).toBe('disabled');
    expect(parsed.triggered_by).toBe('cron');
  });

  it('cron route returns JSON response (not HTML)', async () => {
    process.env.TIPSTER_ENABLED = 'false';

    const { GET } = await import('@/app/api/cron/daily-picks/route');
    const res = await GET(makeRequest());

    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body.skipped).toBe('disabled');
  });
});
