"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AuthShell } from "../AuthShell";
import { AuthAlert } from "../components/AuthAlert";
import { AuthButton } from "../components/AuthButton";
import { AuthField } from "../components/AuthField";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [developmentUrl, setDevelopmentUrl] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = (await response.json()) as {
      error?: string;
      message?: string;
      developmentUrl?: string;
    };
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? "Unable to request a reset.");
      return;
    }
    setMessage(data.message ?? "Check your email.");
    setDevelopmentUrl(data.developmentUrl ?? "");
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      description="We’ll send a single-use link that expires in 30 minutes."
      footer={
        <Link className="auth-link" href="/sign-in">
          Back to sign in
        </Link>
      }
    >
      {message ? (
        <div className="auth-form">
          <AuthAlert variant="success">{message}</AuthAlert>
          {developmentUrl && (
            <AuthAlert variant="info">
              <a className="auth-link" href={developmentUrl}>
                Open local reset link
              </a>{" "}
              (development only)
            </AuthAlert>
          )}
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy} className="auth-form">
            <AuthField
              id="forgot-email"
              label="Email address"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            {error && <AuthAlert variant="error">{error}</AuthAlert>}
            <AuthButton loading={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </AuthButton>
          </fieldset>
        </form>
      )}
    </AuthShell>
  );
}
