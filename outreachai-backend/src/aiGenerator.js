import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================================
// CureBridge RCM — AI Email Generator
// Generates personalized cold emails for doctor outreach
// ============================================================

const CUREBRIDGE_SYSTEM_PROMPT = `You are an expert email copywriter for CureBridge RCM (https://curebridgercm.com/), a medical billing, credentialing, and revenue cycle management company with over 16 years of experience.
You are writing personalized cold emails to doctors and healthcare providers.

COMPANY INFO:
- Company: CureBridge RCM
- Services: Medical Billing, Credentialing, Revenue Cycle Management, Claim Submission, Denial Management, Payer Follow-ups, Reporting
- Website: https://curebridgercm.com/
- Contact Email: info@curebridgercm.com
- Sender Name: Adnan Malik
- Experience: 16+ years in medical billing

RULES FOR EMAIL:
1. Start with "Dear Dr. [Last Name]" (extract last name from full name)
2. Opening line should reference their SPECIFIC specialty and location
3. Mention how billing challenges affect their specific specialty
4. Highlight CureBridge RCM services relevant to their specialty
5. Keep it professional but warm
6. End with call-to-action: schedule a 10-15 minute call
7. Sign off as Adnan Malik, CureBridge RCM
8. Include contact info in signature
9. Keep under 150 words
10. Each email must be UNIQUE — never repeat the same opening line

EMAIL SIGNATURE (always include this exact signature):
Best regards,
Adnan Malik
CureBridge RCM
📧 info@curebridgercm.com
🌐 https://curebridgercm.com/

EXAMPLE EMAIL (use as reference for tone and style):
Dear Dr. James,

I hope you are doing well. My name is Malik, and my team specializes in medical billing, credentialing, and revenue cycle management for independent practices like yours, drawing on over 16 years of experience.

We understand how time-consuming billing and payer follow-ups can be, especially for Family Medicine providers who want to stay focused on patient care. Our team can handle everything from claim submission and denial management to credentialing and reporting — ensuring faster reimbursements and fewer administrative burdens.

If you're open to exploring this, I'd love to schedule a quick call to review your current process and show how we can help improve cash flow while reducing overhead costs.

Would you like to schedule a short 10–15-minute chat?

Looking forward to connecting,

Best regards,
Adnan Malik
CureBridge RCM
📧 info@curebridgercm.com
🌐 https://curebridgercm.com/`;

/**
 * Get specialty-specific pain points for personalized emails
 */
function getSpecialtyContext(specialty) {
  const contexts = {
    "Family Medicine": "billing challenges unique to family medicine, including high patient volumes, diverse CPT codes across preventative and acute care, and complex payer mix with both commercial and government plans",
    "Internal Medicine": "internist-specific billing complexities like E/M coding for complex patients, chronic care management billing, and ensuring proper reimbursement for extended office visits",
    "Primary Care": "primary care billing demands including high-volume claim submission, preventive care coding, and managing the growing administrative burden that takes time away from patient relationships",
    "Pediatrics": "pediatric-specific billing challenges including vaccine administration coding, well-child visit documentation, and navigating Medicaid reimbursement complexities",
    "Cardiology": "cardiology-specific billing complexities including procedural coding for catheterizations, echocardiograms, and stress tests, plus prior authorization management for cardiac procedures",
    "Orthopedics": "orthopedic billing challenges including surgical coding complexities, DME billing, physical therapy authorization, and managing high-value procedure reimbursements",
    "Dermatology": "dermatology coding challenges including procedure-specific modifiers for biopsies and excisions, cosmetic vs medical billing distinctions, and pathology claim coordination",
    "OB/GYN": "OB/GYN billing complexities including global obstetric coding, antepartum visit bundling, and navigating the unique reimbursement landscape for women's health services",
    "Psychiatry": "psychiatric billing challenges including time-based coding for therapy sessions, telehealth billing nuances, and complex prior authorization requirements for behavioral health",
    "Neurology": "neurology-specific billing complexities including EEG and EMG procedural coding, diagnostic testing reimbursement, and managing prior authorizations for advanced imaging",
    "Gastroenterology": "GI-specific billing challenges including endoscopy coding, pathology coordination, and ensuring proper reimbursement for screening vs diagnostic procedures",
    "Pulmonology": "pulmonology billing complexities including PFT procedure coding, sleep study reimbursement, and navigating complex DME billing for respiratory equipment",
    "Endocrinology": "endocrinology billing challenges including chronic disease management coding, diabetes education reimbursement, and proper E/M documentation for complex hormonal conditions",
    "Rheumatology": "rheumatology-specific billing complexities including biologic medication administration coding, infusion billing, and prior authorization management for specialty drugs",
    "Oncology": "oncology billing challenges including chemotherapy administration coding, drug reimbursement complexities, and managing the high volume of prior authorizations for cancer treatments",
    "Urology": "urology-specific billing challenges including procedural coding for cystoscopies and lithotripsy, surgical modifier management, and DME billing coordination",
  };
  return contexts[specialty] || "the unique billing challenges in your specialty, including claim submissions, denial management, and administrative overhead that takes time away from patient care";
}

/**
 * Generate a personalized cold email for a doctor/provider lead
 * @param {Object} lead - { name, email, company, specialty, city, state, npi_number, website, notes }
 * @param {string} campaignContext - What the campaign is about
 * @returns {Object} - { subject, body }
 */
export async function generateEmail(lead, campaignContext = "") {
  try {
    const lastName = (lead.name || "Doctor").split(" ").pop();
    const specialtyContext = getSpecialtyContext(lead.specialty);

    const userPrompt = `Now generate a UNIQUE personalized email for the given doctor.

LEAD INFO:
- Doctor Name: ${lead.name}
- Specialty: ${lead.specialty || "General Practice"}
- Practice/Company: ${lead.company || "Independent Practice"}
- City: ${lead.city || ""}
- State: ${lead.state || ""}
- NPI: ${lead.npi_number || ""}
- Website: ${lead.website || ""}

The opening must reference their specific specialty: ${lead.specialty || "medical practice"}.
Specialty context to weave in: ${specialtyContext}

If they have a city/state, reference their location in the opening.
EACH EMAIL MUST BE DIFFERENT — use a unique opening line.

Return ONLY JSON: {"subject": "...", "body": "HTML with <p> tags"}
No markdown, no code blocks, just the JSON.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: CUREBRIDGE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.85,
      max_tokens: 700,
    });

    const text = response.choices[0].message.content.trim();
    
    // Parse JSON (handle potential markdown wrapping)
    const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const result = JSON.parse(clean);

    console.log(`🤖 AI generated CureBridge email for ${lead.name}: "${result.subject}"`);

    return result;
  } catch (error) {
    console.error("❌ AI email generation failed:", error.message);
    
    // CureBridge-branded fallback template
    const lastName = (lead.name || "Doctor").split(" ").pop();
    const specialty = lead.specialty || "medical";
    const location = [lead.city, lead.state].filter(Boolean).join(", ");
    const locationText = location ? ` in ${location}` : "";

    return {
      subject: `Streamline Your ${specialty} Billing — CureBridge RCM`,
      body: `<p>Dear Dr. ${lastName},</p>
<p>I hope you are doing well. My name is Malik, and my team at CureBridge RCM specializes in medical billing, credentialing, and revenue cycle management for ${specialty} practices${locationText}, drawing on over 16 years of experience.</p>
<p>We understand how time-consuming billing and payer follow-ups can be for ${specialty} providers. Our team can handle everything from claim submission and denial management to credentialing and reporting — ensuring faster reimbursements and fewer administrative burdens.</p>
<p>Would you be open to a quick 10–15-minute call to explore how we can help?</p>
<p>Looking forward to connecting,</p>
<p>Best regards,<br>Adnan Malik<br>CureBridge RCM<br>📧 info@curebridgercm.com<br>🌐 https://curebridgercm.com/</p>`,
    };
  }
}

/**
 * Generate a CureBridge-branded follow-up email
 * @param {Object} lead 
 * @param {number} followUpNumber - 1st, 2nd, or 3rd follow-up
 * @param {string} originalSubject - Original email subject for "Re:" threading
 * @returns {Object} - { subject, body }
 */
export async function generateFollowUp(lead, followUpNumber = 1, originalSubject = "") {
  try {
    const lastName = (lead.name || "Doctor").split(" ").pop();
    const specialty = lead.specialty || lead.industry || "healthcare";

    const followUpInstructions = {
      1: `Follow-up #1 (7 days after initial): Gentle reminder. Mention a SPECIFIC benefit for ${specialty} practices. Keep it short and friendly. Reference the previous email. Under 80 words.`,
      2: `Follow-up #2 (14 days after initial): Share a quick stat about revenue improvement. For example, mention how practices save 15-20% on overhead or see 30% faster reimbursements. Under 80 words.`,
      3: `Follow-up #3 (21 days after initial): Final breakup email. Professional and respectful. Let them know this is the last email. Leave the door open. Under 60 words.`,
    };

    const prompt = `Write a follow-up email from Adnan Malik at CureBridge RCM to Dr. ${lastName}.

${followUpInstructions[followUpNumber] || followUpInstructions[1]}

Doctor: Dr. ${lead.name}
Specialty: ${specialty}
Practice: ${lead.company || "Independent Practice"}

ALWAYS include the CureBridge signature:
Best regards,
Adnan Malik
CureBridge RCM
📧 info@curebridgercm.com
🌐 https://curebridgercm.com/

Return ONLY JSON: { "subject": "Re: ...", "body": "HTML with <p> tags" }`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: CUREBRIDGE_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 400,
    });

    const text = response.choices[0].message.content.trim();
    const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const result = JSON.parse(clean);

    // Ensure subject starts with "Re:" for proper threading
    if (!result.subject.toLowerCase().startsWith("re:")) {
      result.subject = `Re: ${originalSubject || result.subject}`;
    }

    return result;
  } catch (error) {
    console.error("❌ Follow-up generation failed:", error.message);
    const lastName = (lead.name || "Doctor").split(" ").pop();
    const followUpBodies = {
      1: `<p>Dear Dr. ${lastName},</p><p>I wanted to follow up on my previous email about streamlining your billing operations. Many practices like yours have seen significant improvements in cash flow after partnering with CureBridge RCM.</p><p>Would you have 10 minutes this week for a quick call?</p><p>Best regards,<br>Adnan Malik<br>CureBridge RCM<br>📧 info@curebridgercm.com<br>🌐 https://curebridgercm.com/</p>`,
      2: `<p>Dear Dr. ${lastName},</p><p>Quick follow-up — practices working with CureBridge RCM typically see 25-30% faster reimbursements and a significant reduction in claim denials. I'd love to show you how we can achieve similar results for your practice.</p><p>Best regards,<br>Adnan Malik<br>CureBridge RCM<br>📧 info@curebridgercm.com<br>🌐 https://curebridgercm.com/</p>`,
      3: `<p>Dear Dr. ${lastName},</p><p>I understand you're busy, so this will be my last email. If you ever need help with medical billing, credentialing, or revenue cycle management, please don't hesitate to reach out. We're here whenever you're ready.</p><p>Wishing you and your practice all the best,</p><p>Best regards,<br>Adnan Malik<br>CureBridge RCM<br>📧 info@curebridgercm.com<br>🌐 https://curebridgercm.com/</p>`,
    };
    return {
      subject: `Re: CureBridge RCM — Billing Support for Your Practice`,
      body: followUpBodies[followUpNumber] || followUpBodies[1],
    };
  }
}

/**
 * Generate an AI reply suggestion — CureBridge branded
 * @param {string} originalBody - The reply we received
 * @param {Object} lead 
 * @returns {string} - Suggested reply
 */
export async function generateReplySuggestion(originalBody, lead) {
  try {
    const lastName = (lead.name || "Doctor").split(" ").pop();
    const prompt = `A doctor replied to our CureBridge RCM outreach email. Suggest a professional reply from Adnan Malik.

Doctor: Dr. ${lead.name}
Specialty: ${lead.specialty || lead.industry || "General Practice"}
Their reply: "${originalBody}"

Write a friendly, professional response under 80 words. Always sign off as Adnan Malik, CureBridge RCM.
Include the full signature block.
Return only the reply text in HTML with <p> tags.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: CUREBRIDGE_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    return `<p>Dear Dr. ${(lead.name || "").split(" ").pop()},</p><p>Thank you for your response! I'd love to schedule a quick call to discuss how CureBridge RCM can help streamline your billing operations. What time works best for you?</p><p>Best regards,<br>Adnan Malik<br>CureBridge RCM<br>📧 info@curebridgercm.com<br>🌐 https://curebridgercm.com/</p>`;
  }
}

export default { generateEmail, generateFollowUp, generateReplySuggestion };
