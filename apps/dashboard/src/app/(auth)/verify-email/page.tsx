"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { AuthShell } from "../AuthShell";
import { AuthAlert } from "../components/AuthAlert";

function VerifyEmailContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<"working" | "verified" | "error">(
    "working",
  );
  const [error, setError] = useState("");
  const [alreadyVerified, setAlreadyVerified] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!token) {
        setStatus("error");
        setError("The verification token is missing.");
        return;
      }
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json()) as {
        error?: string;
        alreadyVerified?: boolean;
        completionToken?: string | null;
      };
      if (cancelled) return;
      if (!response.ok) {
        setStatus("error");
        setError(data.error ?? "Unable to verify this email.");
        return;
      }
      setAlreadyVerified(Boolean(data.alreadyVerified));
      if (data.completionToken) {
        const result = await signIn("credentials", {
          completionToken: data.completionToken,
          redirect: false,
        });
        if (!result?.error) {
          router.push("/auth/complete?returnTo=/");
          return;
        }
      }
      setStatus("verified");
    })();
    return () => {
      cancelled = true;
    };
  }, [router, token]);

  return (
    <AuthShell
      eyebrow="Account verification"
      title={
        status === "working"
          ? "Verifying your email"
          : status === "verified"
            ? alreadyVerified
              ? "Email already verified"
              : "Email verified"
            : "Verification failed"
      }
      description="Email verification protects your account and activates your organization."
    >
      {status === "working" && (
        <AuthAlert variant="info">Please wait while we confirm your email.</AuthAlert>
      )}
      {status === "verified" && (
        <>
          <AuthAlert variant="success">
            Your organization is ready. Continue to your workspace.
          </AuthAlert>
          <Link className="auth-button" href="/sign-in">
            Continue to sign in
          </Link>
        </>
      )}
      {status === "error" && (
        <>
          <AuthAlert variant="error">{error}</AuthAlert>
          <Link className="auth-button" href="/register">
            Return to registration
          </Link>
        </>
      )}
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
