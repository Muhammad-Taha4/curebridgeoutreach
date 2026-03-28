-- ============================================================
-- OutreachAI v2 — Database Migration
-- Run this ENTIRE script in Supabase SQL Editor
-- ============================================================

-- 1. Add follow-up tracking to email_log
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS followup_number INTEGER DEFAULT 0;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMPTZ;

-- 2. Add auto-delete and followup tracking to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS auto_delete_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_count INTEGER DEFAULT 0;

-- 3. Add followups_sent to campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS followups_sent INTEGER DEFAULT 0;

-- 4. Add sending_round tracking to campaigns (for live progress)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS current_round INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS total_rounds INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS next_round_at TIMESTAMPTZ;

-- 5. Create archived_leads table
CREATE TABLE IF NOT EXISTS archived_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  original_id UUID,
  name TEXT,
  email TEXT,
  company TEXT,
  industry TEXT,
  notes TEXT,
  status TEXT,
  emails_sent INTEGER DEFAULT 0,
  followups_sent INTEGER DEFAULT 0,
  archived_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT DEFAULT 'no_reply'
);

-- 6. Enable RLS on archived_leads
ALTER TABLE archived_leads ENABLE ROW LEVEL SECURITY;

-- 7. Create policy for archived_leads (allow all for now)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on archived_leads') THEN
    CREATE POLICY "Allow all on archived_leads" ON archived_leads FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 8. Indexes
CREATE INDEX IF NOT EXISTS idx_leads_auto_delete ON leads(auto_delete_at) WHERE auto_delete_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_log_followup ON email_log(followup_number);
CREATE INDEX IF NOT EXISTS idx_email_log_next_followup ON email_log(next_followup_at) WHERE next_followup_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_log_lead ON email_log(lead_id);

-- 9. Add new settings (if missing)
INSERT INTO app_settings (key, value) VALUES
  ('enable_followup', 'true'),
  ('interval_days', '7'),
  ('delay_minutes', '3'),
  ('max_followups', '2')
ON CONFLICT (key) DO NOTHING;

-- DONE! Now go back and restart the backend server.
