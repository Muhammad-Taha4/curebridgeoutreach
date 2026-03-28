import dotenv from "dotenv";
dotenv.config();

/**
 * ===================================================
 * OutreachAI Setup Checker
 * Run this to verify all your connections work
 * Command: npm run setup
 * ===================================================
 */

console.log(`
╔═══════════════════════════════════════════╗
║     OutreachAI Setup Checker              ║
╚═══════════════════════════════════════════╝
`);

let allGood = true;

// 1. Check Supabase
console.log("1️⃣  Checking Supabase...");
try {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await sb.from("app_settings").select("key").limit(1);
  if (error) throw error;
  console.log("   ✅ Supabase connected!\n");
} catch (e) {
  console.log(`   ❌ Supabase failed: ${e.message}\n`);
  allGood = false;
}

// 2. Check Redis
console.log("2️⃣  Checking Upstash Redis...");
try {
  const { Redis } = await import("@upstash/redis");
  const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
  await redis.set("setup_check", "ok");
  const val = await redis.get("setup_check");
  if (val !== "ok") throw new Error("Read/write failed");
  await redis.del("setup_check");
  console.log("   ✅ Redis connected!\n");
} catch (e) {
  console.log(`   ❌ Redis failed: ${e.message}\n`);
  allGood = false;
}

// 3. Check OpenAI
console.log("3️⃣  Checking OpenAI...");
try {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Say 'ok' and nothing else." }],
    max_tokens: 5,
  });
  if (res.choices[0].message.content) {
    console.log("   ✅ OpenAI connected!\n");
  }
} catch (e) {
  console.log(`   ❌ OpenAI failed: ${e.message}\n`);
  allGood = false;
}

// 4. Check Environment Variables
console.log("4️⃣  Checking Environment Variables...");
const required = [
  "SUPABASE_URL", "SUPABASE_SERVICE_KEY",
  "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN",
  "OPENAI_API_KEY",
];
const missing = required.filter(k => !process.env[k]);
if (missing.length === 0) {
  console.log("   ✅ All required env vars present!\n");
} else {
  console.log(`   ❌ Missing: ${missing.join(", ")}\n`);
  allGood = false;
}

// Summary
console.log("═══════════════════════════════════════════");
if (allGood) {
  console.log("🎉 ALL CHECKS PASSED! You're ready to go!");
  console.log("\nNext steps:");
  console.log("  1. Start API server:  npm start");
  console.log("  2. Start worker:      npm run worker");
  console.log("  3. Open frontend and start a campaign!");
} else {
  console.log("⚠️  Some checks failed. Fix the issues above.");
  console.log("\nCommon fixes:");
  console.log("  - Check .env file has all keys");
  console.log("  - Verify API keys are valid");
  console.log("  - Make sure Supabase tables are created");
}
console.log("═══════════════════════════════════════════\n");

process.exit(allGood ? 0 : 1);
