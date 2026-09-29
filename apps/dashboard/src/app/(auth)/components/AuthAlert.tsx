import type { ReactNode } from "react";

export function AuthAlert({
  variant,
  children,
}: {
  variant: "error" | "success" | "info";
  children: ReactNode;
}) {
  const role = variant === "error" ? "alert" : "status";
  return (
    <p
      className={`auth-alert auth-alert-${variant}`}
      role={role}
      aria-live={variant === "error" ? "assertive" : "polite"}
    >
      {children}
    </p>
  );
}
