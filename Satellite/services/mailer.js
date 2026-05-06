// services/mailer.js — Real SMTP email service (Gmail)
const nodemailer = require("nodemailer");
const JoinEmailLog = require("../models/JoinEmailLog");

let transporter = null;

/**
 * Initialize the SMTP transporter. Called once on startup.
 */
function initMailer() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass || user === "your_gmail@gmail.com") {
    console.warn("⚠️  SMTP not configured — email sending disabled.");
    console.warn("   Set SMTP_USER and SMTP_PASS in .env to enable.");
    return;
  }

  transporter = nodemailer.createTransport({
    host: host || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  // Verify connection
  transporter.verify((err) => {
    if (err) {
      console.error("❌ SMTP verification failed:", err.message);
      transporter = null;
    } else {
      console.log("✅ SMTP ready:", user);
    }
  });
}

/**
 * Send a "Request to Join" email to the PM.
 */
async function sendJoinRequestEmail({ projectId, projectName, requesterEmail, pmEmail }) {
  // Create log entry first
  const log = await JoinEmailLog.create({
    projectId,
    projectName,
    requesterEmail,
    pmEmail,
    subject: `[Clarity Stack] Join Request: ${projectName}`,
    status: "pending",
  });

  if (!transporter) {
    log.status = "failed";
    log.errorMessage = "SMTP not configured";
    await log.save();
    throw new Error("SMTP not configured. Set SMTP_USER and SMTP_PASS in .env");
  }

  const mailOptions = {
    from: `"Clarity Stack" <${process.env.SMTP_USER}>`,
    to: pmEmail,
    subject: `[Clarity Stack] Join Request for "${projectName}"`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f0f23; color: #e2e8f0; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #a78bfa; margin: 0;">Clarity Stack</h1>
          <p style="color: #94a3b8; font-size: 14px;">Knowledge-Driven Project Management</p>
        </div>
        
        <div style="background: #1e1e3f; padding: 24px; border-radius: 8px; border-left: 4px solid #8b5cf6;">
          <h2 style="color: #f1f5f9; margin-top: 0;">New Join Request</h2>
          <p style="color: #cbd5e1;">
            <strong style="color: #a78bfa;">${requesterEmail}</strong> has requested to join your project:
          </p>
          <div style="background: #2d2d5f; padding: 16px; border-radius: 6px; margin: 16px 0;">
            <p style="margin: 0; font-size: 18px; color: #f1f5f9; font-weight: 600;">${projectName}</p>
            <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">Project ID: ${projectId}</p>
          </div>
          <p style="color: #94a3b8; font-size: 14px;">
            Log in to your Clarity Stack dashboard to approve or reject this request.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 24px;">
          <a href="http://localhost:8080/projects" 
             style="background: #8b5cf6; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600;">
            Open Dashboard
          </a>
        </div>
        
        <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 24px;">
          This is an automated email from Clarity Stack Satellite Service.
        </p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    log.status = "sent";
    log.messageId = info.messageId;
    await log.save();

    console.log(`📧 Join email sent to ${pmEmail} (${info.messageId})`);
    return { messageId: info.messageId, status: "sent" };
  } catch (err) {
    log.status = "failed";
    log.errorMessage = err.message;
    await log.save();

    console.error("❌ Email send failed:", err.message);
    throw new Error("Failed to send email: " + err.message);
  }
}

module.exports = { initMailer, sendJoinRequestEmail };
