import supabase, { getSetting } from "./db.js";
import { addToQueue } from "./queue.js";

export async function processFollowups() {
  try {
    const followupsEnabled = await getSetting("enable_followup");
    if (followupsEnabled === "false") return;
    
    const maxFollowups = parseInt(await getSetting("max_followups")) || 3;
    const now = new Date().toISOString();

    const { data: logs, error } = await supabase
      .from("email_log")
      .select("*, leads(*)")
      .eq("status", "sent")
      .lt("followup_number", maxFollowups)
      .not("next_followup_at", "is", null)
      .lte("next_followup_at", now);

    if (error || !logs || logs.length === 0) return;

    for (const log of logs) {
      if (!log.leads) continue; // safety check
      
      // Check if lead replied
      const { data: replies } = await supabase
        .from("replies")
        .select("id")
        .eq("lead_id", log.lead_id)
        .limit(1);
        
      if (replies && replies.length > 0) continue;

      // Ensure we don't pick this log up again
      await supabase.from("email_log").update({ next_followup_at: null }).eq("id", log.id);

      // Add follow-up to queue
      await addToQueue({
        isFollowUp: true,
        followupNumber: (log.followup_number || 0) + 1,
        leadId: log.lead_id,
        leadName: log.leads.name,
        leadEmail: log.leads.email,
        leadCompany: log.leads.company,
        leadIndustry: log.leads.industry,
        leadSpecialty: log.leads.specialty,
        campaignId: log.campaign_id,
      });
    }
  } catch (err) {
    console.error("Follow-up process error:", err.message);
  }
}
