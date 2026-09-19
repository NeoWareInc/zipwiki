import { apiFetch, ZipwikiApiError } from "./client-config.js";
import {
  AccountSettingsResponseSchema,
  type AccountSettingsBody,
  type AccountSettingsBodyInput,
  type AccountSettingsResponse,
} from "./account-settings.js";

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text.slice(0, 200) };
  }
}

export async function fetchAccountSettings(
  baseUrl: string,
  apiKey: string,
): Promise<AccountSettingsResponse> {
  const res = await apiFetch(baseUrl, "/api/settings", { apiKey });
  const body = await readJson(res);
  if (!res.ok) {
    const msg =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : res.statusText;
    throw new ZipwikiApiError(msg, res.status, body);
  }
  return AccountSettingsResponseSchema.parse(body);
}

/** Session-less upload is not available; Bearer clients use dashboard PUT via session.
 *  Kept for future CLI migrate when server adds PUT /api/settings. */
export async function putAccountSettingsBearer(
  baseUrl: string,
  apiKey: string,
  patch: AccountSettingsBodyInput & { markSetupComplete?: boolean },
): Promise<AccountSettingsResponse> {
  const res = await apiFetch(baseUrl, "/api/settings", {
    apiKey,
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = await readJson(res);
  if (!res.ok) {
    const msg =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : res.statusText;
    throw new ZipwikiApiError(msg, res.status, body);
  }
  return AccountSettingsResponseSchema.parse(body);
}

export async function waitForSetupComplete(
  baseUrl: string,
  apiKey: string,
  opts: {
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onPending?: (setupUrl: string | null) => void;
  } = {},
): Promise<AccountSettingsResponse> {
  const intervalMs = opts.intervalMs ?? 3000;
  const timeoutMs = opts.timeoutMs ?? 30 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;
  let lastUrl: string | null = null;

  while (Date.now() < deadline) {
    if (opts.signal?.aborted) throw new Error("Setup wait aborted");
    const cfg = await fetchAccountSettings(baseUrl, apiKey);
    if (cfg.setupComplete) return cfg;
    const nextUrl: string | null = cfg.setupUrl ?? lastUrl;
    if (nextUrl !== lastUrl) {
      lastUrl = nextUrl;
      opts.onPending?.(nextUrl);
    } else {
      opts.onPending?.(lastUrl);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    "Timed out waiting for account setup — finish settings in the dashboard",
  );
}

export type { AccountSettingsBody, AccountSettingsBodyInput };
