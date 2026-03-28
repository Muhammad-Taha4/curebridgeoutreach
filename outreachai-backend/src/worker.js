import dotenv from "dotenv";
dotenv.config();

import { canAccountSend, incrementDailyCount, recordSendTime, getDailyCount } from "./queue.js";
import { sendEmail } from "./emailSender.js";
import { generateEmail, generateFollowUp } from "./aiGenerator.js";
import supabase, { getActiveAccounts, logEmail, updateLeadStatus, incrementSentCount, updateCampaignStats, getSetting } from "./db.js";

/**
 * ===================================================
 * OutreachAI v2 — Round-Based Parallel Sending Worker
 * ===================================================
 * 
 * Strategy:
 *  1. Poll for active campaigns
 *  2. For each active campaign, run ROUNDS:
 *     - 1 email per account per round (N accounts = N parallel emails)
 *     - Wait delay_minutes between rounds
 *     - Continue until all leads are sent
 *  3. Also processes follow-up campaigns
 */

let isRunning = true;

// Graceful shutdown
process.on("SIGINT", () => { console.log("\n🛑 Worker stopping..."); isRunning = false; setTimeout(() => process.exit(0), 3000); });
process.on("SIGTERM", () => { console.log("\n🛑 Worker stopping..."); isRunning = false; setTimeout(() => process.exit(0), 3000); });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================
// ROUND-BASED CAMPAIGN PROCESSOR
// ============================================

async function processActiveCampaigns() {
  // Get all active campaigns
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .eq("status", "active");

  if (!campaigns || campaigns.length === 0) return false;

  for (const campaign of campaigns) {
    if (!isRunning) break;
    await processOneRound(campaign);
  }
  return true;
}

/**
 * Process ONE round for a campaign
 * Each round: 1 email per available account, all in parallel
 */
async function processOneRound(campaign) {
  const delayMinutes = parseInt(await getSetting("delay_minutes")) || 3;

  // Check if we need to wait for next round
  if (campaign.next_round_at) {
    const nextRound = new Date(campaign.next_round_at);
    if (nextRound > new Date()) {
      const waitSec = Math.ceil((nextRound - new Date()) / 1000);
      if (waitSec > 5) {
        process.stdout.write(`\r⏳ Campaign "${campaign.name}" — next round in ${waitSec}s`);
        return; // Skip, still waiting
      }
    }
  }

  // Get unsent leads for this campaign
  const { data: allLeads } = await supabase
    .from("leads")
    .select("*")
    .in("status", ["new", "queued"])
    .limit(1000);

  // Get leads that already have a log for this campaign (to skip them)
  const { data: sentLogs } = await supabase
    .from("email_log")
    .select("lead_id")
    .eq("campaign_id", campaign.id)
    .eq("followup_number", 0);

  const sentLeadIds = new Set((sentLogs || []).map(l => l.lead_id));
  const unsentLeads = (allLeads || []).filter(l => !sentLeadIds.has(l.id));

  if (unsentLeads.length === 0) {
    // All leads have been emailed — mark campaign as completed
    console.log(`\n🏁 Campaign "${campaign.name}" — All leads emailed! Marking completed.`);
    await supabase.from("campaigns").update({ 
      status: "completed", 
      updated_at: new Date().toISOString() 
    }).eq("id", campaign.id);
    await updateCampaignStats(campaign.id);
    return;
  }

  // Get active accounts that can still send today
  const accounts = await getActiveAccounts();
  const availableAccounts = [];

  for (const acc of accounts) {
    const canSend = await canAccountSend(acc.id, acc.daily_limit || 50);
    if (canSend) availableAccounts.push(acc);
  }

  if (availableAccounts.length === 0) {
    console.log(`\n⚠️ Campaign "${campaign.name}" — No accounts available (all at daily limit). Waiting...`);
    return;
  }

  // Build this round: assign 1 lead per available account
  const round = [];
  const leadsThisRound = Math.min(availableAccounts.length, unsentLeads.length);
  
  for (let i = 0; i < leadsThisRound; i++) {
    round.push({ account: availableAccounts[i], lead: unsentLeads[i] });
  }

  const currentRound = (campaign.current_round || 0) + 1;
  const totalRounds = Math.ceil(unsentLeads.length / availableAccounts.length);
  const totalLeadsSent = sentLeadIds.size;

  console.log(`\n🔄 Campaign "${campaign.name}" — Round ${currentRound}`);
  console.log(`   📊 Progress: ${totalLeadsSent}/${campaign.total_leads || unsentLeads.length + totalLeadsSent} sent`);
  console.log(`   📨 This round: ${round.length} emails (${availableAccounts.length} accounts available)`);

  // ---- STEP 1: Generate ALL emails in parallel (AI batch) ----
  console.log(`   🤖 Generating ${round.length} personalized emails...`);
  const emailContents = await Promise.all(
    round.map(r => generateEmail(
      { name: r.lead.name, company: r.lead.company, industry: r.lead.industry, notes: r.lead.notes, specialty: r.lead.specialty, city: r.lead.city, state: r.lead.state, npi_number: r.lead.npi_number, website: r.lead.website },
      campaign.name || ""
    ).catch(err => {
      console.error(`   ❌ AI generation failed for ${r.lead.name}:`, err.message);
      const lastName = (r.lead.name || "Doctor").split(" ").pop();
      const specialty = r.lead.specialty || "medical";
      return {
        subject: `Streamline Your ${specialty} Billing — CureBridge RCM`,
        body: `<p>Dear Dr. ${lastName},</p><p>I hope you are doing well. My name is Malik, and my team at CureBridge RCM specializes in medical billing, credentialing, and revenue cycle management, drawing on over 16 years of experience.</p><p>Would you be open to a quick 10–15-minute call to explore how we can help?</p><p>Best regards,<br>Adnan Malik<br>CureBridge RCM<br>📧 info@curebridgercm.com<br>🌐 https://curebridgercm.com/</p>`
      };
    }))
  );

  // ---- STEP 2: Send ALL emails in parallel ----
  console.log(`   📤 Sending ${round.length} emails simultaneously...`);
  const results = await Promise.all(
    round.map((r, i) => sendEmail(
      r.account,
      { email: r.lead.email, name: r.lead.name },
      emailContents[i].subject,
      emailContents[i].body
    ).catch(err => ({ success: false, error: err.message })))
  );

  // ---- STEP 3: Log results ----
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < results.length; i++) {
    const { account, lead } = round[i];
    const result = results[i];
    const content = emailContents[i];

    if (result.success) {
      successCount++;
      await incrementDailyCount(account.id);
      await recordSendTime(account.id);
      await incrementSentCount(account.id, account.sent_today || 0);
      await logEmail(lead.id, campaign.id, account.id, content.subject, content.body, "sent", 0);
      await updateLeadStatus(lead.id, "contacted");
    } else {
      failCount++;
      await logEmail(lead.id, campaign.id, account.id, content.subject, content.body, "failed", 0);
      await updateLeadStatus(lead.id, "failed");
    }
  }

  // ---- STEP 4: Update campaign progress ----
  const nextRoundTime = new Date(Date.now() + delayMinutes * 60 * 1000);
  await supabase.from("campaigns").update({
    current_round: currentRound,
    total_rounds: totalRounds + currentRound - 1,
    next_round_at: nextRoundTime.toISOString(),
    updated_at: new Date().toISOString()
  }).eq("id", campaign.id);

  await updateCampaignStats(campaign.id);

  console.log(`   ✅ Round ${currentRound} complete: ${successCount} sent, ${failCount} failed`);
  console.log(`   ⏳ Next round at: ${nextRoundTime.toLocaleTimeString()}`);
}

// ============================================
// FOLLOW-UP PROCESSOR (runs hourly via worker)
// ============================================

async function processFollowups() {
  const enabled = await getSetting("enable_followup");
  if (enabled === "false") return;

  const maxFollowups = parseInt(await getSetting("max_followups")) || 2;
  const intervalDays = parseInt(await getSetting("interval_days")) || 7;
  const now = new Date().toISOString();

  // Find leads that need follow-ups
  // Get latest email_log per lead where followup_number < max AND enough time passed
  const { data: logs } = await supabase
    .from("email_log")
    .select("*, leads!inner(*)")
    .eq("status", "sent")
    .lt("followup_number", maxFollowups)
    .not("next_followup_at", "is", null)
    .lte("next_followup_at", now);

  if (!logs || logs.length === 0) return;

  console.log(`\n📬 Follow-up check: ${logs.length} leads eligible`);

  const accounts = await getActiveAccounts();
  if (accounts.length === 0) return;

  let fuIndex = 0;

  for (const log of logs) {
    if (!isRunning) break;
    if (!log.leads) continue;

    // Check if lead already replied
    const { data: replies } = await supabase
      .from("replies")
      .select("id")
      .eq("lead_id", log.lead_id)
      .limit(1);

    if (replies && replies.length > 0) {
      // Lead replied — stop follow-ups, update status
      await supabase.from("email_log").update({ next_followup_at: null }).eq("id", log.id);
      await updateLeadStatus(log.lead_id, "replied");
      continue;
    }

    const account = accounts[fuIndex % accounts.length];
    fuIndex++;

    const followupNumber = (log.followup_number || 0) + 1;

    try {
      // Generate follow-up
      const content = await generateFollowUp(
        { name: log.leads.name, company: log.leads.company, industry: log.leads.industry, specialty: log.leads.specialty },
        followupNumber
      );

      if (!content.subject.toLowerCase().startsWith("re:")) {
        content.subject = "Re: " + content.subject;
      }

      // Send it
      const result = await sendEmail(
        account,
        { email: log.leads.email, name: log.leads.name },
        content.subject,
        content.body
      );

      if (result.success) {
        await incrementDailyCount(account.id);
        await logEmail(log.lead_id, log.campaign_id, account.id, content.subject, content.body, "sent", followupNumber);

        // Schedule next follow-up
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + intervalDays);

        // Clear the old log's next_followup_at
        await supabase.from("email_log").update({ next_followup_at: null }).eq("id", log.id);

        // Update lead followup count
        await supabase.from("leads").update({ 
          followup_count: followupNumber,
          updated_at: new Date().toISOString()
        }).eq("id", log.lead_id);

        // If this was the LAST follow-up, set auto-delete timer (5 days)
        if (followupNumber >= maxFollowups) {
          const deleteAt = new Date();
          deleteAt.setDate(deleteAt.getDate() + 5);
          await supabase.from("leads").update({ 
            status: "cold",
            auto_delete_at: deleteAt.toISOString()
          }).eq("id", log.lead_id);
          console.log(`   🥶 Lead "${log.leads.name}" marked COLD — auto-delete in 5 days`);
        }

        if (log.campaign_id) await updateCampaignStats(log.campaign_id);
        console.log(`   📨 Follow-up #${followupNumber} sent to ${log.leads.name}`);
      }
    } catch (err) {
      console.error(`   ❌ Follow-up failed for ${log.leads.name}:`, err.message);
    }
  }
}

// ============================================
// AUTO-DELETE PROCESSOR
// ============================================

async function processAutoDeletes() {
  const now = new Date().toISOString();

  const { data: leadsToDelete } = await supabase
    .from("leads")
    .select("*")
    .not("auto_delete_at", "is", null)
    .lte("auto_delete_at", now);

  if (!leadsToDelete || leadsToDelete.length === 0) return;

  console.log(`\n🗑️ Auto-deleting ${leadsToDelete.length} cold leads...`);

  for (const lead of leadsToDelete) {
    // Archive first
    await supabase.from("archived_leads").insert({
      original_id: lead.id,
      name: lead.name,
      email: lead.email,
      company: lead.company,
      industry: lead.industry,
      notes: lead.notes,
      status: lead.status,
      followups_sent: lead.followup_count || 0,
      reason: "no_reply"
    });

    // Then delete
    await supabase.from("leads").delete().eq("id", lead.id);
    console.log(`   🗑️ Archived and deleted: ${lead.name} (${lead.email})`);
  }
}

// ============================================
// MAIN WORKER LOOP
// ============================================

async function runWorker() {
  console.log(`
  🚀 OutreachAI v2 Worker Started
  🔄 Mode: Round-Based Parallel Sending
  📧 Strategy: N accounts × 1 email = N emails/round
  ⏱️ Delay: Configurable minutes between rounds
  📬 Follow-ups: Automatic after 7 days
  🗑️ Auto-delete: 5 days after final follow-up
  `);

  let followupCheckInterval = 0;

  while (isRunning) {
    try {
      // 1. Process active campaigns (round-based)
      const hadWork = await processActiveCampaigns();

      // 2. Every ~30 minutes, check follow-ups and auto-deletes
      followupCheckInterval++;
      if (followupCheckInterval >= 120) { // 120 × 15s = 30 min
        followupCheckInterval = 0;
        await processFollowups();
        await processAutoDeletes();
      }

      if (!hadWork) {
        process.stdout.write(`\r⏳ No active campaigns. Polling... [${new Date().toLocaleTimeString()}]`);
        await sleep(15000); // 15s poll
      } else {
        await sleep(5000); // 5s between campaign checks
      }

    } catch (error) {
      console.error("\n❌ Worker Error:", error.message);
      await sleep(10000);
    }
  }

  console.log("\n✅ Worker stopped.");
  process.exit(0);
}

// Start
runWorker();
