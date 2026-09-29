"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "../AuthShell";
import { AuthAlert } from "../components/AuthAlert";

function InviteContent() {
  const token = useSearchParams().get("token") ?? "";
  const [status, setStatus] = useState<
    "working" | "login" | "accepted" | "error"
  >("working");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!token) return;
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json()) as { error?: string };
      if (cancelled) return;
      if (response.ok) setStatus("accepted");
      else if (response.status === 401) setStatus("login");
      else {
        setStatus("error");
        setError(data.error ?? "Unable to accept invitation.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const callbackUrl = `/invite?token=${encodeURIComponent(token)}`;
  return (
    <AuthShell
      eyebrow="Team invitation"
      title={
        status === "accepted"
          ? "Invitation accepted"
          : status === "login"
            ? "Sign in to continue"
            : "Joining workspace"
      }
      description="Invitations are bound to the invited email address for security."
    >
      {status === "working" && (
        <AuthAlert variant="info">
          {token ? "Checking your invitation…" : "The invitation token is missing."}
        </AuthAlert>
      )}
      {status === "login" && (
        <>
          <AuthAlert variant="info">
            Sign in or create an account using the email address that received
            the invitation.
          </AuthAlert>
          <Link
            className="auth-button"
            href={`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          >
            Sign in
          </Link>
          <Link
            className="auth-button secondary"
            href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          >
            Create account
          </Link>
        </>
      )}
      {status === "accepted" && (
        <>
          <AuthAlert variant="success">
            You now have access to the organization.
          </AuthAlert>
          <Link className="auth-button" href="/">
            Open dashboard
          </Link>
        </>
      )}
      {status === "error" && <AuthAlert variant="error">{error}</AuthAlert>}
    </AuthShell>
  );
}

export default function InvitePage() {
  return (
    <Suspense>
      <InviteContent />
    </Suspense>
  );
}
