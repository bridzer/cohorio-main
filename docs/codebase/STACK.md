# Technology Stack
Reviewed 2026-10-19 against the working tree, including uncommitted changes.

### 1) Runtime Summary
TypeScript dashboard; JavaScript CLI tools; SQL migrations; Markdown skill library. npm workspace root delegates to apps/dashboard. Node requirement >=20.9.0. Next.js builds and serves the dashboard.

### 2) Production Frameworks and Dependencies
Declared dashboard dependencies: Next.js 16.3.0, React/react-dom 19.2.8, next-auth ^5.0.0-beta.32, pg ^8.23.0, argon2 ^0.45.1, resend ^6.19.0, zod ^4.4.3 and @next/env ^16.3.0. Optional Linux native dependencies support Tailwind and Lightning CSS. Database access uses pg and SQL rather than an ORM.

### 3) Development Toolchain
TypeScript ^5, ESLint ^9 with Next configurations, Vitest ^4.1.10, Tailwind/PostCSS ^4. package-lock.json records resolved packages.

### 4) Key Commands
From repository root: npm ci; npm test; npm run lint; npm run build; npm start; npm run db:migrate. Development: npm run dev --workspace=cohorio-dashboard. Database commands mutate the configured database and were not run for this review.

### 5) Environment and Config
apps/dashboard/.env.example describes DATABASE_URL, DATABASE_SSL, AUTH_SECRET, AUTH_URL, Google OAuth credentials, RESEND_API_KEY, AUTH_EMAIL_FROM, Shopify credentials/encryption key, APP_URL and COHORIO_LLM_* configuration. Billing additionally reads STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET, absent from that example. [TODO] Verify deployed configuration and applied migrations without exposing secrets.

### 6) Evidence
- package.json
- apps/dashboard/package.json
- apps/dashboard/.env.example
- apps/dashboard/next.config.ts
- apps/dashboard/src/lib/billing/stripe.ts
