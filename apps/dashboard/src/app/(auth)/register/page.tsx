"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { AuthShell } from "../AuthShell";
import { AuthAlert } from "../components/AuthAlert";
import { AuthButton, GoogleAuthButton } from "../components/AuthButton";
import { AuthField } from "../components/AuthField";

function returnPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function RegisterForm() {
  const params = useSearchParams();
  const returnTo = useMemo(
    () => returnPath(params.get("callbackUrl") ?? params.get("returnTo")),
    [params],
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"form" | "verify-sent">("form");
  const [message, setMessage] = useState("");
  const [developmentUrl, setDevelopmentUrl] = useState("");
  const [cooldown, setCooldown] = useState(0);

  function startCooldown() {
    setCooldown(60);
    const timer = window.setInterval(() => {
      setCooldown((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, consent }),
    });
    const data = (await response.json()) as {
      error?: string;
      message?: string;
      developmentUrl?: string;
    };
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? "Unable to create your account.");
      return;
    }
    setPhase("verify-sent");
    setMessage(data.message ?? "Check your email to verify your account.");
    setDevelopmentUrl(data.developmentUrl ?? "");
    startCooldown();
  }

  async function resendVerification() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/resend-verification", {
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
      setError(data.error ?? "Unable to resend verification.");
      return;
    }
    setMessage(data.message ?? "Verification email sent.");
    setDevelopmentUrl(data.developmentUrl ?? "");
    startCooldown();
  }

  return (
    <AuthShell
      eyebrow="Create your workspace"
      title="Start with Cohorio"
      description="Your first organization and marketing workspace are created after email verification."
      footer={
        <>
          Already have an account?{" "}
          <Link
            className="auth-link"
            href={`/sign-in?callbackUrl=${encodeURIComponent(returnTo)}`}
          >
            Sign in
          </Link>
        </>
      }
    >
      {phase === "form" && (
        <>
          <GoogleAuthButton
            disabled={busy}
            onClick={() =>
              void signIn("google", {
                callbackUrl: `/auth/complete?returnTo=${encodeURIComponent(returnTo)}`,
              })
            }
          />
          <div className="auth-divider" role="separator">
            or use email
          </div>
          <form className="auth-form" onSubmit={submit} aria-busy={busy}>
            <fieldset disabled={busy} className="auth-form">
              <AuthField
                id="register-name"
                label="Full name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
              <AuthField
                id="register-email"
                label="Work email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <AuthField
                id="register-password"
                label="Password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={10}
                required
                hint="Use at least 10 characters with upper-case, lower-case, and a number."
                action={
                  <button
                    className="auth-password-toggle"
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                }
              />
              <label className="auth-consent" htmlFor="register-consent">
                <input
                  id="register-consent"
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  required
                />
                <span>
                  I agree to the terms and consent to Cohorio processing my account
                  data to provide the service.
                </span>
              </label>
              {error && <AuthAlert variant="error">{error}</AuthAlert>}
              <AuthButton loading={busy}>
                {busy ? "Creating account…" : "Create account"}
              </AuthButton>
            </fieldset>
          </form>
        </>
      )}
      {phase === "verify-sent" && (
        <div className="auth-form">
          {message && <AuthAlert variant="success">{message}</AuthAlert>}
          {developmentUrl && (
            <AuthAlert variant="info">
              Local email delivery is not configured.{" "}
              <a className="auth-link" href={developmentUrl}>
                Open verification link
              </a>{" "}
              (development only)
            </AuthAlert>
          )}
          {error && <AuthAlert variant="error">{error}</AuthAlert>}
          <AuthButton
            type="button"
            variant="secondary"
            loading={busy}
            disabled={busy || cooldown > 0}
            onClick={() => void resendVerification()}
          >
            {cooldown > 0
              ? `Resend available in 0:${String(cooldown).padStart(2, "0")}`
              : "Resend verification email"}
          </AuthButton>
        </div>
      )}
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
