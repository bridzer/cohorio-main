import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms & Conditions — Cohorio",
  description:
    "The terms governing your use of Cohorio workspaces, AI features, integrations, and subscriptions.",
};

const UPDATED = "November 18, 2026";

const SECTIONS = [
  { id: "agreement", label: "1. Agreement & service" },
  { id: "accounts", label: "2. Accounts & eligibility" },
  { id: "plans", label: "3. Plans & billing" },
  { id: "acceptable-use", label: "4. Acceptable use" },
  { id: "integrations", label: "5. Integrations" },
  { id: "ai", label: "6. AI features" },
  { id: "content-ip", label: "7. Content & IP" },
  { id: "third-party", label: "8. Third-party services" },
  { id: "warranties", label: "9. Warranties & liability" },
  { id: "indemnity", label: "10. Indemnity" },
  { id: "termination", label: "11. Suspension & termination" },
  { id: "law", label: "12. Governing law" },
  { id: "changes", label: "13. Changes & contact" },
];

export default function TermsPage() {
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
            <Link className="text-[#3f694f] no-underline hover:underline" href="/privacy">
              Privacy
            </Link>
            <Link className="text-[#3f694f] no-underline hover:underline" href="/terms" aria-current="page">
              Terms
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-[min(880px,calc(100%-40px))] py-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#5f6a63]">
          Cohorio · Terms &amp; Conditions
        </p>
        <h1 className="mt-3 text-balance text-[clamp(30px,4vw,44px)] font-semibold leading-tight tracking-tight">
          Terms &amp; Conditions
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-[#6c756f]">
          Effective {UPDATED}. These terms form a binding agreement between you (and your
          organization, if you act for one) and <strong>[Cohorio legal entity name]</strong>.
          By creating an account or using Cohorio, you accept them.
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
          <section id="agreement" className="scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">
              1. Agreement &amp; service description
            </h2>
            <p className="mt-3">
              Cohorio is an AI marketing workspace: brand context (&ldquo;Brand Brain&rdquo;),
              campaign and content workspaces, an AI agent, commerce and analytics dashboards, and
              integrations with Shopify, Google services, and Stripe billing. We may add, modify, or
              discontinue features with reasonable notice; material removals from paid plans are
              communicated at least 30 days in advance.
            </p>
            <p className="mt-3">
              If you accept these terms on behalf of an organization, you represent that you have
              authority to bind it, and &ldquo;you&rdquo; means that organization.
            </p>
          </section>

          <section id="accounts" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">
              2. Accounts &amp; eligibility
            </h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li>You must be at least 18 (or the age of majority where you live) and able to form a binding contract.</li>
              <li>Provide accurate account information, verify your email when asked, and keep credentials confidential. You are responsible for activity under your account.</li>
              <li>Workspace roles (e.g. admin, member) control what teammates can do; admins are responsible for managing membership and for actions taken by invited users.</li>
              <li>One person per login: do not share passwords or circumvent access controls. Notify us promptly at <a className="text-[#275345]" href="mailto:support@cohorio.site">support@cohorio.site</a> of suspected compromise.</li>
              <li>Google sign-in is subject to Google&apos;s terms in addition to ours.</li>
            </ul>
          </section>

          <section id="plans" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">3. Plans &amp; billing</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li><strong>Plans.</strong> Cohorio offers free and paid workspace plans (e.g. Pro, Team). Features, seats, and usage limits for each plan are described in-product and at checkout.</li>
              <li><strong>Processor.</strong> Payments are processed by Stripe. By subscribing you also accept Stripe&apos;s terms; card and bank details go directly to Stripe and never touch our servers.</li>
              <li><strong>Billing cycle.</strong> Subscriptions bill monthly in advance in USD, renew automatically, and are exclusive of taxes, which you are responsible for.</li>
              <li><strong>Changes.</strong> You can upgrade, downgrade, or cancel from Settings → Billing (Stripe customer portal). Downgrades take effect at the next cycle; we do not prorate partial periods except where required by law.</li>
              <li><strong>Failed payment.</strong> We may retry, suspend paid features after reasonable notice, and restore access once payment succeeds.</li>
              <li><strong>Refunds.</strong> Except where required by consumer law, fees are non-refundable once a billing period starts. If you believe you were charged in error, contact us within 30 days.</li>
              <li><strong>Price changes.</strong> We give at least 30 days&apos; notice of price increases; continued use after the increase constitutes acceptance.</li>
            </ul>
          </section>

          <section id="acceptable-use" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">4. Acceptable use</h2>
            <p className="mt-3">You agree not to:</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>Break the law, infringe intellectual-property, privacy, or publicity rights, or generate unlawful, hateful, deceptive, or sexually explicit involving-minors content.</li>
              <li>Send spam or unsolicited marketing, harvest data, or use outputs to mislead consumers (fake reviews, deceptive claims, dark patterns).</li>
              <li>Probe, scan, overload, reverse-engineer, or interfere with the service, or access data you have no right to.</li>
              <li>Submit malware, or submit others&apos; personal data without a lawful basis.</li>
              <li>Resell, white-label, or systematically scrape the service without written permission.</li>
              <li>Use the service to develop a competing model or to extract our models, prompts, or system instructions at scale.</li>
            </ul>
            <p className="mt-3">
              You are responsible for the accuracy and legality of data you import and for
              marketing claims you publish — including substantiation of discounts, health,
              environmental, or comparative claims under applicable advertising law (e.g. FTC
              guidance, EU Unfair Commercial Practices rules).
            </p>
          </section>

          <section id="integrations" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">5. Integrations</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li><strong>Authorization.</strong> Connecting Shopify, Google, or other services authorizes Cohorio to access the scopes shown at connect-time, strictly to provide the features you request.</li>
              <li><strong>Shopify.</strong> Drafts and audits never alter your store until you explicitly approve and trigger a publish. You are responsible for reviewing product content, prices, and inventory effects before publishing. Disconnecting or uninstalling stops sync and purges data per our <Link className="text-[#275345]" href="/privacy">Privacy Policy</Link>.</li>
              <li><strong>Google.</strong> Analytics and ads features are read- or action-scoped as shown; campaign changes require your explicit action. You can revoke access any time in Settings or at myaccount.google.com/permissions.</li>
              <li><strong>Availability.</strong> Integrations depend on third-party APIs and may be rate-limited, changed, or interrupted by the provider; we are not liable for provider-side outages or policy changes.</li>
            </ul>
          </section>

          <section id="ai" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">6. AI features — review required</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li>AI outputs are generated probabilistically and <strong>may be inaccurate, incomplete, or outdated</strong>. They are assistance, not professional advice (legal, financial, medical, or otherwise).</li>
              <li><strong>You must review every output before publishing, sending, or relying on it.</strong> You assume responsibility for anything you approve, including store listings, campaigns, and customer communications.</li>
              <li>Do not submit sensitive personal data (health, financial credentials, children&apos;s data) into AI features, and do not use outputs to make solely-automated decisions with legal or similarly significant effects.</li>
              <li>We do not use your workspace content to train shared or public models, and our model providers are contractually limited to processing for service delivery (see Privacy Policy, Section 8).</li>
            </ul>
          </section>

          <section id="content-ip" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">7. Your content &amp; our IP</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li><strong>Ownership.</strong> You retain ownership of your brand materials, store data, prompts, and other content you provide (&ldquo;Customer Content&rdquo;).</li>
              <li><strong>License to us.</strong> You grant Cohorio a worldwide, non-exclusive license to host, process, and display Customer Content solely to operate, secure, and improve the service for you — including transmitting approved updates back to your connected store.</li>
              <li><strong>Outputs.</strong> Subject to third-party rights and your compliance with these terms, outputs generated for your workspace are yours to use. Identical or similar outputs may be generated for others; we make no exclusivity claim over AI-generated text.</li>
              <li><strong>Our IP.</strong> The service, models orchestration, designs, and documentation remain ours (or our licensors&apos;). No rights are granted except the limited right to use the service per these terms.</li>
              <li><strong>Feedback.</strong> Suggestions you send may be used freely without obligation or compensation.</li>
              <li><strong>DMCA / infringement notices:</strong> send to <a className="text-[#275345]" href="mailto:support@cohorio.site">support@cohorio.site</a> with the work, the infringing location, and your contact and good-faith statement.</li>
            </ul>
          </section>

          <section id="third-party" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">8. Third-party services</h2>
            <p className="mt-3">
              Your use of connected services is also governed by their terms and policies,
              including Shopify&apos;s Terms of Service and API Terms, Google&apos;s Terms of
              Service and API Services User Data Policy, and Stripe&apos;s services agreement.
              Cohorio is not a party to those agreements and is not responsible for third-party
              acts, content, or downtime.
            </p>
          </section>

          <section id="warranties" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">
              9. Warranties, disclaimers &amp; liability
            </h2>
            <p className="mt-3">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo;
              AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED,
              INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
              We do not warrant uninterrupted or error-free operation, perfect AI accuracy, or
              specific marketing outcomes.
            </p>
            <p className="mt-3">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PARTY IS LIABLE FOR INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOSS OF PROFITS,
              REVENUE, DATA, OR GOODWILL. EACH PARTY&apos;S TOTAL LIABILITY ARISING FROM THE
              SERVICE IS CAPPED AT THE FEES YOU PAID FOR THE 12 MONTHS BEFORE THE CLAIM (OR $100
              IF ON A FREE PLAN).
            </p>
            <p className="mt-3">
              Nothing in these terms limits liability that cannot be limited by law (including
              fraud, willful misconduct, or consumer rights that cannot be waived).
            </p>
          </section>

          <section id="indemnity" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">10. Indemnity</h2>
            <p className="mt-3">
              You will indemnify and hold harmless Cohorio, its officers, employees, and agents
              from claims, damages, and reasonable attorneys&apos; fees arising from your Customer
              Content, your use of the service in violation of these terms or law, or anything you
              publish or send using the service. We will promptly notify you of covered claims and
              cooperate at your reasonable expense.
            </p>
          </section>

          <section id="termination" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">
              11. Suspension &amp; termination
            </h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li><strong>By you:</strong> cancel paid plans from Settings → Billing; delete workspaces or your account from Settings. Deletion is permanent after any grace window shown in-product.</li>
              <li><strong>By us for cause:</strong> we may suspend or terminate for material breach, non-payment, abuse, or legal risk, with notice and a chance to cure where reasonably possible (except for urgent security or legal cases).</li>
              <li><strong>Effect:</strong> access ends, paid fees for the current period are not refunded except as required by law, and data is deleted per the Privacy Policy. Sections that should survive (IP, liability, indemnity, governing law) do survive.</li>
              <li><strong>Export:</strong> export your content before deleting; we provide reasonable in-product export for workspace content during active subscriptions.</li>
            </ul>
          </section>

          <section id="law" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">12. Governing law &amp; disputes</h2>
            <p className="mt-3">
              These terms are governed by the laws of <strong>Kenya</strong>, excluding conflict-of-laws rules. Disputes will be resolved
              in the state or federal courts located in <strong>Narok, Kenya</strong>, unless you and we
              agree in writing to binding arbitration. Nothing prevents either party from seeking
              urgent injunctive relief. If you are a consumer with mandatory local protections,
              those protections continue to apply.
            </p>
          </section>

          <section id="changes" className="mt-9 scroll-mt-24">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#21302a]">13. Changes &amp; contact</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li><strong>Changes.</strong> We may update these terms; material changes are notified by email or in-product notice at least 14 days before taking effect. Continued use after the effective date constitutes acceptance. If you object, cancel before the effective date.</li>
              <li><strong>Entire agreement; severability; assignment.</strong> These terms plus plan-specific terms are the entire agreement for the service. Invalid provisions are narrowed to the minimum; you may not assign without our consent, and we may assign in connection with a merger or sale with notice.</li>
              <li>
                <strong>Contact:</strong>{" "}
                <a className="text-[#275345]" href="mailto:support@cohorio.site">support@cohorio.site</a>
                {" · "}privacy matters:{" "}
                <a className="text-[#275345]" href="mailto:privacy@cohorio.site">privacy@cohorio.site</a>
                {" · "}<strong>63 Amalo, Narok, Kenya</strong>
              </li>
            </ul>
          </section>
        </article>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#6c756f]">
          <p>
            Questions?{" "}
            <a className="text-[#275345]" href="mailto:support@cohorio.site">
              support@cohorio.site
            </a>
          </p>
          <p>
            <Link className="text-[#275345] no-underline hover:underline" href="/privacy">
              Privacy Policy
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
