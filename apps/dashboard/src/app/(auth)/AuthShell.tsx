import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "./components/BrandMark";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="auth-shell">
      <a className="auth-skip" href="#auth-form">
        Skip to sign in form
      </a>
      <section className="auth-story" aria-label="About Cohorio">
        <Link href="/" className="auth-brand">
          <BrandMark light />
          Cohorio
        </Link>
        <div>
          <p>One source of truth for your marketing</p>
          <h2>Strategy and execution that already understand your product.</h2>
          <p className="auth-story-tagline">
            Marketing that understands your product.
          </p>
          <ul className="auth-story-features">
            <li>Ground every output in your Brand Brain</li>
            <li>Collaborate across real team workspaces</li>
            <li>Keep connected commerce data protected</li>
          </ul>
        </div>
        <div className="auth-story-visual" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit-center">
            <BrandMark light />
          </div>
          <span className="orbit-dot dot-one" />
          <span className="orbit-dot dot-two" />
          <span className="orbit-dot dot-three" />
        </div>
        <small>Secure multi-workspace marketing operations</small>
      </section>
      <section className="auth-panel" aria-labelledby="auth-heading">
        <div className="auth-card auth-card-elevated">
          <span className="auth-eyebrow">{eyebrow}</span>
          <h1 id="auth-heading">{title}</h1>
          <p className="auth-description">{description}</p>
          <div id="auth-form">{children}</div>
          {footer && <div className="auth-footer">{footer}</div>}
        </div>
      </section>
    </main>
  );
}
