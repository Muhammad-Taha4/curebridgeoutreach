
import supabase from "./db.js";

/**
 * Analytics Module
 * Provides tracking and calculations for campaign and lead statistics
 */

/**
 * Calculate campaign performance overview
 * @param {string} campaignId 
 * @returns {Object} - Campaign stats
 */
export async function calculateCampaignStats(campaignId) {
  try {
    const [
      { data: logs },
      { data: replies }
    ] = await Promise.all([
      supabase.from("email_log").select("status").eq("campaign_id", campaignId),
      supabase.from("replies").select("id").eq("campaign_id", campaignId)
    ]);

    const sent = (logs || []).filter(l => l.status === "sent").length;
    const failed = (logs || []).filter(l => l.status === "failed").length;
    const replyCount = (replies || []).length;
    const replyRate = sent > 0 ? ((replyCount / sent) * 100).toFixed(1) : "0";

    return { sent, failed, replies: replyCount, replyRate, timestamp: new Date().toISOString() };
  } catch (error) {
    console.error("❌ Stats calculation failed:", error.message);
    return { sent: 0, failed: 0, replies: 0, replyRate: "0" };
  }
}

/**
 * Get daily performance for the last 7 days
 * @returns {Array<Object>} - Daily stats
 */
export async function getDailyPerformance() {
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split("T")[0];
  }).reverse();

  try {
    const { data: logs } = await supabase.from("email_log").select("sent_at").eq("status", "sent");
    const counts = {};
    (logs || []).forEach(log => {
      const day = log.sent_at.split("T")[0];
      if (last7Days.includes(day)) {
        counts[day] = (counts[day] || 0) + 1;
      }
    });

    return last7Days.map(day => ({ day, count: counts[day] || 0 }));
  } catch {
    return last7Days.map(day => ({ day, count: 0 }));
  }
}

/**
 * Get overview stats for the entire application
 * @returns {Object} - App-wide stats
 */
export async function getOverviewStats() {
  try {
    const [
      { data: leads },
      { data: accounts },
      { data: campaigns },
      { data: replies },
      { data: logs }
    ] = await Promise.all([
      supabase.from("leads").select("*"),
      supabase.from("email_accounts").select("*").eq("status", "active"),
      supabase.from("campaigns").select("*").eq("status", "active"),
      supabase.from("replies").select("*"),
      supabase.from("email_log").select("*").eq("status", "sent")
    ]);

    return {
      totalLeads: leads?.length || 0,
      activeAccounts: accounts?.length || 0,
      activeCampaigns: campaigns?.length || 0,
      totalReplies: replies?.length || 0,
      totalSent: logs?.length || 0
    };
  } catch (error) {
    console.error("❌ Overview stats failed:", error.message);
    return {
      totalLeads: 0,
      activeAccounts: 0,
      activeCampaigns: 0,
      totalReplies: 0,
      totalSent: 0
    };
  }
}

// End of module
