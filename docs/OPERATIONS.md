# Sharkline Operations Runbook

## VIP Test Surface Rule

**Current state (Decision C = 0 subscribers):**
VIP channel has zero paying subscribers. It is treated as a test surface identical to FREE during the supervised week. Test approvals may be sent to VIP without risk.

**Escalation thresholds:**
- 0-1 subscribers (just Ermir): VIP = test surface, same as FREE.
- 2-10 subscribers: small audience. Only send picks the operator is fully confident in. No deliberate test approvals to VIP.
- 10+ subscribers: VIP is a real audience. Test approvals target FREE only or use a synthetic test channel.

Review this rule at the start of each supervised week.

---

## Daily Operator Workflow (Supervised Week)

1. **Morning check (~06:00 AZ / 13:00 UTC)**
   - Verify `TIPSTER_ENABLED` is set correctly in Vercel env vars.
   - Check Health tab: last cron run, errors, Odds API status.
   - If cron is enabled: drafts appear in the Drafts tab within minutes.

2. **Review drafts**
   - Open dashboard at `/dashboard`, Drafts tab.
   - For each draft: read reasoning, cross-check the line/price against the source bookmaker (DraftKings, FanDuel, etc.).
   - Approve picks you agree with. Reject picks with a reason.
   - Cosmetic edits (odds drift, bookmaker correction) can be applied inline.
   - Directional edits (side flip) require reasoning regeneration — the UI enforces this.
   - Structural edits (market change) auto-regenerate reasoning server-side.

3. **Monitor settlement**
   - `settle-pending` cron runs every 5 minutes via cron-job.org.
   - Check History tab for settled picks. Verify results match actual game outcomes.
   - If a pick settles incorrectly: void it via the Void button with a reason.

4. **End-of-day**
   - Daily recap cron fires automatically (if enabled) and posts to Telegram channels.
   - Skim the recap for accuracy.

## Weekly Retrospective

Pull these metrics each Sunday:

- Win rate (overall + last 7 days)
- Units P&L (week + month-to-date)
- Picks by sport: which sports are profitable?
- Picks by tier: are MAXIMUM picks outperforming VALUE?
- Settlement gap check: any picks with `result` set but no `bankroll_log` entry?
- Decision log coverage: % of graded picks with `pick_decision_log` entry (should be 100% post-May 4).

Decisions to make:
- Adjust active sports list (`ACTIVE_SPORTS` env var)?
- Adjust confidence thresholds (in `lib/tipster/tiers.ts`)?
- Any patterns suggesting the model is miscalibrated on a sport?

## Incident Response

### (a) Cron fails

**Symptom:** No drafts appear; Health tab shows stale "Last Cron Run" timestamp.

**Steps:**
1. Check Vercel function logs for the `daily-picks` route.
2. Common causes: Supabase down, Odds API credits exhausted (check Health tab), env var missing.
3. If Odds API is exhausted: ESPN fallback should have kicked in. Check agent_logs for `espn_fallback` entries.
4. Manual recovery: trigger cron manually from Controls tab ("Trigger Daily Picks").

### (b) Telegram bot is down

**Symptom:** Picks approved but not appearing in Telegram channels.

**Steps:**
1. Check Vercel function logs for `sendTelegram` errors.
2. Verify `TELEGRAM_BOT_TOKEN` and channel IDs in env vars.
3. Test with: `curl https://api.telegram.org/bot<TOKEN>/getMe`
4. If bot is banned from channel: re-add it as admin.

### (c) Database unreachable

**Symptom:** Dashboard shows "Failed to load" errors.

**Steps:**
1. Check Supabase dashboard at supabase.com for project status.
2. If project is paused: restore via Supabase dashboard.
3. If connection pooler issue: check `NEXT_PUBLIC_SUPABASE_URL` points to correct endpoint.

### (d) Admin alert fires

**Symptom:** Telegram admin DM with error notification.

**Steps:**
1. Read the error message — it includes the agent name and action.
2. Check agent_logs table for full context.
3. Most alerts are non-critical (e.g., ESPN scrape failure for one game). Critical alerts mention "auto-pause" or "kill switch".

### (e) Wrong pick published

**Steps:**
1. Void the pick immediately via dashboard History tab (Void button + reason).
2. The void sets `status=voided`, `result=void`, and marks bankroll_log entry as voided.
3. Post a correction to the affected Telegram channel manually.
4. Log the incident in agent_logs via a manual insert or note in the weekly retrospective.

### (f) Odds API and ESPN both fail

**Symptom:** No games found; cron returns `gamesFound: 0`.

**Steps:**
1. Check Odds API credits on Health tab.
2. ESPN failures are usually temporary (rate limiting). Wait 15 minutes and re-trigger.
3. If persistent: manually insert picks via the "Compose New Pick" button (manual picks skip validation or use force-unverified).
4. Set `TIPSTER_ENABLED=false` if you want to pause generation entirely.

## Credential Rotation

The `ADMIN_DASHBOARD_PASSWORD` value must be rotated outside of any AI conversation to avoid leaking it into transcripts.

**Rotation procedure:**
```bash
# 1. Generate a new password locally (NOT in a Claude/AI session)
openssl rand -base64 32

# 2. Set in Vercel production
vercel env rm ADMIN_DASHBOARD_PASSWORD production
vercel env add ADMIN_DASHBOARD_PASSWORD production
# paste the value when prompted

# 3. Update .env.local with the same value
# ADMIN_DASHBOARD_PASSWORD=<new-value>

# 4. Test login at /dashboard
```

**Last rotation:** Pending — operator must complete manually per the steps above.

## Rollback Procedure

### Revert a deploy
```bash
# Find the last good deployment
vercel ls --prod

# Promote a previous deployment
vercel promote <deployment-url>
```

### Disable cron quickly
Set `TIPSTER_ENABLED=false` in Vercel Production env vars. Takes effect on next cron invocation (no redeploy needed for env var changes on Vercel).

### Emergency contacts
- **Vercel:** support via vercel.com/support
- **Supabase:** support via supabase.com/dashboard (project settings)
- **Telegram Bot API:** no support channel; check https://core.telegram.org/bots/api for status

## Subscriber Communication Policy

**Current state:** No paying subscribers. When subscribers exist:

- Bot DMs from subscribers should be monitored via the Telegram admin chat.
- Complaints about pick quality: acknowledge, point to public track record, do not promise specific outcomes.
- Refund requests: handle per the refund policy (to be defined before launch).
- Questions about methodology: point to the landing page "How Sharkline Finds Edges" section. Do not reveal internal model details, confidence thresholds, or system architecture.
- Never promise win rates, guaranteed profits, or specific returns.
