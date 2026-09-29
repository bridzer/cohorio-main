"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { AuthShell } from "../AuthShell";
import { AuthAlert } from "../components/AuthAlert";
import { AuthButton, GoogleAuthButton } from "../components/AuthButton";
import { AuthField } from "../components/AuthField";

const SIGN_IN_ERRORS: Record<string, string> = {
  AccessDenied: "This account is not available. Contact an administrator.",
  Configuration: "Google sign-in is not configured yet.",
  OAuthAccountNotLinked:
    "This email already has a password. Sign in with email or reset your password.",
  Verification: "Google could not verify that email address.",
  OAuthCallback: "Google sign-in was cancelled or could not be completed.",
  Callback: "Sign-in could not be completed. Try again.",
};

function returnPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(
    SIGN_IN_ERRORS[params.get("error") ?? ""] ??
      (params.get("error") ? "Sign-in could not be completed." : ""),
  );
  const [busy, setBusy] = useState(false);
  const returnTo = useMemo(
    () => returnPath(params.get("callbackUrl") ?? params.get("returnTo")),
    [params],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setBusy(false);
    if (result?.error) {
      setError("Check your email, password, and verification status, then try again.");
      return;
    }
    router.push(`/auth/complete?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to Cohorio"
      description="Continue with your marketing workspaces, context, and connected stores."
      footer={
        <>
          New to Cohorio?{" "}
          <Link
            className="auth-link"
            href={`/register?callbackUrl=${encodeURIComponent(returnTo)}`}
          >
            Create an account
          </Link>
        </>
      }
    >
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
            id="sign-in-email"
            label="Email address"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <AuthField
            id="sign-in-password"
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
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
          <div className="auth-form-row">
            <Link className="auth-link" href="/forgot-password">
              Forgot password?
            </Link>
          </div>
          {error && <AuthAlert variant="error">{error}</AuthAlert>}
          <AuthButton loading={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </AuthButton>
        </fieldset>
      </form>
    </AuthShell>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
