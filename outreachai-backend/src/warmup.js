
import supabase from "./db.js";

/**
 * Account Warmup Module
 * Gradually increases the daily send volume of new email accounts
 */

/**
 * Suggest a daily limit for account warmup
 * @param {string} accountId 
 * @param {number} startDay - Day 1, 2, 3...
 * @returns {number} - Daily limit
 */
export async function calculateWarmupLimit(accountId, startDay = 1) {
  // Simple warmup curve: starts at 5, increases by 5 each day until it hit 50
  const limit = Math.min(5 * startDay, 50);
  
  try {
    await supabase.from("email_accounts").update({
      daily_limit: limit,
      updated_at: new Date().toISOString()
    }).eq("id", accountId);
    
    return limit;
  } catch (error) {
    return 5;
  }
}

/**
 * Get the current warmup step for an account
 * @param {Object} account 
 * @returns {number} - Days active
 */
export function getWarmupStep(account) {
  const created = new Date(account.created_at);
  const diffDays = Math.ceil((Date.now() - created) / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

/**
 * Run warmup for all active accounts
 */
export async function runWarmup() {
  try {
    const { data: accounts } = await supabase.from("email_accounts").select("*").eq("status", "active");
    for (const acc of (accounts || [])) {
      const step = getWarmupStep(acc);
      await calculateWarmupLimit(acc.id, step);
    }
    console.log(`✅ Warmup check completed for ${accounts?.length || 0} accounts.`);
  } catch (error) {
    console.error("Warmup run failed:", error.message);
  }
}

// End of module
