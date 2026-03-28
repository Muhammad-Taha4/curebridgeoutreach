import Imap from "imap";
import { simpleParser } from "mailparser";
import supabase, { getActiveAccounts, updateLeadStatus, saveReply } from "./db.js";

/**
 * Reply Checker Module — Real IMAP Implementation
 * Connects to Gmail IMAP, reads unread emails, matches to leads
 */

/**
 * Create IMAP connection for a Gmail account
 */
function createImapConnection(email, appPassword) {
  return new Imap({
    user: email,
    password: appPassword,
    host: "imap.gmail.com",
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    connTimeout: 15000,
    authTimeout: 10000,
  });
}

/**
 * Fetch unread messages from inbox via IMAP
 */
function fetchUnreadMessages(email, appPassword) {
  return new Promise((resolve) => {
    const imap = createImapConnection(email, appPassword);
    const messages = [];
    let messageCount = 0;
    let parsedCount = 0;

    imap.once("ready", () => {
      imap.openBox("INBOX", false, (err, box) => {
        if (err) {
          console.error(`   ❌ Cannot open INBOX for ${email}:`, err.message);
          imap.end();
          resolve([]);
          return;
        }

        // Search for unread emails from the last 7 days
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - 7);

        imap.search(["UNSEEN", ["SINCE", sinceDate]], (err, results) => {
          if (err) {
            console.error(`   ❌ Search failed for ${email}:`, err.message);
            imap.end();
            resolve([]);
            return;
          }

          if (!results || results.length === 0) {
            console.log(`   📭 No unread emails for ${email}`);
            imap.end();
            resolve([]);
            return;
          }

          console.log(`   📬 Found ${results.length} unread email(s) for ${email}`);
          messageCount = results.length;

          const fetch = imap.fetch(results, { bodies: "", markSeen: false });

          fetch.on("message", (msg) => {
            msg.on("body", (stream) => {
              simpleParser(stream, (err, parsed) => {
                parsedCount++;
                if (!err && parsed) {
                  messages.push({
                    fromEmail: parsed.from?.value?.[0]?.address || "",
                    fromName: parsed.from?.value?.[0]?.name || parsed.from?.text || "",
                    subject: parsed.subject || "(No Subject)",
                    body: parsed.text || "",
                    html: parsed.html || "",
                    date: parsed.date || new Date(),
                    messageId: parsed.messageId || "",
                    inReplyTo: parsed.inReplyTo || "",
                  });
                }
                // Check if all messages are parsed
                if (parsedCount >= messageCount) {
                  imap.end();
                }
              });
            });
          });

          fetch.once("error", (err) => {
            console.error(`   ❌ Fetch error:`, err.message);
            imap.end();
          });

          fetch.once("end", () => {
            // Wait a bit for all parsers to finish
            setTimeout(() => {
              if (messages.length > 0 || parsedCount >= messageCount) {
                resolve(messages);
              }
            }, 2000);
          });
        });
      });
    });

    imap.once("error", (err) => {
      console.error(`   ❌ IMAP error for ${email}:`, err.message);
      resolve([]); // Don't crash
    });

    imap.once("end", () => {
      // Resolve after a delay to let any remaining parsers complete
      setTimeout(() => resolve(messages), 500);
    });

    try {
      imap.connect();
    } catch (err) {
      console.error(`   ❌ IMAP connect failed for ${email}:`, err.message);
      resolve([]);
    }
  });
}

/**
 * Sync replies for a single email account
 */
export async function syncReplies(account) {
  if (!account || !account.email || !account.app_password) {
    console.log(`   ⚠️ Skipping ${account?.email || "unknown"} — no app_password`);
    return { synced: 0, account: account?.email };
  }

  try {
    console.log(`   🔍 Checking inbox: ${account.email}...`);
    const messages = await fetchUnreadMessages(account.email, account.app_password);

    if (messages.length === 0) {
      return { synced: 0, account: account.email };
    }

    // Get all lead emails for matching
    const { data: leads } = await supabase.from("leads").select("id, email, name, status");
    const leadMap = {};
    (leads || []).forEach((l) => {
      leadMap[l.email.toLowerCase()] = l;
    });

    let savedCount = 0;

    for (const msg of messages) {
      const senderEmail = msg.fromEmail.toLowerCase();

      // Check if sender is one of our leads
      const matchedLead = leadMap[senderEmail];
      if (!matchedLead) continue; // Not from a lead, skip

      // Check for duplicate (same sender email + similar subject)
      const { data: existing } = await supabase
        .from("replies")
        .select("id")
        .eq("from_email", senderEmail)
        .limit(1);

      // Also check by messageId if available
      let isDuplicate = existing && existing.length > 0;
      if (msg.messageId && !isDuplicate) {
        const { data: byMsgId } = await supabase
          .from("replies")
          .select("id")
          .eq("message_id", msg.messageId)
          .limit(1);
        isDuplicate = byMsgId && byMsgId.length > 0;
      }

      if (isDuplicate) {
        console.log(`   ⏭️ Duplicate reply from ${senderEmail}, skipping`);
        continue;
      }

      // Find which campaign this reply belongs to
      const { data: logs } = await supabase
        .from("email_log")
        .select("campaign_id")
        .eq("lead_id", matchedLead.id)
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(1);

      const campaignId = logs?.[0]?.campaign_id || null;

      // Save the reply
      const replyData = {
        from_name: msg.fromName || senderEmail,
        from_email: senderEmail,
        subject: msg.subject,
        body: msg.body || msg.html || "",
        lead_id: matchedLead.id,
        campaign_id: campaignId,
        is_read: false,
      };

      // Try adding message_id column (may not exist)
      try {
        replyData.message_id = msg.messageId;
      } catch (e) {}

      const { error } = await supabase.from("replies").insert(replyData);
      if (error) {
        // Retry without message_id
        delete replyData.message_id;
        await supabase.from("replies").insert(replyData);
      }

      // Update lead status to replied
      await updateLeadStatus(matchedLead.id, "replied");

      // Clear follow-up schedule
      await supabase
        .from("email_log")
        .update({ next_followup_at: null })
        .eq("lead_id", matchedLead.id);

      // Clear auto-delete timer
      await supabase
        .from("leads")
        .update({ auto_delete_at: null })
        .eq("id", matchedLead.id);

      savedCount++;
      console.log(`   ✅ Reply saved from ${msg.fromName} (${senderEmail}): "${msg.subject}"`);
    }

    return { synced: savedCount, checked: messages.length, account: account.email };
  } catch (error) {
    console.error(`   ❌ Sync failed for ${account.email}:`, error.message);
    return { synced: 0, error: error.message, account: account.email };
  }
}

/**
 * Check ALL active accounts for replies
 */
export async function checkAllReplies() {
  console.log("\n📬 Checking all inboxes for replies...");
  const accounts = await getActiveAccounts();

  // Get full account data including app_password
  const { data: fullAccounts } = await supabase
    .from("email_accounts")
    .select("*")
    .eq("status", "active");

  if (!fullAccounts || fullAccounts.length === 0) {
    console.log("   ⚠️ No active accounts to check");
    return { checked: 0, newReplies: 0 };
  }

  let totalNew = 0;
  let totalChecked = 0;

  for (const acc of fullAccounts) {
    if (!acc.app_password) continue;
    const result = await syncReplies(acc);
    totalNew += result.synced || 0;
    totalChecked++;
  }

  console.log(`📬 Reply check complete: ${totalChecked} account(s) checked, ${totalNew} new replies found\n`);
  return { checked: totalChecked, newReplies: totalNew };
}

export default { syncReplies, checkAllReplies };
