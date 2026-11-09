import { redirect } from "next/navigation";

/** Integrations moved to the top-level Connections page; keep old links working. */
export default function IntegrationsRedirect() {
  redirect("/connections");
}
