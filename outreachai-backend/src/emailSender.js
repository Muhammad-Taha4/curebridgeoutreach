import nodemailer from "nodemailer";

/**
 * Send an email using Gmail SMTP
 * 
 * IMPORTANT: To use Gmail, you need an "App Password":
 * 1. Go to https://myaccount.google.com/apppasswords
 * 2. Select "Mail" and your device
 * 3. Generate a 16-character password
 * 4. Use THAT password (not your regular Gmail password)
 * 
 * You must have 2-Factor Authentication enabled on your Gmail account.
 */

// Create a transporter for a specific email account
function createTransporter(email, appPassword, provider = "Gmail") {
  const configs = {
    Gmail: { host: "smtp.gmail.com", port: 465, secure: true },
    Outlook: { host: "smtp.office365.com", port: 587, secure: false },
    SMTP: { host: "smtp.gmail.com", port: 465, secure: true }, // default to Gmail
  };

  const config = configs[provider] || configs.Gmail;

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: email,
      pass: appPassword,
    },
  });
}

/**
 * Send a single email
 * @param {Object} account - Email account { email, app_password, provider }
 * @param {Object} lead - Lead { name, email, company }
 * @param {string} subject - Email subject
 * @param {string} body - Email body (HTML or plain text)
 * @returns {Object} - { success, messageId, error }
 */
export async function sendEmail(account, lead, subject, body) {
  try {
    const transporter = createTransporter(account.email, account.app_password, account.provider);

    const mailOptions = {
      from: `"Adnan Malik - CureBridge RCM" <${account.email}>`,
      to: lead.email,
      subject: subject,
      html: body,
      // Add headers to reduce spam score
      headers: {
        "X-Mailer": "CureBridge RCM",
        "List-Unsubscribe": `<mailto:${account.email}?subject=unsubscribe>`,
      },
    };

    const info = await transporter.sendMail(mailOptions);

    console.log(`✅ Email sent to ${lead.email} via ${account.email} | ID: ${info.messageId}`);

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Failed to send to ${lead.email} via ${account.email}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Verify an email account connection
 * @param {string} email 
 * @param {string} appPassword 
 * @param {string} provider 
 * @returns {boolean}
 */
export async function verifyAccount(email, appPassword, provider = "Gmail") {
  try {
    const transporter = createTransporter(email, appPassword, provider);
    await transporter.verify();
    console.log(`✅ Account verified: ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ Account verification failed for ${email}:`, error.message);
    return false;
  }
}

export default { sendEmail, verifyAccount };
