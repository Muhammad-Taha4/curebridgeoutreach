import { Redis } from "@upstash/redis";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  throw new Error("❌ CRITICAL: Missing Upstash Redis environment variables.");
}

const redis = new Redis({ url, token });

export default redis;

// ===== QUEUE OPERATIONS =====

/**
 * Add an email job to the queue
 */
export async function addToQueue(job) {
  try {
    const jobData = JSON.stringify({
      ...job,
      id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      addedAt: Date.now(),
      status: "pending",
    });
    await redis.lpush("email_queue", jobData);
    console.log(`📋 Job added to queue: ${job.leadEmail}`);
    return true;
  } catch (error) {
    console.error("❌ Queue add failed:", error.message);
    return false;
  }
}

/**
 * Get next job from queue
 */
export async function getNextJob() {
  try {
    const job = await redis.rpop("email_queue");
    if (!job) return null;
    return typeof job === "string" ? JSON.parse(job) : job;
  } catch (error) {
    console.error("❌ Queue pop failed:", error.message);
    return null;
  }
}

/**
 * Get queue length
 */
export async function getQueueLength() {
  try {
    return await redis.llen("email_queue") || 0;
  } catch (error) {
    return 0;
  }
}

// ===== RATE LIMITING =====

/**
 * Check if account can send (under daily limit)
 * @param {string} accountId 
 * @param {number} dailyLimit 
 * @returns {boolean}
 */
export async function canAccountSend(accountId, dailyLimit = 50) {
  try {
    const key = `daily_count:${accountId}`;
    const count = (await redis.get(key)) || 0;
    return parseInt(count) < dailyLimit;
  } catch (error) {
    console.error("❌ Rate check failed:", error.message);
    return true; // allow on error
  }
}

/**
 * Increment account's daily send count
 */
export async function incrementDailyCount(accountId) {
  try {
    const key = `daily_count:${accountId}`;
    await redis.incr(key);
    // Set expiry to end of day (24 hours from now as safety)
    await redis.expire(key, 86400);
  } catch (error) {
    console.error("❌ Count increment failed:", error.message);
  }
}

/**
 * Get account's daily send count
 */
export async function getDailyCount(accountId) {
  try {
    const key = `daily_count:${accountId}`;
    return parseInt(await redis.get(key)) || 0;
  } catch (error) {
    return 0;
  }
}

// ===== DELAY TRACKING =====

/**
 * Check if enough time has passed since last send from this account
 * @param {string} accountId 
 * @param {number} delayMinutes - Minimum delay in minutes
 * @returns {boolean}
 */
export async function hasDelayPassed(accountId, delayMinutes = 3) {
  try {
    const key = `last_sent:${accountId}`;
    const lastSent = await redis.get(key);
    
    if (!lastSent) return true;
    
    const elapsed = Date.now() - parseInt(lastSent);
    const requiredDelay = delayMinutes * 60 * 1000;
    
    return elapsed >= requiredDelay;
  } catch (error) {
    return true; // allow on error
  }
}

/**
 * Record that account just sent an email
 */
export async function recordSendTime(accountId) {
  try {
    const key = `last_sent:${accountId}`;
    await redis.set(key, Date.now().toString());
    await redis.expire(key, 3600); // expire in 1 hour
  } catch (error) {
    console.error("❌ Record send time failed:", error.message);
  }
}

// ===== RESET =====

/**
 * Reset all daily counts (call at midnight via cron)
 */
export async function resetAllDailyCounts(accountIds) {
  try {
    for (const id of accountIds) {
      await redis.del(`daily_count:${id}`);
    }
    console.log("✅ All daily counts reset in Redis");
  } catch (error) {
    console.error("❌ Redis reset failed:", error.message);
  }
}

/**
 * Clear entire queue
 */
export async function clearQueue() {
  try {
    await redis.del("email_queue");
    console.log("✅ Queue cleared");
  } catch (error) {
    console.error("❌ Clear queue failed:", error.message);
  }
}

// ===== STATUS =====

/**
 * Get queue status overview
 */
export async function getQueueStatus() {
  try {
    const queueLength = await getQueueLength();
    return { queueLength, timestamp: new Date().toISOString() };
  } catch (error) {
    return { queueLength: 0, error: error.message };
  }
}
