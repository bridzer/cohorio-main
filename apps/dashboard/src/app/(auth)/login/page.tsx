import { redirect } from "next/navigation";

export default async function LoginCompatibilityPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") search.set(key, value);
    else if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
  }
  redirect(`/sign-in${search.size ? `?${search.toString()}` : ""}`);
}
