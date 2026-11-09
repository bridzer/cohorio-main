import { z } from "zod";
import { defineTool } from "@/lib/agent/registry";
import { providerJson } from "../http";
import { credentialFor, type Connector } from "./types";

const LABEL = "Mailchimp";

export type MailchimpCredential = { apiKey: string; dataCenter: string };

function parse(plaintext: string): MailchimpCredential {
  const apiKey = plaintext.trim();
  // Mailchimp keys end with the data center, e.g. "…-us21"; the API host is
  // built from it, so the suffix must look like one before it is trusted.
  const match = /^([A-Za-z0-9]{16,})-([a-z]{2}\d{1,2})$/.exec(apiKey);
  if (!match) {
    throw new RangeError("Mailchimp API keys look like \"…-us21\" — the suffix after the dash is the data center.");
  }
  return { apiKey, dataCenter: match[2] };
}

function api<T>(credential: MailchimpCredential, path: string, signal?: AbortSignal) {
  return providerJson<T>(
    LABEL,
    `https://${credential.dataCenter}.api.mailchimp.com/3.0${path}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`cohorio:${credential.apiKey}`).toString("base64")}`,
        Accept: "application/json",
      },
    },
    { signal },
  );
}

type CampaignList = {
  campaigns?: {
    id?: string;
    send_time?: string;
    emails_sent?: number;
    settings?: { subject_line?: string; title?: string };
    report_summary?: {
      opens?: number;
      unique_opens?: number;
      open_rate?: number;
      clicks?: number;
      subscriber_clicks?: number;
      click_rate?: number;
    };
  }[];
};

/** Flattens sent-campaign reports into the numbers a marketer reads. */
export function summarizeCampaigns(payload: CampaignList) {
  return (payload.campaigns ?? []).map((campaign) => ({
    name: campaign.settings?.subject_line || campaign.settings?.title || "Untitled campaign",
    sentAt: campaign.send_time ?? null,
    emailsSent: campaign.emails_sent ?? null,
    opens: campaign.report_summary?.opens ?? null,
    uniqueOpens: campaign.report_summary?.unique_opens ?? null,
    openRate: campaign.report_summary?.open_rate ?? null,
    clicks: campaign.report_summary?.clicks ?? null,
    subscriberClicks: campaign.report_summary?.subscriber_clicks ?? null,
    clickRate: campaign.report_summary?.click_rate ?? null,
  }));
}

const campaigns = defineTool({
  name: "mailchimp_campaign_performance",
  tier: "read",
  description:
    "Recent sent Mailchimp email campaigns with sends, opens, unique opens, open rate, clicks, subscriber clicks and click rate, newest first. Rates are fractions (0.41 means 41%).",
  input: z.object({
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async execute(ctx, input) {
    const credential = await credentialFor(ctx, connector);
    const fields = [
      "campaigns.id", "campaigns.send_time", "campaigns.emails_sent",
      "campaigns.settings.subject_line", "campaigns.settings.title",
      "campaigns.report_summary.opens", "campaigns.report_summary.unique_opens",
      "campaigns.report_summary.open_rate", "campaigns.report_summary.clicks",
      "campaigns.report_summary.subscriber_clicks", "campaigns.report_summary.click_rate",
    ].join(",");
    const payload = await api<CampaignList>(
      credential,
      `/campaigns?status=sent&count=${input.limit}&sort_field=send_time&sort_dir=DESC&fields=${encodeURIComponent(fields)}`,
      ctx.signal,
    );
    return { campaigns: summarizeCampaigns(payload) };
  },
});

export const connector: Connector<MailchimpCredential> = {
  provider: "mailchimp",
  label: LABEL,
  keyHint: "Mailchimp API key (ends in -us…, e.g. …-us21)",
  parse,
  async verify(credential, signal) {
    await api(credential, "/ping", signal);
  },
  tools: [campaigns],
};
