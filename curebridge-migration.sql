-- ============================================
-- CureBridge RCM Migration
-- Run this SQL in your Supabase SQL Editor
-- ============================================

-- Add new doctor-specific columns to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS npi_number TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS state TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS website TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS social_platform TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS specialty TEXT DEFAULT '';
