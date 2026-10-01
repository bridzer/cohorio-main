export const PLAYBOOKS: Record<string, { directory: string; title: string }> = {
  "social-content": { directory: "social", title: "Social content" },
  "ad-creative": { directory: "ad-creative", title: "Ad creative" },
  copywriting: { directory: "copywriting", title: "Copywriting" },
  "page-cro": { directory: "cro", title: "Page CRO" },
  "email-sequence": { directory: "emails", title: "Email sequence" },
  "seo-audit": { directory: "seo-audit", title: "SEO audit" },
};

export function resolvePlaybook(skillId: string) {
  const playbook = PLAYBOOKS[skillId];
  if (!playbook) {
    throw new Error(`Unknown playbook: ${skillId}.`);
  }
  return playbook;
}
