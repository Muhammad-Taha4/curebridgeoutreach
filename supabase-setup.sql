-- ============================================================
-- OutreachAI — Supabase Database Setup
-- Run this ENTIRE script in Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================

-- 1. LEADS TABLE
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT DEFAULT '',
  industry TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'replied', 'bounced')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. EMAIL ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  provider TEXT DEFAULT 'Gmail' CHECK (provider IN ('Gmail', 'Outlook', 'SMTP')),
  daily_limit INTEGER DEFAULT 50,
  sent_today INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  app_password TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CAMPAIGNS TABLE
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  total_leads INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  accounts_count INTEGER DEFAULT 1,
  delay_minutes INTEGER DEFAULT 3,
  max_followups INTEGER DEFAULT 3,
  email_template TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. REPLIES TABLE
CREATE TABLE IF NOT EXISTS replies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  from_name TEXT DEFAULT '',
  from_email TEXT NOT NULL,
  subject TEXT DEFAULT '',
  body TEXT DEFAULT '',
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. EMAIL LOG TABLE (tracking sent emails)
CREATE TABLE IF NOT EXISTS email_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL,
  subject TEXT DEFAULT '',
  body TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. SETTINGS TABLE
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO app_settings (key, value) VALUES
  ('delay_minutes', '3'),
  ('max_followups', '3'),
  ('ai_personalization', 'true'),
  ('auto_followup', 'true'),
  ('reply_tracking', 'true'),
  ('daily_report', 'false')
ON CONFLICT (key) DO NOTHING;

-- 7. ENABLE ROW LEVEL SECURITY (important for Supabase)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- 8. CREATE POLICIES (allow all for now - you can restrict later)
CREATE POLICY "Allow all on leads" ON leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on email_accounts" ON email_accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on campaigns" ON campaigns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on replies" ON replies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on email_log" ON email_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on app_settings" ON app_settings FOR ALL USING (true) WITH CHECK (true);

-- 9. INDEXES (for better performance)
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_accounts_status ON email_accounts(status);
CREATE INDEX IF NOT EXISTS idx_email_log_campaign ON email_log(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_log_status ON email_log(status);
CREATE INDEX IF NOT EXISTS idx_email_log_created_at ON email_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_replies_lead ON replies(lead_id);
CREATE INDEX IF NOT EXISTS idx_replies_created_at ON replies(created_at DESC);

-- DONE! All tables created successfully.
-- Now go back to Claude and tell: "tables ban gaye"
