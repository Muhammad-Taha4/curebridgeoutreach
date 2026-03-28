import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("❌ CRITICAL: Missing Supabase environment variables.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default supabase;

// ===== HELPER FUNCTIONS =====

// Get all active email accounts
export async function getActiveAccounts() {
  const { data, error } = await supabase
    .from("email_accounts")
    .select("*")
    .eq("status", "active");
  if (error) { console.error("getActiveAccounts:", error); return []; }
  return data || [];
}

// Get leads for a campaign
export async function getLeadsForCampaign(campaignId) {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("status", "new")
    .limit(50);
  if (error) { console.error("getLeads:", error); return []; }
  return data || [];
}

// Update lead status
export async function updateLeadStatus(leadId, status) {
  const { error } = await supabase
    .from("leads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) console.error("updateLeadStatus:", error);
}

// Log sent email (safe — handles missing columns gracefully)
export async function logEmail(leadId, campaignId, accountId, subject, body, status = "sent", followupNumber = 0) {
  const insertData = {
    lead_id: leadId,
    campaign_id: campaignId,
    account_id: accountId,
    subject,
    body,
    status,
    sent_at: status === "sent" ? new Date().toISOString() : null
  };

  // Try adding followup columns (will fail silently if columns don't exist)
  try {
    insertData.followup_number = followupNumber;
    if (status === "sent") {
      const intervalDays = parseInt(await getSetting("interval_days")) || 7;
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + intervalDays);
      insertData.next_followup_at = nextDate.toISOString();
    }
  } catch (e) {
    // Columns may not exist yet
  }

  const { error } = await supabase.from("email_log").insert(insertData);
  if (error) {
    // Retry without followup columns
    console.warn("logEmail: Retrying without followup columns...");
    const fallback = {
      lead_id: leadId, campaign_id: campaignId, account_id: accountId,
      subject, body, status, sent_at: insertData.sent_at
    };
    const { error: e2 } = await supabase.from("email_log").insert(fallback);
    if (e2) console.error("logEmail final error:", e2);
  }
}

// Increment sent count for account
export async function incrementSentCount(accountId, currentCount) {
  const { error } = await supabase
    .from("email_accounts")
    .update({ sent_today: (currentCount || 0) + 1, updated_at: new Date().toISOString() })
    .eq("id", accountId);
  if (error) console.error("incrementSent:", error);
}

// Reset all daily counts (run at midnight)
export async function resetDailyCounts() {
  const { error } = await supabase
    .from("email_accounts")
    .update({ sent_today: 0, updated_at: new Date().toISOString() })
    .neq("sent_today", 0);
  if (error) console.error("resetDailyCounts:", error);
  else console.log("✅ Daily counts reset");
}

// Update campaign stats
export async function updateCampaignStats(campaignId) {
  const { data: logs } = await supabase
    .from("email_log")
    .select("status, followup_number")
    .eq("campaign_id", campaignId);

  const { data: replies } = await supabase
    .from("replies")
    .select("id")
    .eq("campaign_id", campaignId);

  const allLogs = logs || [];
  const sent = allLogs.filter(l => l.status === "sent" && (l.followup_number || 0) === 0).length;
  const followupsSent = allLogs.filter(l => l.status === "sent" && (l.followup_number || 0) > 0).length;
  const replyCount = (replies || []).length;

  const update = { 
    emails_sent: sent, 
    replies: replyCount, 
    updated_at: new Date().toISOString() 
  };

  // Try adding followups_sent (may not exist yet)
  try { update.followups_sent = followupsSent; } catch(e) {}

  await supabase.from("campaigns").update(update).eq("id", campaignId);
}

// Save reply
export async function saveReply(fromName, fromEmail, subject, body, leadId, campaignId) {
  const { error } = await supabase
    .from("replies")
    .insert({ from_name: fromName, from_email: fromEmail, subject, body, lead_id: leadId, campaign_id: campaignId });
  if (error) console.error("saveReply:", error);
}

// Get setting
export async function getSetting(key) {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .single();
  return data?.value || null;
}
