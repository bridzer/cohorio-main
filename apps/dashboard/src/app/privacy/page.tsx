import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Cohorio",
  description:
    "How Cohorio collects, uses, shares, and protects personal data, including Google user data and Shopify store data.",
};

const UPDATED = "November 18, 2026";

const SECTIONS = [
  { id: "who-we-are", label: "1. Who we are" },
  { id: "contact", label: "2. Contact" },
  { id: "scope", label: "3. Scope of this policy" },
  { id: "data-we-collect", label: "4. Data we collect" },
  { id: "google-data", label: "5. Google user data" },
  { id: "shopify-data", label: "6. Shopify store data" },
  { id: "how-we-use", label: "7. How we use data" },
  { id: "ai-processing", label: "8. AI processing" },
  { id: "sharing", label: "9. Sharing & sub-processors" },
  { id: "transfers", label: "10. International transfers" },
  { id: "security", label: "11. Security" },
  { id: "retention", label: "12. Retention & deletion" },
  { id: "rights", label: "13. Your rights" },
  { id: "cookies", label: "14. Cookies" },
  { id: "children", label: "15. Children" },
  { id: "changes", label: "16. Changes" },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#f5f6f2] text-[#18201d]">
      <header className="border-b border-[#e3e6df] bg-[#fbfcf9]">
        <div className="mx-auto flex h-16 w-[min(880px,calc(100%-40px))] items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-[20px] font-bold tracking-tight no-underline"
            aria-label="Cohorio home"
          >
            <span className="relative flex h-[25px] w-[25px] -rotate-12 items-center justify-center" aria-hidden="true">
              <span className="absolute h-[17px] w-[7px] -translate-x-[6px] -rotate-[28deg] rounded-full bg-[#173c31]" />
              <span className="absolute h-[22px] w-[7px] rounded-full bg-[#173c31]" />
              <span className="absolute h-[17px] w-[7px] translate-x-[6px] rotate-[28deg] rounded-full bg-[#173c31]" />
            </span>
            <span>Cohorio</span>
          </Link>
          <nav className="flex items-center gap-5 text-[13px] font-semibold" aria-label="Legal">
            <Link className="text-[#3f694f] no-underline hover:underline" href="/privacy" aria-current="page">
              Privacy
            </Link>
            <Link className="text-[#3f694f] no-underline hover:underline" href="/terms">
              Terms
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-[min(880px,calc(100%-40px))] py-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#5f6a63]">
          Cohorio · Privacy Policy
        </p>
        <h1 className="mt-3 text-balance text-[clamp(30px,4vw,44px)] font-semibold leading-tight tracking-tight">
          Privacy Policy
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-[#6c756f]">
          Effective {UPDATED}. This policy explains what data Cohorio collects, why we collect it,
          and the choices you have. Short version: we process your data to run your marketing
          workspaces, we never sell personal data, and connected store and Google data is used
          only to provide the features you ask for.
        </p>

       

        <nav aria-label="On this page" className="mt-8 rounded-2xl border border-[#e0e4dd] bg-white p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#5f6a63]">
            On this page
          </p>
          <ol className="mt-3 grid gap-1.5 text-[13px] sm:grid-cols-2">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a className="text-[#275345] no-underline hover:underline" href={`#${section.id}`}>
                  {section.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="mt-8 rounded-2xl border border-[#e0e4dd] bg-white p-6 text-[14px] leading-[1.7] text-[#33403a] sm:p-9">
          <section id="who-we-are" className="scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">1. Who we are</h2>
            <p className="mt-3">
              Cohorio (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides an AI marketing workspace for teams:
              brand context (&ldquo;Brand Brain&rdquo;), campaign and content workspaces, an AI agent,
              and integrations with commerce, analytics, and billing providers. The service is
              operated by <strong>Cohorio</strong>,
              registered at <strong>www.cohorio.site</strong>.
            </p>
          </section>

          <section id="contact" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">2. Contact</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li>
                Privacy questions and data requests:{" "}
                <a className="text-[#275345]" href="mailto:privacy@cohorio.site">
                  privacy@cohorio.site
                </a>
              </li>
              <li>
                General support:{" "}
                <a className="text-[#275345]" href="mailto:support@cohorio.site">
                  support@cohorio.site
                </a>
              </li>
              <li>Data protection officer (if appointed): <strong>Carlos Lemiso</strong></li>
              <li>EU / UK representative (if applicable): <strong>Carlos Lemiso</strong></li>
            </ul>
            <p className="mt-3">
              If transactional mail is still sent from a personal mailbox during development,
              replace it with these domain addresses before production launch so requests reach
              the right team.
            </p>
          </section>

          <section id="scope" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">3. Scope of this policy</h2>
            <p className="mt-3">
              This policy covers personal data processed through the Cohorio dashboard at{" "}
              <strong>www.cohorio.site</strong>, including account data, workspace content, and data
              from integrations you connect (Shopify, Google services, Meta Ads, Stripe). It does not cover
              third-party sites or services you visit through links, which have their own policies
              (see Section 9).
            </p>
          </section>

          <section id="data-we-collect" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">4. Data we collect</h2>
            <p className="mt-3">We collect only what we need to operate the service:</p>
            <h3 className="mt-5 text-[15px] font-semibold text-[#21302a]">Account and workspace membership</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>Name, work email, and password (stored as a salted hash, never in plain text).</li>
              <li>Authentication metadata: sign-in method (email or Google), verification status, timestamps.</li>
              <li>Organization and workspace membership, roles, and invitations.</li>
            </ul>
            <h3 className="mt-5 text-[15px] font-semibold text-[#21302a]">Workspace content you provide</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>Brand Brain answers, prompts, drafts, campaigns, posts, and saved assets.</li>
              <li>Agent conversation history and preferences needed to continue your work.</li>
            </ul>
            <h3 className="mt-5 text-[15px] font-semibold text-[#21302a]">Connected integrations (only if you connect them)</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>
                <strong>Shopify:</strong> shop domain, store name, contact email, currency, timezone;
                product catalog data (titles, descriptions, prices, inventory, SEO fields); and
                aggregated sales performance. Details in Section 6.
              </li>
              <li>
                <strong>Google services</strong> (sign-in, GA4, Google Ads): basic profile (name, email)
                for sign-in, plus analytics or ads data you authorize. Details in Section 5.
              </li>
              <li>
                <strong>Meta Ads</strong> (Facebook login, Marketing API): ad account metadata and
                read-only campaign performance (spend, impressions, clicks, conversions) for the ad
                account you select, plus the Facebook Pages you manage (name, category, and content
                and insights of the Page you select). Tokens are long-lived (~60 days); disconnecting deletes them and
                stops syncing. Governed by Meta&apos;s Privacy Policy and Terms.
              </li>
              <li>
                <strong>Stripe (billing):</strong> plan, subscription status, and Stripe customer /
                subscription identifiers. Card numbers are processed by Stripe; we never see or store
                full payment card numbers.
              </li>
              <li>OAuth tokens for integrations, stored encrypted and used only to act on your behalf.</li>
            </ul>
            <h3 className="mt-5 text-[15px] font-semibold text-[#21302a]">Technical and support data</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>Log data: pages visited, actions taken, timestamps, approximate location derived from IP.</li>
              <li>Device and browser information needed for security and debugging.</li>
              <li>Support correspondence.</li>
            </ul>
            <p className="mt-3">
              We do not intentionally collect sensitive personal data (health, biometrics, precise
              geolocation) — please do not enter it into prompts or brand context.
            </p>
          </section>

          <section id="google-data" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">
              5. Google user data — use, storage, and your controls
            </h2>
            <p className="mt-3">
              When you sign in with Google or connect Google integrations (such as GA4 or Google
              Ads), we receive Google user data through Google OAuth. Our use of that data complies
              with the{" "}
              <a
                className="text-[#275345]"
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noreferrer"
              >
                Google API Services User Data Policy
              </a>
              , including its Limited Use requirements.
            </p>
            <h3 className="mt-5 text-[15px] font-semibold text-[#21302a]">What we access and why</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-[#f2f4f0] text-left">
                    <th className="border border-[#e0e4dd] p-2.5">Data</th>
                    <th className="border border-[#e0e4dd] p-2.5">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-[#e0e4dd] p-2.5">Basic profile for sign-in (name, email address)</td>
                    <td className="border border-[#e0e4dd] p-2.5">Create and secure your account; identify you across workspaces.</td>
                  </tr>
                  <tr>
                    <td className="border border-[#e0e4dd] p-2.5">GA4 properties and read-only analytics reports you authorize</td>
                    <td className="border border-[#e0e4dd] p-2.5">Show performance insights and ground recommendations in your data.</td>
                  </tr>
                  <tr>
                    <td className="border border-[#e0e4dd] p-2.5">Google Ads account data you authorize (if connected)</td>
                    <td className="border border-[#e0e4dd] p-2.5">Draft, review, and — only on your explicit action — manage campaigns.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <h3 className="mt-5 text-[15px] font-semibold text-[#21302a]">Limited Use commitments</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>We use Google user data only to provide the user-facing features you request.</li>
              <li>We never sell, rent, or otherwise transfer Google user data to third parties except as necessary to provide the service (Section 9) or as required by law.</li>
              <li>We never use Google user data for advertising, retargeting, or interest-based ad targeting, and we do not combine it with advertising data.</li>
              <li>Human access to Google user data occurs only with your consent, for security or abuse investigation, or to comply with law.</li>
              <li>We request only the scopes needed for the features you use, and OAuth refresh tokens are stored encrypted.</li>
            </ul>
            <h3 className="mt-5 text-[15px] font-semibold text-[#21302a]">Retention and revocation</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>Disconnect a Google integration any time in Settings → Marketing tools; we delete the stored tokens and stop syncing new data.</li>
              <li>
                You can also revoke access in your Google account at{" "}
                <a
                  className="text-[#275345]"
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noreferrer"
                >
                  myaccount.google.com/permissions
                </a>{" "}
                — revocation takes effect on our next sync and we delete tokens on discovery.
              </li>
              <li>Deleting your Cohorio account deletes associated Google tokens and synced Google data per Section 12.</li>
            </ul>
          </section>

          <section id="shopify-data" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">6. Shopify store data</h2>
            <p className="mt-3">
              Connecting a Shopify store authorizes Cohorio to access that store through
              Shopify&apos;s APIs, under Shopify&apos;s API Terms and data-protection requirements.
              Where store data includes your customers&apos; personal data, you remain the data
              controller and Cohorio acts as your processor: we process it only on your instructions
              to provide the connected features.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-[#f2f4f0] text-left">
                    <th className="border border-[#e0e4dd] p-2.5">Scope</th>
                    <th className="border border-[#e0e4dd] p-2.5">Why we need it</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="border border-[#e0e4dd] p-2.5">read_products / write_products</td><td className="border border-[#e0e4dd] p-2.5">Read your catalog for audits and recommendations; update listings only when you explicitly approve and trigger a publish.</td></tr>
                  <tr><td className="border border-[#e0e4dd] p-2.5">read_inventory</td><td className="border border-[#e0e4dd] p-2.5">Surface stock context alongside product recommendations.</td></tr>
                  <tr><td className="border border-[#e0e4dd] p-2.5">read_orders</td><td className="border border-[#e0e4dd] p-2.5">Compute aggregated revenue and units-sold metrics for the commerce dashboard.</td></tr>
                  <tr><td className="border border-[#e0e4dd] p-2.5">read_customers</td><td className="border border-[#e0e4dd] p-2.5">Only where a feature you use needs it (e.g. retention audiences); never for unrelated profiling or resale.</td></tr>
                  <tr><td className="border border-[#e0e4dd] p-2.5">read_analytics / read_reports</td><td className="border border-[#e0e4dd] p-2.5">Run ShopifyQL sales queries that power net-sales charts and product metrics.</td></tr>
                </tbody>
              </table>
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li>Nothing is published to your store without your explicit action — drafts stay drafts until you approve.</li>
              <li>Disconnecting a store deletes its OAuth tokens immediately and queues synced store data for deletion per Section 12.</li>
              <li>Uninstalling the app from Shopify has the same effect: tokens are invalidated and store data is purged, subject only to short-lived backups.</li>
            </ul>
          </section>

          <section id="how-we-use" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">7. How we use data (and GDPR lawful bases)</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-[#f2f4f0] text-left">
                    <th className="border border-[#e0e4dd] p-2.5">Purpose</th>
                    <th className="border border-[#e0e4dd] p-2.5">Lawful basis (EEA / UK)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="border border-[#e0e4dd] p-2.5">Provide, maintain, and secure the service; authenticate users</td><td className="border border-[#e0e4dd] p-2.5">Contract; legitimate interests (security)</td></tr>
                  <tr><td className="border border-[#e0e4dd] p-2.5">Operate workspaces, Brand Brain, agent runs, and connected integrations</td><td className="border border-[#e0e4dd] p-2.5">Contract</td></tr>
                  <tr><td className="border border-[#e0e4dd] p-2.5">Process payments and manage subscriptions via Stripe</td><td className="border border-[#e0e4dd] p-2.5">Contract; legal obligation (tax / accounting records)</td></tr>
                  <tr><td className="border border-[#e0e4dd] p-2.5">Send transactional email (verification, password reset, workspace invites)</td><td className="border border-[#e0e4dd] p-2.5">Contract; legitimate interests</td></tr>
                  <tr><td className="border border-[#e0e4dd] p-2.5">Improve reliability and fix bugs using aggregated or de-identified usage data</td><td className="border border-[#e0e4dd] p-2.5">Legitimate interests</td></tr>
                  <tr><td className="border border-[#e0e4dd] p-2.5">Comply with law and enforce our Terms</td><td className="border border-[#e0e4dd] p-2.5">Legal obligation; legitimate interests</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              Where consent is the basis (for example, an optional integration or cookie), you may
              withdraw it at any time by disconnecting the integration or contacting us — withdrawal
              does not affect prior lawful processing.
            </p>
          </section>

          <section id="ai-processing" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">8. AI processing</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li>AI features send the inputs needed for your request (prompts, brand context, relevant store or analytics excerpts) to our model providers solely to generate your requested output.</li>
              <li>Our providers act as processors: they may not use your content to train general models, serve ads, or contact your customers.</li>
              <li>Cohorio does not use your workspace content to train shared or public AI models.</li>
              <li>AI outputs can be inaccurate or incomplete. You are responsible for reviewing outputs before publishing, sending, or relying on them (see Terms, Section 6).</li>
              <li>Do not submit sensitive personal data to AI features; keep prompts limited to what the task needs.</li>
            </ul>
          </section>

          <section id="sharing" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">9. Sharing &amp; sub-processors</h2>
            <p className="mt-3">
              We do not sell personal data and we do not share it for cross-context behavioral
              advertising. We disclose data only to:
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li><strong>Your team:</strong> workspace members see shared workspace content per their role.</li>
              <li><strong>Your connected services, on your instruction:</strong> e.g. updates you approve are written back to your Shopify store.</li>
              <li><strong>Sub-processors</strong> bound by data-processing terms (current list below).</li>
              <li><strong>Authorities</strong> where required by law or to protect rights, safety, and the integrity of the service.</li>
              <li><strong>A successor</strong> in a merger, acquisition, or asset transfer, with notice to you.</li>
            </ul>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-[#f2f4f0] text-left">
                    <th className="border border-[#e0e4dd] p-2.5">Provider</th>
                    <th className="border border-[#e0e4dd] p-2.5">Role</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="border border-[#e0e4dd] p-2.5">Hosting &amp; database provider (e.g. Railway / PostgreSQL)</td><td className="border border-[#e0e4dd] p-2.5">Application hosting and primary data storage.</td></tr>
                  <tr><td className="border border-[#e0e4dd] p-2.5">Stripe, Inc.</td><td className="border border-[#e0e4dd] p-2.5">Subscription checkout, billing portal, and webhooks. Governed by Stripe&apos;s privacy policy and terms.</td></tr>
                  <tr><td className="border border-[#e0e4dd] p-2.5">Google (OAuth, GA4, Google Ads APIs)</td><td className="border border-[#e0e4dd] p-2.5">Sign-in and analytics/ads features you connect. Governed by Google&apos;s privacy policy and the API Services User Data Policy.</td></tr>
                  <tr><td className="border border-[#e0e4dd] p-2.5">Meta (Facebook Login, Marketing API)</td><td className="border border-[#e0e4dd] p-2.5">Meta &ldquo;Connect with Facebook,&rdquo; campaign reporting, and the Facebook Page you select. Governed by Meta&apos;s privacy policy and platform terms.</td></tr>
                  <tr><td className="border border-[#e0e4dd] p-2.5">AI model provider(s)</td><td className="border border-[#e0e4dd] p-2.5">Inference for agent and workspace features, as a processor.</td></tr>
                  <tr><td className="border border-[#e0e4dd] p-2.5">Email delivery (Resend / SMTP)</td><td className="border border-[#e0e4dd] p-2.5">Transactional email such as verification and password reset.</td></tr>
                  <tr><td className="border border-[#e0e4dd] p-2.5">Shopify (your own store)</td><td className="border border-[#e0e4dd] p-2.5">Reads store data you authorize; writes only on your explicit action.</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              We will update this list if providers change and notify you of material changes per
              Section 16.
            </p>
          </section>

          <section id="transfers" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">10. International transfers</h2>
            <p className="mt-3">
              We may process data in countries other than your own, including the United States,
              where our providers operate. Where required, transfers are safeguarded with
              appropriate mechanisms such as the EU Standard Contractual Clauses (and the UK
              addendum), plus supplementary technical measures including encryption in transit and
              at rest.
            </p>
          </section>

          <section id="security" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">11. Security</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li>TLS in transit; OAuth tokens and billing identifiers encrypted at rest.</li>
              <li>Passwords stored as salted hashes; sessions are short-lived and scoped to your workspace.</li>
              <li>Role-based access (admin / member) and least-privilege internal access.</li>
              <li>Logging and monitoring for abuse and intrusion.</li>
            </ul>
            <p className="mt-3">
              No system is perfectly secure. If we discover a personal-data breach that poses a risk
              to you, we will notify you and relevant regulators as required by law.
            </p>
          </section>

          <section id="retention" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">12. Retention &amp; deletion</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li><strong>Account data:</strong> kept for the life of your account, deleted or anonymized within 30 days of verified account deletion, except records we must keep by law (e.g. tax invoices).</li>
              <li><strong>Workspace content:</strong> deleted with the workspace or account; routine backups age out within 90 days.</li>
              <li><strong>Integration tokens:</strong> deleted immediately on disconnect, uninstall, or revocation.</li>
              <li><strong>Synced store / Google data:</strong> queued for deletion on disconnect or uninstall and purged within 30 days, with only short-lived encrypted backups remaining.</li>
              <li><strong>Aggregated, de-identified analytics</strong> that cannot reasonably identify anyone may be retained for service improvement.</li>
            </ul>
            <p className="mt-3">
              To request deletion, email{" "}
              <a className="text-[#275345]" href="mailto:privacy@cohorio.site">privacy@cohorio.site</a>{" "}
              from your account email. Deleting a workspace is permanent.
            </p>
          </section>

          <section id="rights" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">13. Your rights</h2>
            <h3 className="mt-4 text-[15px] font-semibold text-[#21302a]">EEA / UK (GDPR)</h3>
            <p className="mt-2">
              You have the rights of access, rectification, erasure, portability, restriction, and
              objection, plus the right to withdraw consent and to lodge a complaint with your
              supervisory authority. We respond within one month (extendable by two months for
              complex requests).
            </p>
            <h3 className="mt-4 text-[15px] font-semibold text-[#21302a]">California and other US states (CCPA / CPRA and analogues)</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>Right to know, delete, and correct personal information; right to data portability.</li>
              <li>We do not sell or share personal information for cross-context behavioral advertising, and we do not discriminate for exercising your rights.</li>
              <li>We honor Global Privacy Control signals for opt-out-of-sale/share requests where applicable.</li>
              <li>Authorized agents may act for you with written permission and identity verification.</li>
            </ul>
            <p className="mt-3">
              Exercise any right via{" "}
              <a className="text-[#275345]" href="mailto:privacy@cohorio.site">privacy@cohorio.site</a>.
              We verify identity against your account email and respond within the statutory period
              (generally 45 days under US state laws).
            </p>
          </section>

          <section id="cookies" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">14. Cookies</h2>
            <p className="mt-3">
              Cohorio uses only cookies and similar storage needed to run the service: authentication
              and session cookies, security (CSRF) cookies, and workspace-preference storage. We do
              not use third-party advertising cookies or cross-site trackers. Your browser controls
              apply, but disabling essential cookies will prevent sign-in.
            </p>
          </section>

          <section id="children" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">15. Children</h2>
            <p className="mt-3">
              Cohorio is a business service and is not directed to children under 16. You must be at
              least 18 (or the age of majority where you live) to create an account. If you believe
              a child has provided data, contact us and we will delete it.
            </p>
          </section>

          <section id="changes" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">16. Changes to this policy</h2>
            <p className="mt-3">
              We will post updates on this page with a new effective date and, for material changes,
              notify you by email or in-product notice at least 14 days in advance. Continued use
              after the effective date constitutes acceptance.
            </p>
          </section>
        </article>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#6c756f]">
          <p>
            Questions?{" "}
            <a className="text-[#275345]" href="mailto:privacy@cohorio.site">
              privacy@cohorio.site
            </a>
          </p>
          <p>
            <Link className="text-[#275345] no-underline hover:underline" href="/terms">
              Terms &amp; Conditions
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
