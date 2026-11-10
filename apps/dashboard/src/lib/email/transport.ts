import nodemailer from "nodemailer";
import { Resend } from "resend";

/**
 * Platform email (account verification, password resets, invitations,
 * automation notices). Two transports:
 * - SMTP when SMTP_HOST, SMTP_USER and SMTP_PASSWORD are set, e.g. Gmail with
 *   an App Password (smtp.gmail.com, port 465).
 * - Resend when RESEND_API_KEY is set; the sender domain must be verified there.
 * SMTP wins when both are configured.
 */
export type EmailTransport = "smtp" | "resend";

export type PlatformEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function smtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  // Google shows App Passwords in groups of four with spaces; SMTP needs them without.
  const pass = process.env.SMTP_PASSWORD?.replace(/\s+/g, "");
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT) || 465;
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;
  return { host, port, secure, user, pass };
}

export function emailTransport(): EmailTransport | null {
  if (smtpConfig()) return "smtp";
  if (process.env.RESEND_API_KEY?.trim() && process.env.AUTH_EMAIL_FROM?.trim()) return "resend";
  return null;
}

/** The From header. Gmail rewrites any other address to the signed-in account, so default to it. */
export function emailFrom() {
  const configured = process.env.AUTH_EMAIL_FROM?.trim();
  if (configured) return configured;
  const user = smtpConfig()?.user;
  return user ? `Cohorio <${user}>` : "";
}

let smtpCache: { key: string; transporter: ReturnType<typeof nodemailer.createTransport> } | null = null;

function smtpTransporter() {
  const config = smtpConfig();
  if (!config) throw new Error("SMTP is not configured.");
  const key = `${config.host}:${config.port}:${config.user}`;
  if (smtpCache?.key !== key) {
    smtpCache = {
      key,
      transporter: nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        // Gmail advertises IPv6 addresses; on networks without a working
        // IPv6 route Node hangs until the connection times out (ETIMEDOUT).
        family: 4,
        // Port 587 upgrades with STARTTLS; never send credentials in clear text.
        requireTLS: !config.secure,
        auth: { user: config.user, pass: config.pass },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
      }),
    };
  }
  return smtpCache.transporter;
}

/** Logs in to the SMTP server without sending anything. */
export async function verifySmtp() {
  await smtpTransporter().verify();
}

async function sendViaResend(email: PlatformEmail, from: string) {
  const result = await new Resend(process.env.RESEND_API_KEY).emails.send({ from, ...email });
  if (result.error) {
    throw new Error(`Email delivery failed: Resend ${result.error.name} — ${result.error.message}`);
  }
  return { delivered: true } as const;
}

// Connection-level SMTP failures (timeouts, refused, DNS) say nothing about
// the message itself; cloud networks frequently block outbound SMTP ports.
const SMTP_CONNECTION_CODES = new Set([
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNECTION",
  "ESOCKET",
  "EDNS",
  "EAI_AGAIN",
  "ENOTFOUND",
]);

/**
 * Sends one platform email. Returns delivered: false when no transport is
 * configured (development falls back to on-screen links). Throws with the
 * provider's reason, for server logs only, when the provider refuses.
 */
export async function sendPlatformEmail(email: PlatformEmail) {
  const transport = emailTransport();
  if (!transport) return { delivered: false };
  const from = emailFrom();
  if (transport === "smtp") {
    try {
      await smtpTransporter().sendMail({ from, ...email });
    } catch (error) {
      const detail = error as { code?: string; responseCode?: number; response?: string };
      // SMTP port unreachable (common on Railway/cloud egress): fall back to
      // Resend over HTTPS when it is configured, instead of failing sign-ups.
      if (
        detail.code &&
        SMTP_CONNECTION_CODES.has(detail.code) &&
        process.env.RESEND_API_KEY?.trim() &&
        from
      ) {
        return sendViaResend(email, from);
      }
      throw new Error(
        `Email delivery failed: SMTP ${detail.code ?? ""} ${detail.responseCode ?? ""} ${
          detail.response?.split("\n")[0]?.slice(0, 200) ?? (error instanceof Error ? error.message : "")
        }`.replace(/\s+/g, " "),
      );
    }
    return { delivered: true };
  }
  return sendViaResend(email, from);
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}
