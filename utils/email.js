'use strict';
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

async function sendVerificationEmail(email, username, token) {
  const link = `${APP_URL}/auth/verify-email?token=${token}`;
  await transporter.sendMail({
    from: `"Sigma Chat" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Verify your Sigma Chat email',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#1e1f22;color:#dbdee1;padding:32px;border-radius:12px;">
        <h2 style="color:#5865f2;">Sigma Chat</h2>
        <p>Hey <strong>${username}</strong>,</p>
        <p>Please verify your email address by clicking the button below. This link expires in 24 hours.</p>
        <a href="${link}" style="display:inline-block;background:#5865f2;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin:16px 0;">Verify Email</a>
        <p style="color:#949ba4;font-size:12px;">If you didn't create an account, ignore this email.</p>
      </div>
    `,
  });
}

async function sendPasswordResetEmail(email, username, token) {
  const link = `${APP_URL}/auth/reset-password?token=${token}`;
  await transporter.sendMail({
    from: `"Sigma Chat" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Reset your Sigma Chat password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#1e1f22;color:#dbdee1;padding:32px;border-radius:12px;">
        <h2 style="color:#5865f2;">Sigma Chat</h2>
        <p>Hey <strong>${username}</strong>,</p>
        <p>Click the button below to reset your password. This link expires in 1 hour.</p>
        <a href="${link}" style="display:inline-block;background:#ed4245;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin:16px 0;">Reset Password</a>
        <p style="color:#949ba4;font-size:12px;">If you didn't request a reset, ignore this email.</p>
      </div>
    `,
  });
}

async function sendEmailChangeVerification(email, username, token) {
  const link = `${APP_URL}/auth/verify-email?token=${token}`;
  await transporter.sendMail({
    from: `"Sigma Chat" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Verify your new Sigma Chat email',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#1e1f22;color:#dbdee1;padding:32px;border-radius:12px;">
        <h2 style="color:#5865f2;">Sigma Chat</h2>
        <p>Hey <strong>${username}</strong>,</p>
        <p>Please verify your new email address by clicking the button below.</p>
        <a href="${link}" style="display:inline-block;background:#5865f2;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin:16px 0;">Verify New Email</a>
      </div>
    `,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendEmailChangeVerification };
