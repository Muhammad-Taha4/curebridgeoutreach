import 'dotenv/config';
import { syncReplies } from './replyChecker.js';
import { runWarmup } from './warmup.js';
import { getOverviewStats } from './analytics.js';
import { processFollowups } from './followup.js';

/**
 * OutreachAI Cron Scheduler
 * Runs periodic maintenance and automation tasks.
 */

async function main() {
  console.log('--- OutreachAI Cron Scheduler Started ---');
  console.log(`Time: ${new Date().toISOString()}`);

  // 1. Initial run
  await runMaintenanceTasks();

  // 2. Poll every hour (or faster for demo)
  const POLL_INTERVAL = 60 * 60 * 1000; // 1 hour
  setInterval(async () => {
    await runMaintenanceTasks();
  }, POLL_INTERVAL);
}

async function runMaintenanceTasks() {
  console.log(`[${new Date().toLocaleTimeString()}] Running maintenance tasks...`);
  
  try {
    // A. Check for inbox replies (sync for first account)
    console.log(' - Syncing replies for first account...');
    await syncReplies({ email: 'default@outreach.com' });

    // B. Run account warmups
    console.log(' - Running account warmups...');
    await runWarmup();

    // C. Process Follow-ups
    console.log(' - Processing follow-ups...');
    await processFollowups();

    // D. (Optional) In-memory daily report log
    const stats = await getOverviewStats();
    console.log(` - System Status: ${stats.totalLeads} leads, ${stats.totalSent} emails sent.`);
    
    console.log('Maintenance completed successfully.');
  } catch (err) {
    console.error('CRON ERROR:', err.message);
  }
}

main().catch(err => {
  console.error('CRON FATAL ERROR:', err);
  process.exit(1);
});
