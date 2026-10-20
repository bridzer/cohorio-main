import { readdir } from "node:fs/promises";
import path from "node:path";

async function resolveClisRoot() {
  const candidates = [
    path.join(process.cwd(), "tools", "clis"),
    path.join(process.cwd(), "..", "..", "tools", "clis"),
  ];
  for (const candidate of candidates) {
    try {
      const names = await readdir(candidate);
      if (names.some((name) => name.endsWith(".js"))) return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("Marketing tool CLIs are not available.");
}

export async function listProviderIds() {
  const names = await readdir(await resolveClisRoot());
  return names
    .filter((name) => name.endsWith(".js"))
    .map((name) => name.slice(0, -3))
    .sort();
}

export async function isKnownProvider(provider: string) {
  return (await listProviderIds()).includes(provider);
}
