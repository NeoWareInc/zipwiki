import { apiFetch, ZipwikiApiError } from "./client-config.js";
import {
  AccountSettingsBodySchema,
  AccountSettingsResponseSchema,
  DEFAULT_ACCOUNT_SETTINGS,
  mergeAccountSettings,
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

/** Accept partial / slightly messy portal payloads. */
function parseSettingsResponse(body: unknown): AccountSettingsResponse {
  if (!body || typeof body !== "object") {
    throw new ZipwikiApiError("invalid_settings_response", 502, body);
  }
  const raw = body as Record<string, unknown>;
  const settingsRaw = settingsRawShape(raw.settings) ? raw.settings : {};
  let settings: AccountSettingsBody;
  try {
    settings = mergeAccountSettings(
      DEFAULT_ACCOUNT_SETTINGS,
      settingsRaw as AccountSettingsBodyInput,
    );
  } catch {
    settings = AccountSettingsBodySchema.parse(DEFAULT_ACCOUNT_SETTINGS);
  }
  return AccountSettingsResponseSchema.parse({
    settings,
    setupComplete: raw.setupComplete === true,
    setupCompletedAt:
      typeof raw.setupCompletedAt === "string" ? raw.setupCompletedAt : null,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
    setupUrl: typeof raw.setupUrl === "string" ? raw.setupUrl : null,
  });
}

function settingsRawShape(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
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
  return parseSettingsResponse(body);
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
  return parseSettingsResponse(body);
}

export async function waitForSetupComplete(
  baseUrl: string,
  apiKey: string,
  opts: {
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onPending?: (setupUrl: string | null) => void;
    onError?: (message: string) => void;
    /** Tried when primary host returns 401/403/404/502/503 (e.g. Convex site). */
    fallbackBaseUrls?: string[];
  } = {},
): Promise<AccountSettingsResponse> {
  const intervalMs = opts.intervalMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const deadline = Date.now() + timeoutMs;
  let lastUrl: string | null = null;
  let consecutiveFailures = 0;
  const hosts = [baseUrl, ...(opts.fallbackBaseUrls ?? [])]
    .map((h) => h.trim().replace(/\/+$/, ""))
    .filter(Boolean)
    .filter((h, i, all) => all.indexOf(h) === i);

  async function fetchOnce(): Promise<AccountSettingsResponse> {
    let lastErr: unknown;
    for (const host of hosts) {
      try {
        return await fetchAccountSettings(host, apiKey);
      } catch (err) {
        lastErr = err;
        if (
          err instanceof ZipwikiApiError &&
          [401, 403, 404, 502, 503].includes(err.status)
        ) {
          continue;
        }
        throw err;
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error("settings_fetch_failed");
  }

  while (Date.now() < deadline) {
    if (opts.signal?.aborted) throw new Error("Setup wait aborted");
    try {
      const cfg = await fetchOnce();
      consecutiveFailures = 0;
      if (cfg.setupComplete) return cfg;
      const nextUrl: string | null = cfg.setupUrl ?? lastUrl;
      if (nextUrl !== lastUrl) {
        lastUrl = nextUrl;
        opts.onPending?.(nextUrl);
      } else {
        opts.onPending?.(lastUrl);
      }
    } catch (err) {
      consecutiveFailures += 1;
      const msg = err instanceof Error ? err.message : String(err);
      opts.onError?.(msg);
      // Don't sit for minutes on a dead API — key is already saved by the caller.
      if (consecutiveFailures >= 3) {
        throw new Error(
          `Could not reach /api/settings (${msg}). Finish Settings in the dashboard, then: zipwiki settings pull`,
        );
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    "Timed out waiting for account setup — finish settings in the dashboard, then: zipwiki settings pull",
  );
}

export type { AccountSettingsBody, AccountSettingsBodyInput };
