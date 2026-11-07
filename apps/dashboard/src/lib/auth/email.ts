import { emailTransport, escapeHtml, sendPlatformEmail } from "@/lib/email/transport";

function authBaseUrl() {
  return process.env.AUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";
}

export function authEmailConfigured() {
  return emailTransport() !== null;
}

async function sendAuthEmail(input: {
  to: string;
  subject: string;
  heading: string;
  message: string;
  actionLabel: string;
  actionUrl: string;
}) {
  // Headings can carry user-entered text (organization names); escape everything.
  return sendPlatformEmail({
    to: input.to,
    subject: input.subject,
    text: `${input.heading}\n\n${input.message}\n\n${input.actionUrl}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17221c">
      <h1 style="font-size:26px">${escapeHtml(input.heading)}</h1>
      <p style="line-height:1.6">${escapeHtml(input.message)}</p>
      <p><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#234d3e;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">${escapeHtml(input.actionLabel)}</a></p>
      <p style="color:#687166;font-size:12px">If you did not request this, you can ignore this email.</p>
    </div>`,
  });
}

export function verificationUrl(token: string) {
  return `${authBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

export function passwordResetUrl(token: string) {
  return `${authBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

export function invitationUrl(token: string) {
  return `${authBaseUrl()}/invite?token=${encodeURIComponent(token)}`;
}

export async function sendVerificationEmail(email: string, token: string) {
  return sendAuthEmail({
    to: email,
    subject: "Verify your Cohorio account",
    heading: "Verify your email",
    message:
      "Confirm your email to activate your Cohorio organization and preserve your current marketing workspace.",
    actionLabel: "Verify email",
    actionUrl: verificationUrl(token),
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  return sendAuthEmail({
    to: email,
    subject: "Reset your Cohorio password",
    heading: "Reset your password",
    message: "This secure password reset link expires in 30 minutes.",
    actionLabel: "Reset password",
    actionUrl: passwordResetUrl(token),
  });
}

export async function sendInvitationEmail(
  email: string,
  token: string,
  organizationName: string,
) {
  return sendAuthEmail({
    to: email,
    subject: `Join ${organizationName} on Cohorio`,
    heading: `You’re invited to ${organizationName}`,
    message:
      "Accept this invitation to collaborate in the organization’s marketing workspaces.",
    actionLabel: "Accept invitation",
    actionUrl: invitationUrl(token),
  });
}
