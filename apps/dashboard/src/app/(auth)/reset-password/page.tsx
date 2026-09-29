"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "../AuthShell";
import { AuthAlert } from "../components/AuthAlert";
import { AuthButton } from "../components/AuthButton";
import { AuthField } from "../components/AuthField";

function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? "Unable to reset password.");
      return;
    }
    setChanged(true);
  }

  return (
    <AuthShell
      eyebrow="Secure recovery"
      title={changed ? "Password updated" : "Choose a new password"}
      description="Use at least 10 characters with upper-case, lower-case, and numeric characters."
    >
      {changed ? (
        <>
          <AuthAlert variant="success">
            Your password was changed and existing sessions were revoked.
          </AuthAlert>
          <Link className="auth-button" href="/sign-in">
            Sign in
          </Link>
        </>
      ) : (
        <form className="auth-form" onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy} className="auth-form">
            <AuthField
              id="reset-password"
              label="New password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <AuthField
              id="reset-confirm"
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
            {!token && (
              <AuthAlert variant="error">
                This reset link is missing a token. Request a new one.
              </AuthAlert>
            )}
            {error && <AuthAlert variant="error">{error}</AuthAlert>}
            <AuthButton loading={busy} disabled={!token}>
              {busy ? "Updating…" : "Update password"}
            </AuthButton>
          </fieldset>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
