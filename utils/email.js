'use strict';

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ------------------------
// Base template
// ------------------------
function baseTemplate(username, bodyHtml) {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#1e1f22;color:#dbdee1;padding:32px;border-radius:12px;">
      <h2 style="color:#5865f2;">Sigma Chat</h2>
      <p>Hey <strong>${username}</strong>,</p>
      ${bodyHtml}
      <p style="color:#949ba4;font-size:12px;">If you didn't request this, ignore this email.</p>
    </div>
  `;
}

// ------------------------
// 1. Verify Email
// ------------------------
async function sendVerificationEmail(email, username, token) {
  console.log("🔥 Resend: sendVerificationEmail called");

  const link = `${APP_URL}/auth/verify-email?token=${encodeURIComponent(token)}`;

  const { data, error } = await resend.emails.send({
    from: 'Sigma Chat <onboarding@resend.dev>',
    to: email,
    subject: 'Verify your Sigma Chat email',
    html: baseTemplate(username, `
      <p>Please verify your email address. This link expires in 24 hours.</p>
      <a href="${link}" style="display:inline-block;background:#5865f2;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin:16px 0;">
        Verify Email
      </a>
    `),
  });

  if (error) {
    console.error("❌ Resend error:", error);
    throw error;
  }

  console.log("📨 Email sent:", data?.id);
  return data;
}

// ------------------------
// 2. Password Reset
// ------------------------
async function sendPasswordResetEmail(email, username, token) {
  console.log("🔥 Resend: sendPasswordResetEmail called");

  const link = `${APP_URL}/auth/reset-password?token=${encodeURIComponent(token)}`;

  const { data, error } = await resend.emails.send({
    from: 'Sigma Chat <onboarding@resend.dev>',
    to: email,
    subject: 'Reset your Sigma Chat password',
    html: baseTemplate(username, `
      <p>Click below to reset your password. This link expires in 1 hour.</p>
      <a href="${link}" style="display:inline-block;background:#ed4245;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin:16px 0;">
        Reset Password
      </a>
    `),
  });

  if (error) {
    console.error("❌ Resend error:", error);
    throw error;
  }

  console.log("📨 Email sent:", data?.id);
  return data;
}

// ------------------------
// 3. Email change verification
// ------------------------
async function sendEmailChangeVerification(email, username, token) {
  console.log("🔥 Resend: sendEmailChangeVerification called");

  const link = `${APP_URL}/auth/verify-email?token=${encodeURIComponent(token)}`;

  const { data, error } = await resend.emails.send({
    from: 'Sigma Chat <onboarding@resend.dev>',
    to: email,
    subject: 'Verify your new Sigma Chat email',
    html: baseTemplate(username, `
      <p>Please verify your new email address.</p>
      <a href="${link}" style="display:inline-block;background:#5865f2;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin:16px 0;">
        Verify New Email
      </a>
    `),
  });

  if (error) {
    console.error("❌ Resend error:", error);
    throw error;
  }

  console.log("📨 Email sent:", data?.id);
  return data;
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendEmailChangeVerification,
};
