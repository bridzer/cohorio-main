import { loadIntegration } from "@/lib/integrations/store";
import {
  getLifecycleDraft,
  markLifecycleDraftSent,
} from "@/lib/lifecycle-repository";

export const SINGLE_EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/** Carries a message that is safe to show the user. */
export class LifecycleSendError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409 | 502,
  ) {
    super(message);
  }
}

export async function sendLifecycleDraft(
  workspaceId: string,
  draftId: string,
  recipient: string,
) {
  const to = recipient.trim();
  if (!SINGLE_EMAIL.test(to) || to.length > 320) {
    throw new LifecycleSendError("Enter one email address.", 400);
  }
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  if (!from) throw new LifecycleSendError("AUTH_EMAIL_FROM is not configured.", 400);

  const draft = await getLifecycleDraft(workspaceId, draftId);
  if (!draft) throw new LifecycleSendError("Draft not found.", 404);
  if (draft.status === "sent") {
    throw new LifecycleSendError("This draft was already sent.", 409);
  }
  const apiKey = await loadIntegration(workspaceId, "resend");
  if (!apiKey) throw new LifecycleSendError("resend is not connected.", 400);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: draft.name,
      text: draft.bodyMarkdown,
    }),
  });
  if (!response.ok) {
    throw new LifecycleSendError(
      `Resend rejected the email (HTTP ${response.status}).`,
      502,
    );
  }
  return markLifecycleDraftSent(workspaceId, draftId);
}
