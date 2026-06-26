'use strict';

const nodemailer = require('nodemailer');

const port = parseInt(process.env.SMTP_PORT || '587', 10);

// 🔐 Validate required env vars early
if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
  console.error("❌ Missing SMTP credentials in environment variables");
}

// 📡 Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port,
  secure: port === 465, // IMPORTANT FIX
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// 🧪 SMTP health check (runs once at startup)
transporter.verify()
  .then(() => console.log("✅ SMTP READY - connection successful"))
  .catch((err) => console.error("❌ SMTP FAILED:", err));

// 🌍 Base URL
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// 🧱 Optional shared template (cleaner + less duplication)
function baseTemplate(username, bodyHtml, footer = true) {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#1e1f22;color:#dbdee1;padding:32px;border-radius:12px;">
      <h2 style="color:#5865f2;">Sigma Chat</h2>
      <p>Hey <strong>${username}</strong>,</p>
      ${bodyHtml}
      ${footer ? `<p style="color:#949ba4;font-size:12px;">If you didn't request this, ignore this email.</p>` : ''}
    </div>
  `;
}

// =========================
// 📧 EMAIL FUNCTIONS
// =========================

async function sendVerificationEmail(email, username, token) {
  console.log("🔥 sendVerificationEmail CALLED", { email, username });

  if (!email || !token) {
    throw new Error("Missing email or token");
  }

  const link = `${APP_URL}/auth/verify-email?token=${encodeURIComponent(token)}`;

  try {
    const info = await transporter.sendMail({
      from: `"Sigma Chat" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Verify your Sigma Chat email',
      html: baseTemplate(username, `
        <p>Please verify your email address. This link expires in 24 hours.</p>
        <a href="${link}" style="display:inline-block;background:#5865f2;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin:16px 0;">
          Verify Email
        </a>
      `),
    });

    console.log("📨 Verification email sent:", info.messageId);
    return info;

  } catch (err) {
    console.error("❌ Failed to send verification email:", err);
    throw err;
  }
}

async function sendPasswordResetEmail(email, username, token) {
  console.log("🔥 sendPasswordResetEmail CALLED", { email, username });

  if (!email || !token) {
    throw new Error("Missing email or token");
  }

  const link = `${APP_URL}/auth/reset-password?token=${encodeURIComponent(token)}`;

  try {
    const info = await transporter.sendMail({
      from: `"Sigma Chat" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Reset your Sigma Chat password',
      html: baseTemplate(username, `
        <p>Click below to reset your password. This link expires in 1 hour.</p>
        <a href="${link}" style="display:inline-block;background:#ed4245;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin:16px 0;">
          Reset Password
        </a>
      `),
    });

    console.log("📨 Reset email sent:", info.messageId);
    return info;

  } catch (err) {
    console.error("❌ Failed to send reset email:", err);
    throw err;
  }
}

async function sendEmailChangeVerification(email, username, token) {
  console.log("🔥 sendEmailChangeVerification CALLED", { email, username });

  if (!email || !token) {
    throw new Error("Missing email or token");
  }

  const link = `${APP_URL}/auth/verify-email?token=${encodeURIComponent(token)}`;

  try {
    const info = await transporter.sendMail({
      from: `"Sigma Chat" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Verify your new Sigma Chat email',
      html: baseTemplate(username, `
        <p>Please verify your new email address.</p>
        <a href="${link}" style="display:inline-block;background:#5865f2;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin:16px 0;">
          Verify New Email
        </a>
      `, false),
    });

    console.log("📨 Email change verification sent:", info.messageId);
    return info;

  } catch (err) {
    console.error("❌ Failed to send email change verification:", err);
    throw err;
  }
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendEmailChangeVerification,
};
