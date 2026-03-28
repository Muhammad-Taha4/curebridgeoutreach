
/**
 * Email Templates Module
 * Manages static and dynamic email templates for campaigns
 */

export const templates = [
  {
    id: "outreach-1",
    name: "General Outreach",
    subject: "Quick question for {{company}}",
    body: "<p>Hi {{firstName}},</p><p>I was looking into {{company}} and noticed you're doing interesting work in {{industry}}.</p><p>Would you be open to a brief chat about streamlining your operations?</p><p>Best,</p>"
  },
  {
    id: "followup-1",
    name: "First Follow-up",
    subject: "Re: Quick question for {{company}}",
    body: "<p>Hi {{firstName}},</p><p>Just following up on my previous email. I'd love to connect when you have a moment.</p><p>Best,</p>"
  }
];

/**
 * Replace placeholders in template
 */
export function renderTemplate(template, data) {
  let { subject, body } = template;
  
  const placeholders = {
    firstName: data.name ? data.name.split(" ")[0] : "there",
    company: data.company || "your company",
    industry: data.industry || "your industry",
    ...data
  };

  Object.keys(placeholders).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, "g");
    subject = subject.replace(regex, placeholders[key]);
    body = body.replace(regex, placeholders[key]);
  });

  return { subject, body };
}

export default { templates, renderTemplate };
