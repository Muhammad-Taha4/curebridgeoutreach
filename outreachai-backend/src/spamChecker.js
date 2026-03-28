
/**
 * Spam Checker Module
 * Analyzes email content for potential spam trigger words
 */

const spamTriggers = [
  "free", "guarantee", "congratulations", "win", "prize", "urgent",
  "buy now", "click here", "cash", "save money", "best price",
  "get rich", "miracle", "risk free", "limited time", "act now"
];

/**
 * Check if email content has spam triggers
 * @param {string} content 
 * @returns {Object} - { isSpammy, score, triggers }
 */
export function checkSpamScore(content) {
  if (!content) return { isSpammy: false, score: 0, triggers: [] };
  
  const contentLower = content.toLowerCase();
  const triggersFound = spamTriggers.filter(trigger => contentLower.includes(trigger));
  
  const score = triggersFound.length;
  const isSpammy = score > 3;

  return { isSpammy, score, triggersFound };
}

export default { checkSpamScore };
