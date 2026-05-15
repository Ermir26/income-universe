import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before imports
const mockRunPickGeneration = vi.fn();
const mockVerifySessionToken = vi.fn();
const mockSupabaseInsert = vi.fn().mockReturnValue({
  select: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({ data: { id: 'test-log-id' }, error: null }),
  }),
});

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue({ value: 'valid-session-token' }),
  }),
}));

vi.mock('@/lib/admin/auth', () => ({
  verifySessionToken: (...args: unknown[]) => mockVerifySessionToken(...args),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ insert: mockSupabaseInsert }),
  }),
}));

vi.mock('@/lib/tipster/run-pick-generation', () => ({
  runPickGeneration: (...args: unknown[]) => mockRunPickGeneration(...args),
}));

describe('POST /api/dashboard/run-picks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifySessionToken.mockResolvedValue(true);
  });

  it('returns JSON on successful generation', async () => {
    mockRunPickGeneration.mockResolvedValue({
      generated: 3,
      posted_free: 1,
      posted_vip: 2,
      skipped_low_confidence: 0,
      skipped_duplicates: 0,
      errors: [],
      triggered_by: 'manual',
    });

    const { POST } = await import('@/app/api/dashboard/run-picks/route');
    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.generated).toBe(3);
    expect(body.triggered_by).toBe('manual');
  });

  it('returns JSON (not HTML) when runPickGeneration throws', async () => {
    mockRunPickGeneration.mockRejectedValue(new Error('Anthropic API key expired'));

    const { POST } = await import('@/app/api/dashboard/run-picks/route');
    const res = await POST();

    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Anthropic API key expired');
    expect(body.exception_id).toBeDefined();
  });
});
