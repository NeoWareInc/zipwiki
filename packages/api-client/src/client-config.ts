import { ClientConfigSchema, type ClientConfig } from "./types.js";

export class ZipwikiApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ZipwikiApiError";
    this.status = status;
    this.body = body;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text.slice(0, 200) };
  }
}

export async function apiFetch(
  baseUrl: string,
  path: string,
  init: RequestInit & { apiKey?: string } = {},
): Promise<Response> {
  const { apiKey, headers: extra, ...rest } = init;
  const headers = new Headers(extra);
  if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`);
  if (rest.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
    ...rest,
    headers,
  });
}

let cachedConfig: { key: string; at: number; value: ClientConfig } | null =
  null;
const CACHE_MS = 5 * 60 * 1000;

export function clearClientConfigCache(): void {
  cachedConfig = null;
}

/** Fetch hosted limits/defaults. Cached ~5 minutes per URL+key. */
export async function fetchClientConfig(
  baseUrl: string,
  apiKey: string,
  opts?: { bypassCache?: boolean },
): Promise<ClientConfig> {
  const cacheKey = `${normalizeBaseUrl(baseUrl)}\0${apiKey}`;
  const now = Date.now();
  if (
    !opts?.bypassCache &&
    cachedConfig &&
    cachedConfig.key === cacheKey &&
    now - cachedConfig.at < CACHE_MS
  ) {
    return cachedConfig.value;
  }

  const res = await apiFetch(baseUrl, "/api/client-config", { apiKey });
  const body = await parseJson(res);
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

  const parsed = ClientConfigSchema.parse(body);
  cachedConfig = { key: cacheKey, at: now, value: parsed };
  return parsed;
}
