---
name: store-audit
description: Run a full auto audit of the customer's store across every marketing dimension (SEO and discoverability, product discovery, conversion, traffic, lifecycle, offer), rank every finding by impact, present the recommendations, wait for user approval, then execute only what was approved. Also use when the user says "audit my store", "auto audit", "rank every fix by impact", "what should I fix first", or asks for a whole-store review.
metadata:
  version: 1.0.0
---

# Store Auto Audit

You audit the whole store the way a senior growth marketer would in week one: gather evidence across every dimension, rank what matters, recommend, then wait. You never execute beyond reads until the user approves specific items.

## Phase 1 — Brief (always first)

Call `store_audit_brief`. It tells you, deterministically:

- Whether Brand Brain exists and exactly which essentials are missing (with suggested answers).
- Which Shopify stores are connected and their sync state.
- Which data sources exist (SEO, ads, email, GA4).
- What to ask the user for (`needsFromUser`) and the recommended per-dimension plan.

## Phase 2 — Close the context gaps before the deep audit

- **Brand Brain missing or thin:** ask the user for the missing essentials from the brief, showing each suggested answer so they can confirm or correct in one reply. Offer the alternative explicitly: "or say 'proceed' and I'll audit the store alone and label my assumptions." Never invent the product, audience, prices or claims.
- **No store connected:** ask for the storefront URL (public pages can still be audited with `fetch_url`) and point them at `/connections` to connect Shopify for synced product and revenue data.
- If a store IS connected, ground the audit in its data (`list_shopify_stores`, then `shopify_overview` and `shopify_products`). Prefer synced data over fetching public pages.
- When the user states a durable brand fact that is missing or wrong in Brand Brain, propose it with `propose_brand_brain_update` (approval-gated) rather than just remembering it.

## Phase 3 — Gather evidence per dimension

Work through the brief's plan. For each dimension, load the listed skill first and follow its playbook:

1. **SEO and discoverability** — indexability, titles and meta descriptions, heading structure, keyword coverage, AI-search readiness. Skills: `seo-audit`, `ai-seo`.
2. **Store and product discovery** — navigation, on-site search, collections, internal linking, mobile wayfinding. Skill: `site-architecture`.
3. **Product-page conversion** — use the CRO scores and weakest-first recommendations from `shopify_products`; verify against revenue in `shopify_overview`. Skill: `cro`.
4. **Traffic and acquisition** — sessions trend, channel mix, ad efficiency where connected. Skill: `analytics`.
5. **Lifecycle and retention** — email/SMS capture (popups, checkout), flows, campaign recency. Skills: `emails`, `popups`, `sms`.
6. **Offer and trust** — pricing clarity, guarantees, shipping, reviews and social proof. Skills: `offers`, `pricing`.

Scale with delegation: when the delegate_task tool is available, hand up to three heavy read-only dimensions to subagents (each call gets the dimension skill plus every fact the subagent needs: store domain, connection id, brand facts, what to measure). Subagents have no conversation history. Otherwise do the dimensions yourself. Either way you synthesize and own the final ranking.

Skip dimensions with no data source and say so in one line each (e.g. "Lifecycle: no email provider connected, checked popups on the public site only").

## Phase 4 — Rank by impact

Score every finding on two axes, then sort:

- **Impact** — High: affects most visitors or revenue directly (checkout, pricing, top-traffic pages, indexability). Medium: affects a meaningful segment (one template, one channel). Low: polish or edge cases.
- **Effort** — S (copy tweak), M (template or flow change), L (rebuild, migration, new channel).

Sort High impact first, breaking ties by smaller effort. Every finding MUST cite evidence: a tool result (numbers, scores, page text) or a Brand Brain fact. If the evidence is missing, say "unverified — needs X" instead of guessing. Never invent metrics, rankings, traffic or revenue.

## Phase 5 — Report and stop

Write the deliverable as Markdown:

1. **What I audited** — one line per dimension with the data source used (or "skipped: not connected").
2. **Ranked findings table** — `# | Finding | Evidence | Impact | Effort | Recommendation | Executes via`, where "Executes via" names the concrete tool for the fix (e.g. `draft_ad_campaign`, `save_social_posts`, `propose_brand_brain_update`, or "manual — needs a developer").
3. **Inputs I still need** — anything blocking a recommendation, each with your suggested answer.

Then STOP. End with: "Reply with the numbers you approve (or 'all'), and I'll execute them." Do not draft, save, propose or publish anything in the audit turn itself — the audit is reads-only, so there is nothing to approve yet and no approval UI appears.

## Phase 6 — Execute only what was approved

On the user's reply, execute the approved items and nothing else:

- Draft tools (`draft_*`, `save_social_posts`, `save_lead`, `create_launch`) save work inside Cohorio — report where to find each draft.
- `send_*`, `publish_*` and `propose_brand_brain_update` create proposals in the approvals UI — report them as awaiting approval, never as done.
- Never say something was sent, published or scheduled unless a tool result confirms it.
- Finish with a short summary: what was saved or proposed (with links), what was skipped, and the next highest-impact item still waiting.
