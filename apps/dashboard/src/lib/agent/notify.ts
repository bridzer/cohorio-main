import { Resend } from "resend";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

function appUrl() {
  return (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function notificationsConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.AUTH_EMAIL_FROM?.trim());
}

/**
 * Tells an automation's owner that a scheduled run finished. Uses the platform
 * Resend key (the one for account email), not a workspace's integration key.
 */
export async function sendAutomationEmail(input: {
  to: string;
  automationName: string;
  /** Null when the run failed before a conversation existed. */
  threadId: string | null;
  status: "completed" | "failed";
  pendingApprovals: number;
}) {
  if (!notificationsConfigured()) return { delivered: false };
  const link = input.threadId
    ? `${appUrl()}/agent?thread=${encodeURIComponent(input.threadId)}`
    : `${appUrl()}/agent/automations`;
  const subject =
    input.status === "failed"
      ? `Cohorio: "${input.automationName}" did not finish`
      : input.pendingApprovals
        ? `Cohorio: "${input.automationName}" needs your approval`
        : `Cohorio: "${input.automationName}" is ready`;
  const message =
    input.status === "failed"
      ? "The scheduled run stopped before it finished. Open Cohorio to see what happened."
      : input.pendingApprovals
        ? `The scheduled run finished and proposed ${input.pendingApprovals} ${
            input.pendingApprovals === 1 ? "action" : "actions"
          } that will not happen until you approve ${input.pendingApprovals === 1 ? "it" : "them"}.`
        : "The scheduled run finished. Drafts it created are saved in your workspace.";
  const name = escapeHtml(input.automationName);
  const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.AUTH_EMAIL_FROM as string,
    to: input.to,
    subject,
    text: `${input.automationName}\n\n${message}\n\n${link}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17221c">
      <p style="color:#446a59;font-size:12px;text-transform:uppercase;letter-spacing:.06em">Cohorio automation</p>
      <h1 style="font-size:22px">${name}</h1>
      <p style="line-height:1.6">${escapeHtml(message)}</p>
      <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#234d3e;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Open in Cohorio</a></p>
    </div>`,
  });
  if (result.error) throw new Error("Notification email delivery failed.");
  return { delivered: true };
}
