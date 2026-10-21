import { ToolInputError } from "@/lib/agent/registry";

/**
 * A provider call failed. The message is safe to show the user and the model:
 * it never contains the provider's response body, which can echo credentials.
 */
export class ProviderError extends ToolInputError {
  constructor(
    public readonly provider: string,
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;

export function providerFailureMessage(label: string, status: number | null) {
  if (status === null) return `${label} did not respond. Try again shortly.`;
  if (status === 401 || status === 403) {
    return `${label} rejected the saved credentials. Reconnect it in Settings → Marketing tools.`;
  }
  if (status === 404) return `${label} could not find that account or resource.`;
  if (status === 429) return `${label} rate limit reached. Try again later.`;
  return `${label} returned an error (HTTP ${status}).`;
}

export async function providerJson<T>(
  label: string,
  url: string,
  init: RequestInit = {},
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ProviderError(label, null, providerFailureMessage(label, null));
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new ProviderError(label, response.status, providerFailureMessage(label, response.status));
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new ProviderError(label, response.status, `${label} returned an unreadable response.`);
  }
}
