import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./auth.css";

export const metadata: Metadata = {
  title: "Cohorio account",
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
