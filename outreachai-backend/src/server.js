import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { body, query, validationResult } from "express-validator";
import dotenv from "dotenv";
import { fork } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Auto-start worker process
let workerProcess = null;
function ensureWorkerRunning() {
  if (workerProcess && !workerProcess.killed) return;
  const workerPath = join(__dirname, "worker.js");
  workerProcess = fork(workerPath, [], { stdio: "inherit" });
  workerProcess.on("exit", (code) => { 
    console.log(`\n🔧 Worker exited (code ${code}). Will restart on next campaign start.`);
    workerProcess = null; 
  });
  workerProcess.on("error", (err) => {
    console.error("Worker error:", err.message);
    workerProcess = null;
  });
  console.log("🔧 Worker auto-started (PID:", workerProcess.pid, ")");
}

import supabase, {
  getActiveAccounts, getLeadsForCampaign, updateLeadStatus,
  logEmail, updateCampaignStats, resetDailyCounts, saveReply
} from "./db.js";
import { sendEmail, verifyAccount } from "./emailSender.js";
import { generateEmail, generateFollowUp, generateReplySuggestion } from "./aiGenerator.js";
import { addToQueue, getQueueStatus, clearQueue, getDailyCount } from "./queue.js";
import { templates, renderTemplate } from "./templates.js";
import { checkSpamScore } from "./spamChecker.js";
import { parseCSVLeads } from "./csvParser.js";
import { calculateCampaignStats, getDailyPerformance } from "./analytics.js";
import { requestLogger, authenticateAPI, errorHandler, validateEmail, sanitizeBody, securityHeaders, stripPasswords, validateInputLengths, encrypt, decrypt } from "./middleware.js";
import { calculateWarmupLimit, getWarmupStep } from "./warmup.js";
import { syncReplies, checkAllReplies } from "./replyChecker.js";

const app = express();
const PORT = process.env.PORT || 4000;

// ============================
// HEALTH CHECK (Defined before Auth to ensure bypass)
// ============================
app.get("/api/health", async (req, res) => {
  const status = { server: "ok", uptime: process.uptime(), timestamp: new Date().toISOString(), database: "connecting...", redis: "connecting..." };
  try {
    const { data } = await supabase.from("app_settings").select("key").limit(1);
    status.database = data ? "connected" : "error";
  } catch { status.database = "error"; }
  try {
    const q = await getQueueStatus();
    status.redis = q.error ? "error" : "connected";
    status.queueLength = q.queueLength;
  } catch { status.redis = "error"; }
  res.status(200).json(status);
});

// ===== MIDDLEWARE =====
app.use(helmet({ contentSecurityPolicy: false })); // CSP disabled for inline styles
app.use(compression());
app.use(cors({ 
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) return callback(null, true);
    if (origin === process.env.FRONTEND_URL) return callback(null, true);
    callback(null, true);
  },
  credentials: true
}));
app.use(express.json({ limit: "5mb" }));
app.use(securityHeaders);
app.use(sanitizeBody);
app.use(validateInputLengths);
app.use(requestLogger);

// (Health check moved above middleware)

// API key authentication on all /api routes except /api/health
app.use("/api", authenticateAPI);

// Tiered rate limiting
const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, message: { error: "Too many requests. Please slow down." }, standardHeaders: true, legacyHeaders: false });
const emailLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, message: { error: "Email rate limit exceeded. Try again shortly." }, standardHeaders: true, legacyHeaders: false });
const strictLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: "Rate limit exceeded. Please wait." }, standardHeaders: true, legacyHeaders: false });
app.use("/api", globalLimiter);
app.use("/api/send-email", emailLimiter);
app.use("/api/leads/:id/send-email", emailLimiter);
app.use("/api/ai", strictLimiter);

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ status: 400, errors: errors.array() });
  next();
};

// (Health check moved above auth)

// ============================
// LEADS API
// ============================
app.get("/api/leads", async (req, res) => {
  try {
    const { page = 1, limit = 100, search = "", sortField = "created_at", sortOrder = "desc" } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Simple query WITHOUT email_log join (avoids missing column errors)
    let q = supabase.from("leads").select("*", { count: "exact" });

    if (search) {
      q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%,specialty.ilike.%${search}%,city.ilike.%${search}%,state.ilike.%${search}%,npi_number.ilike.%${search}%`);
    }

    q = q.order(sortField, { ascending: sortOrder === "asc" });
    const { data, count, error } = await q.range(offset, offset + parseInt(limit) - 1);
    if (error) throw error;

    // Enrich with email_log data separately (safe)
    const enriched = await Promise.all((data || []).map(async (lead) => {
      try {
        const { data: logs } = await supabase
          .from("email_log")
          .select("status, followup_number, sent_at")
          .eq("lead_id", lead.id)
          .eq("status", "sent")
          .order("sent_at", { ascending: false });
        
        const maxFu = logs && logs.length > 0 
          ? Math.max(...logs.map(l => l.followup_number || 0)) 
          : 0;
        const hasSent = logs && logs.length > 0;
        
        return { ...lead, followup_max: maxFu, has_been_emailed: hasSent, email_count: logs?.length || 0 };
      } catch {
        return { ...lead, followup_max: 0, has_been_emailed: false, email_count: 0 };
      }
    }));

    res.status(200).json({ data: enriched, total: count, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/leads", [
  body("email").isEmail().normalizeEmail(),
  body("name").trim().notEmpty(),
  validate
], async (req, res) => {
  try {
    const { name, email, company, industry, notes, npi_number, phone, state, city, website, social_platform, specialty } = req.body;
    const { data, error } = await supabase.from("leads").insert({ name, email, company, industry: industry || specialty, notes, npi_number, phone, state, city, website, social_platform, specialty }).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/leads/bulk", async (req, res) => {
  try {
    const { leads, csvContent } = req.body;
    let leadsToInsert = leads;
    if (csvContent) leadsToInsert = parseCSVLeads(csvContent);
    if (!leadsToInsert || !Array.isArray(leadsToInsert) || leadsToInsert.length === 0) {
      return res.status(400).json({ error: "No valid leads" });
    }
    const { data, error } = await supabase.from("leads").insert(leadsToInsert).select();
    if (error) throw error;
    res.status(201).json({ imported: data.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/leads/:id", async (req, res) => {
  try {
    const updates = req.body;
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from("leads").update(updates).eq("id", req.params.id).select();
    if (error) throw error;
    if (!data.length) return res.status(404).json({ error: "Lead not found" });
    res.status(200).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel auto-delete timer for a lead
app.post("/api/leads/:id/keep", async (req, res) => {
  try {
    const { data, error } = await supabase.from("leads")
      .update({ auto_delete_at: null, status: "contacted" })
      .eq("id", req.params.id).select();
    if (error) throw error;
    res.status(200).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DIRECT SEND: Send one email to a specific lead immediately
app.post("/api/leads/:id/send-email", async (req, res) => {
  try {
    // 1. Get the lead
    const { data: lead } = await supabase.from("leads").select("*").eq("id", req.params.id).single();
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    // 2. Get first active account with app_password
    const { data: accounts } = await supabase.from("email_accounts").select("*").eq("status", "active");
    const account = (accounts || []).find(a => a.app_password && a.app_password.length > 0);
    if (!account) return res.status(400).json({ error: "No active email account with app password found" });

    // 3. Generate AI email
    console.log(`\n📧 Direct send to ${lead.name} (${lead.email})...`);
    const emailContent = await generateEmail(
      { name: lead.name, company: lead.company, industry: lead.industry, notes: lead.notes, specialty: lead.specialty, city: lead.city, state: lead.state, npi_number: lead.npi_number, website: lead.website },
      "Direct outreach"
    );

    // 4. Send via SMTP
    const result = await sendEmail(
      account,
      { email: lead.email, name: lead.name },
      emailContent.subject,
      emailContent.body
    );

    if (result.success) {
      // 5. Log & update
      await logEmail(lead.id, null, account.id, emailContent.subject, emailContent.body, "sent", 0);
      await updateLeadStatus(lead.id, "contacted");
      console.log(`   ✅ Sent to ${lead.name}!`);
      res.status(200).json({ success: true, message: `Email sent to ${lead.name}!` });
    } else {
      await logEmail(lead.id, null, account.id, emailContent.subject, emailContent.body, "failed", 0);
      res.status(500).json({ error: result.error || "Send failed" });
    }
  } catch (error) {
    console.error("Direct send error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/leads/bulk", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "Invalid IDs" });
    const { data, error } = await supabase.from("leads").delete().in("id", ids).select();
    if (error) throw error;
    res.status(200).json({ deleted: data ? data.length : ids.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/leads/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("leads").delete().eq("id", req.params.id);
    if (error) throw error;
    res.status(200).json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================
// EMAIL ACCOUNTS API
// ============================
app.get("/api/accounts", async (req, res) => {
  try {
    const { data, error } = await supabase.from("email_accounts")
      .select("id, email, provider, daily_limit, sent_today, status, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    
    const enriched = await Promise.all((data || []).map(async (acc) => ({
      ...acc,
      redis_count: await getDailyCount(acc.id),
      warmup_step: getWarmupStep(acc),
    })));
    
    res.status(200).json({ data: stripPasswords(enriched) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/accounts", [
  body("email").isEmail(),
  body("app_password").notEmpty(),
  validate
], async (req, res) => {
  try {
    const { email, app_password, provider, daily_limit } = req.body;
    const { data, error } = await supabase.from("email_accounts").insert({
      email, app_password, provider: provider || "Gmail", daily_limit: daily_limit || 50, status: "active"
    }).select();
    if (error) throw error;
    res.status(201).json(stripPasswords(data[0]));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/accounts/:id/verify", async (req, res) => {
  try {
    const { data } = await supabase.from("email_accounts").select("*").eq("id", req.params.id).single();
    if (!data) return res.status(404).json({ error: "Not found" });
    const verified = await verifyAccount(data.email, data.app_password, data.provider);
    res.status(200).json({ verified, email: data.email });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/accounts/:id/sync", async (req, res) => {
  try {
    const { data: acc } = await supabase.from("email_accounts").select("*").eq("id", req.params.id).single();
    if (!acc) return res.status(404).json({ error: "Not found" });
    const result = await syncReplies(acc);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/accounts/:id/toggle", async (req, res) => {
  try {
    const { data: acc } = await supabase.from("email_accounts").select("status").eq("id", req.params.id).single();
    if (!acc) return res.status(404).json({ error: "Not found" });
    const newStatus = acc.status === "active" ? "paused" : "active";
    await supabase.from("email_accounts").update({ status: newStatus }).eq("id", req.params.id);
    res.status(200).json({ status: newStatus });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/accounts/:id", async (req, res) => {
  try {
    const { data, error } = await supabase.from("email_accounts").update(req.body).eq("id", req.params.id).select();
    if (error) throw error;
    res.status(200).json(stripPasswords(data[0]));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/accounts/bulk", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "Invalid IDs" });
    const { data, error } = await supabase.from("email_accounts").delete().in("id", ids).select();
    if (error) throw error;
    res.status(200).json({ deleted: data ? data.length : ids.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/accounts/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("email_accounts").delete().eq("id", req.params.id);
    if (error) throw error;
    res.status(200).json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================
// CAMPAIGNS API
// ============================
app.get("/api/campaigns", async (req, res) => {
  try {
    const { data, error } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    res.status(200).json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/campaigns", [body("name").notEmpty(), validate], async (req, res) => {
  try {
    const { name, total_leads, accounts_count, email_template, delay_minutes, max_followups } = req.body;
    const { data, error } = await supabase.from("campaigns").insert({
      name, total_leads: total_leads || 0, accounts_count: accounts_count || 1,
      email_template: email_template || "", delay_minutes: delay_minutes || 3,
      max_followups: max_followups || 2, status: "draft"
    }).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/campaigns/:id/start", async (req, res) => {
  try {
    const { id } = req.params;
    const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", id).single();
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    // Count available new leads  
    const { data: leads } = await supabase.from("leads").select("id").eq("status", "new");
    const leadCount = leads?.length || 0;
    
    if (leadCount === 0) return res.status(400).json({ error: "No new leads available" });

    // Get active accounts count
    const accounts = await getActiveAccounts();
    const totalRounds = Math.ceil(Math.min(leadCount, campaign.total_leads || leadCount) / (accounts.length || 1));

    // Activate the campaign — worker will pick it up automatically
    await supabase.from("campaigns").update({ 
      status: "active", 
      total_leads: Math.min(leadCount, campaign.total_leads || leadCount),
      current_round: 0,
      total_rounds: totalRounds,
      next_round_at: new Date().toISOString(),
      updated_at: new Date().toISOString() 
    }).eq("id", id);

    // Auto-start worker
    ensureWorkerRunning();

    res.status(200).json({ 
      started: true, 
      totalLeads: Math.min(leadCount, campaign.total_leads || leadCount),
      accounts: accounts.length,
      estimatedRounds: totalRounds,
      campaignName: campaign.name 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/campaigns/:id/pause", async (req, res) => {
  try {
    await supabase.from("campaigns").update({ status: "paused", next_round_at: null }).eq("id", req.params.id);
    res.status(200).json({ paused: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/campaigns/:id/toggle", async (req, res) => {
  try {
    const { data: campaign } = await supabase.from("campaigns").select("status").eq("id", req.params.id).single();
    if (!campaign) return res.status(404).json({ error: "Not found" });
    const newStatus = campaign.status === "active" ? "paused" : "active";
    const update = { status: newStatus };
    if (newStatus === "active") update.next_round_at = new Date().toISOString();
    else update.next_round_at = null;
    await supabase.from("campaigns").update(update).eq("id", req.params.id);
    res.status(200).json({ status: newStatus });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/campaigns/bulk", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "Invalid IDs" });
    const { data, error } = await supabase.from("campaigns").delete().in("id", ids).select();
    if (error) throw error;
    res.status(200).json({ deleted: data ? data.length : ids.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/campaigns/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("campaigns").delete().eq("id", req.params.id);
    if (error) throw error;
    res.status(200).json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================
// AI API
// ============================
app.post("/api/ai/generate", async (req, res) => {
  try {
    const { lead, context, type = "initial" } = req.body;
    if (!lead) return res.status(400).json({ error: "Lead info required" });
    let result;
    if (type === "followup") result = await generateFollowUp(lead, req.body.step || 1);
    else if (type === "reply") result = await generateReplySuggestion(req.body.replyText, lead);
    else result = await generateEmail(lead, context);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "AI generation failed" });
  }
});

// ============================
// SPAM CHECK
// ============================
app.post("/api/spam/check", (req, res) => {
  try {
    const { subject, body: b } = req.body;
    const result = checkSpamScore(`${subject} ${b}`);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Spam check failed" });
  }
});

// ============================
// ANALYTICS & STATS
// ============================
app.get("/api/analytics/overview", async (req, res) => {
  try {
    const [leads, activeAcc, activeCamp, sentLogs, repliesData, pendingDelete] = await Promise.all([
      supabase.from("leads").select("id", { count: "exact" }),
      supabase.from("email_accounts").select("id", { count: "exact" }).eq("status", "active"),
      supabase.from("campaigns").select("id", { count: "exact" }).eq("status", "active"),
      supabase.from("email_log").select("id", { count: "exact" }).eq("status", "sent"),
      supabase.from("replies").select("id", { count: "exact" }),
      supabase.from("leads").select("id", { count: "exact" }).not("auto_delete_at", "is", null),
    ]);

    const daily = await getDailyPerformance();
    const queue = await getQueueStatus();

    res.status(200).json({
      totalLeads: leads.count || 0,
      activeAccounts: activeAcc.count || 0,
      activeCampaigns: activeCamp.count || 0,
      totalSent: sentLogs.count || 0,
      totalReplies: repliesData.count || 0,
      replyRate: sentLogs.count > 0 ? ((repliesData.count / sentLogs.count) * 100).toFixed(1) : "0",
      pendingDeletion: pendingDelete.count || 0,
      queueStatus: queue,
      dailyPerformance: daily
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================
// REPLIES API
// ============================
app.get("/api/replies", async (req, res) => {
  try {
    const { data, error } = await supabase.from("replies").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    res.status(200).json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/replies/count", async (req, res) => {
  try {
    const { count, error } = await supabase.from("replies").select("id", { count: "exact" }).eq("is_read", false);
    if (error) throw error;
    res.status(200).json({ unread: count || 0 });
  } catch (error) {
    res.status(200).json({ unread: 0 });
  }
});

app.post("/api/replies/:id/read", async (req, res) => {
  try {
    await supabase.from("replies").update({ is_read: true }).eq("id", req.params.id);
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check all inboxes for new replies (IMAP)
app.post("/api/replies/check", async (req, res) => {
  try {
    const result = await checkAllReplies();
    res.status(200).json(result);
  } catch (error) {
    console.error("Reply check error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/send-email", async (req, res) => {
  try {
    const { leadId, subject, body: b } = req.body;
    const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).single();
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    await addToQueue({
      leadId: lead.id, leadName: lead.name, leadEmail: lead.email,
      leadCompany: lead.company, leadIndustry: lead.industry, subject, body: b
    });
    res.status(200).json({ success: true, message: "Email queued" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================
// MONTHLY REPORT API
// ============================
app.get("/api/reports/monthly", async (req, res) => {
  try {
    const { month } = req.query; // format: 2026-03
    const startDate = month ? `${month}-01` : new Date().toISOString().slice(0, 8) + "01";
    const endMonth = month || new Date().toISOString().slice(0, 7);
    const [year, mon] = endMonth.split("-").map(Number);
    const endDate = new Date(year, mon, 0).toISOString().split("T")[0]; // last day of month

    // Fetch all data for the month
    const [sentResult, repliesResult, campaignsResult, accountsResult, leadsResult] = await Promise.all([
      supabase.from("email_log").select("*").gte("sent_at", startDate + "T00:00:00Z").lte("sent_at", endDate + "T23:59:59Z"),
      supabase.from("replies").select("*, leads(name, company, industry, specialty, npi_number, state, city)").gte("created_at", startDate + "T00:00:00Z").lte("created_at", endDate + "T23:59:59Z"),
      supabase.from("campaigns").select("*"),
      supabase.from("email_accounts").select("id, email, sent_today, daily_limit, status"),
      supabase.from("leads").select("id, name, email, specialty, npi_number, state, city, status, followup_count"),
    ]);

    const sent = sentResult.data || [];
    const replies = repliesResult.data || [];
    const campaigns = campaignsResult.data || [];
    const accounts = accountsResult.data || [];
    const leads = leadsResult.data || [];

    const totalSent = sent.filter(s => s.status === "sent" && (s.followup_number || 0) === 0).length;
    const totalFollowups = sent.filter(s => s.status === "sent" && (s.followup_number || 0) > 0).length;
    const failed = sent.filter(s => s.status === "failed").length;

    // Daily breakdown
    const dailyBreakdown = {};
    sent.forEach(s => {
      const day = s.sent_at?.split("T")[0];
      if (day) {
        if (!dailyBreakdown[day]) dailyBreakdown[day] = { sent: 0, followups: 0 };
        if (s.status === "sent" && (s.followup_number || 0) === 0) dailyBreakdown[day].sent++;
        else if (s.status === "sent" && (s.followup_number || 0) > 0) dailyBreakdown[day].followups++;
      }
    });

    // Daily replies
    replies.forEach(r => {
      const day = r.created_at?.split("T")[0];
      if (day) {
        if (!dailyBreakdown[day]) dailyBreakdown[day] = { sent: 0, followups: 0 };
        dailyBreakdown[day].replies = (dailyBreakdown[day].replies || 0) + 1;
      }
    });

    // Campaign breakdown
    const campaignBreakdown = campaigns.map(c => ({
      name: c.name,
      status: c.status,
      total_leads: c.total_leads || 0,
      emails_sent: c.emails_sent || 0,
      followups_sent: c.followups_sent || 0,
      replies: c.replies || 0,
      reply_rate: c.emails_sent > 0 ? ((c.replies / c.emails_sent) * 100).toFixed(1) + "%" : "0%"
    }));

    // Account performance
    const accountPerformance = await Promise.all(accounts.map(async (acc) => {
      const accSent = sent.filter(s => s.account_id === acc.id && s.status === "sent").length;
      const accFailed = sent.filter(s => s.account_id === acc.id && s.status === "failed").length;
      return {
        email: acc.email,
        total_sent: accSent,
        failures: accFailed,
        success_rate: accSent > 0 ? (((accSent - accFailed) / accSent) * 100).toFixed(1) + "%" : "100%",
        status: acc.status
      };
    }));

    // Doctor-specific lead report (per-lead detail for CSV download)
    const replyMap = {};
    replies.forEach(r => {
      if (r.lead_id) {
        replyMap[r.lead_id] = { replied: true, reply_date: r.created_at?.split("T")[0] || "" };
      }
    });

    const leadReport = leads.map(lead => {
      const leadSent = sent.filter(s => s.lead_id === lead.id && s.status === "sent");
      const leadFailed = sent.filter(s => s.lead_id === lead.id && s.status === "failed");
      const followupsSent = leadSent.filter(s => (s.followup_number || 0) > 0).length;
      const replyInfo = replyMap[lead.id] || { replied: false, reply_date: "" };

      return {
        doctor_name: lead.name,
        email: lead.email,
        specialty: lead.specialty || "",
        npi_number: lead.npi_number || "",
        state: lead.state || "",
        city: lead.city || "",
        email_status: leadSent.length > 0 ? "Sent" : leadFailed.length > 0 ? "Failed" : "Pending",
        followups_sent: followupsSent,
        replied: replyInfo.replied ? "Yes" : "No",
        reply_date: replyInfo.reply_date,
      };
    });

    // Top leads (those who replied)
    const topLeads = replies.map(r => ({
      name: r.leads?.name || r.from_name,
      specialty: r.leads?.specialty || "",
      company: r.leads?.company || "",
      industry: r.leads?.industry || "",
      reply_preview: (r.body || "").substring(0, 100),
      date: r.created_at?.split("T")[0]
    }));

    res.status(200).json({
      reportPeriod: `${startDate} to ${endDate}`,
      summary: {
        totalEmailsSent: totalSent,
        totalFollowupsSent: totalFollowups,
        totalReplies: replies.length,
        replyRate: totalSent > 0 ? ((replies.length / totalSent) * 100).toFixed(1) + "%" : "0%",
        bounceRate: totalSent > 0 ? ((failed / totalSent) * 100).toFixed(1) + "%" : "0%",
      },
      campaignBreakdown,
      accountPerformance,
      leadReport,
      topLeads,
      dailyBreakdown: Object.entries(dailyBreakdown).sort().map(([day, stats]) => ({
        date: day, sent: stats.sent, followups: stats.followups || 0, replies: stats.replies || 0,
        rate: stats.sent > 0 ? ((stats.replies || 0) / stats.sent * 100).toFixed(1) + "%" : "0%"
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================
// SETTINGS API
// ============================
app.get("/api/settings", async (req, res) => {
  try {
    const { data, error } = await supabase.from("app_settings").select("*");
    if (error) throw error;
    const settings = {};
    (data || []).forEach(s => settings[s.key] = s.value);
    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/settings", async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      await supabase.from("app_settings").upsert({ key, value: String(value) }, { onConflict: "key" });
    }
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================
// TEMPLATES API
// ============================
app.get("/api/templates", (req, res) => {
  res.status(200).json({ data: templates });
});

// ============================
// QUEUE STATUS
// ============================
app.get("/api/queue/status", async (req, res) => {
  try {
    const status = await getQueueStatus();
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================
// ERROR HANDLER & START
// ============================
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`
  🚀 OutreachAI v2 Engine Running
  🌐 API: http://localhost:${PORT}
  🛡️ Security: Enabled (Helmet/Rate-Limit)
  📦 Compression: Enabled
  🔌 Connected: Supabase, Redis, OpenAI
  `);
});

export default app;
