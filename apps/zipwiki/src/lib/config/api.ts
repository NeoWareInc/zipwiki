export type ZipWikiParseMode = "local" | "remote";
export type ZipWikiOkfMode = "local" | "remote";

/** Where parse credentials come from (default: zipwiki when API URL+key set). */
export type ParseCredentialSource = "zipwiki" | "llama" | "local";

/** Where OKF credentials come from (default: zipwiki when API URL+key set). */
export type OkfCredentialSource = "zipwiki" | "anthropic" | "local";

export type ZipwikiApiConfig = {
  url?: string;
  key?: string;
};

/** Named ZipWiki API deployments selectable in `zipwiki init` / `auth login --env`. */
export type ZipwikiApiTarget = "local" | "dev" | "production";

/**
 * Hosted Dev API. There is no localhost parse API for product use —
 * `--env local` and `--env dev` both target this deployment.
 */
export const ZIPWIKI_DEV_API_URL = "https://zipwiki-api-dev.fly.dev";

/**
 * Device codes are stored in Convex. The Fly dev app does not expose
 * `POST /auth/device/code` (deployment dashing-cod-224).
 */
export const ZIPWIKI_DEV_DEVICE_AUTH_URL =
  "https://dashing-cod-224.convex.site";

/** URLs that mean "dev" (including legacy localhost and the custom domain). */
export const ZIPWIKI_DEV_API_ALIASES = [
  ZIPWIKI_DEV_API_URL,
  "https://api-dev.zipwiki.ai",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
] as const;

export const ZIPWIKI_API_PRESETS: Record<
  ZipwikiApiTarget,
  { url: string; label: string; hint: string }
> = {
  local: {
    url: ZIPWIKI_DEV_API_URL,
    label: "Dev",
    hint: "hosted Dev account",
  },
  dev: {
    url: ZIPWIKI_DEV_API_URL,
    label: "Dev",
    hint: "hosted Dev account",
  },
  production: {
    url: "https://api.zipwiki.ai",
    label: "Production",
    hint: "zipwiki.ai",
  },
};

function normalizeApiUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

function isDevApiUrl(url: string): boolean {
  const n = normalizeApiUrl(url);
  return ZIPWIKI_DEV_API_ALIASES.some((alias) => normalizeApiUrl(alias) === n);
}

export function zipwikiApiUrlForTarget(target: ZipwikiApiTarget): string {
  // local and dev share the hosted Dev deployment
  if (target === "local" || target === "dev") return ZIPWIKI_DEV_API_URL;
  return ZIPWIKI_API_PRESETS[target].url;
}

/** Where `auth login` requests and polls a device code. */
export function zipwikiDeviceAuthUrl(target: ZipwikiApiTarget): string {
  if (target === "local" || target === "dev") return ZIPWIKI_DEV_DEVICE_AUTH_URL;
  return zipwikiApiUrlForTarget(target);
}

function firstHttpOrigin(value: string): string | undefined {
  for (const part of value.split(",")) {
    const match = part.trim().match(/^https?:\/\/[^\s,]+/i);
    if (match) return match[0].replace(/\/+$/, "");
  }
  return undefined;
}

/** Browser page for approving a device code. Drops a comma-joined WEB_ORIGIN. */
export function deviceApprovalPage(input: {
  verificationUri: string;
  verificationUriComplete?: string;
  userCode: string;
}): string {
  const complete = input.verificationUriComplete?.trim();
  if (complete && /^https?:\/\/[^,\s]+$/i.test(complete)) return complete;
  const origin =
    firstHttpOrigin(input.verificationUri) ??
    firstHttpOrigin(complete ?? "") ??
    "https://zipwiki.ai";
  const base = origin.replace(/\/cli\/device.*$/i, "").replace(/\/+$/, "");
  return `${base}/cli/device?user_code=${encodeURIComponent(input.userCode)}`;
}

const DASHBOARD_SETTINGS = {
  local: "http://localhost:5173/dashboard/settings",
  dev: "https://zipwiki-web-dev.vercel.app/dashboard/settings",
  production: "https://zipwiki.ai/dashboard/settings",
} as const;

/**
 * Dashboard settings page for the API this CLI is signed into.
 * A cached production URL does not override a dev login.
 */
export function dashboardSettingsUrl(input?: {
  apiUrl?: string;
  setupUrl?: string | null;
}): string {
  const apiUrl = input?.apiUrl ?? resolveZipwikiApiUrl();
  const target = resolveZipwikiApiTarget(apiUrl);
  const fallback =
    target === "production"
      ? DASHBOARD_SETTINGS.production
      : target === "local"
        ? DASHBOARD_SETTINGS.local
        : DASHBOARD_SETTINGS.dev;

  const setup = input?.setupUrl?.trim();
  if (!setup) return fallback;
  const origin = firstHttpOrigin(setup);
  if (!origin) return fallback;
  const page = setup.includes(",")
    ? `${origin.replace(/\/dashboard\/.*$/i, "").replace(/\/cli\/.*$/i, "")}/dashboard/settings`
    : setup.replace(/\?onboarding=1$/, "");

  if (target === "production") {
    return page.startsWith("https://zipwiki.ai/") ? page : fallback;
  }
  if (
    page.startsWith("https://zipwiki-web-dev.vercel.app/") ||
    page.startsWith("http://localhost") ||
    page.startsWith("http://127.0.0.1")
  ) {
    return page;
  }
  return fallback;
}

/**
 * API base saved after login. A missing or local URL from Convex falls back
 * to the Fly host for this target.
 */
export function accountApiUrlAfterLogin(
  approvedUrl: string | undefined,
  target: ZipwikiApiTarget,
): string {
  const fallback = zipwikiApiUrlForTarget(target);
  const url = approvedUrl?.trim().replace(/\/+$/, "") ?? "";
  if (!url || url.includes(",") || /localhost|127\.0\.0\.1/i.test(url)) {
    return fallback;
  }
  return url;
}

/** Match a configured URL to a named target (trailing slashes ignored). */
export function resolveZipwikiApiTarget(
  url: string | undefined = resolveZipwikiApiUrl(),
): ZipwikiApiTarget | undefined {
  if (!url?.trim()) return undefined;
  const normalized = normalizeApiUrl(url);
  if (normalized === normalizeApiUrl(ZIPWIKI_API_PRESETS.production.url)) {
    return "production";
  }
  if (isDevApiUrl(normalized)) return "dev";
  return undefined;
}

export function formatZipwikiApiTarget(url: string | undefined): string {
  const target = resolveZipwikiApiTarget(url);
  if (!target) return "Custom";
  return ZIPWIKI_API_PRESETS[target].label;
}

function envFlagTrue(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function hasZipwikiApiCredentials(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  // URL alone is enough to prefer the hosted API. Open/dev servers may not
  // require a client key; secured servers return 401 until a key is obtained
  // (e.g. via `zipwiki init` login/signup).
  return Boolean(resolveZipwikiApiUrl(env));
}

/**
 * Legacy flag. Prefer setting `ZIPWIKI_API_URL` (+ key when required).
 * When URL is set, parse/OKF already default to hosted without this flag.
 * Kept for older installs; do not write it from `auth login` / download.
 */
export function isHostedMode(input?: {
  env?: NodeJS.ProcessEnv;
}): boolean {
  return envFlagTrue((input?.env ?? process.env).ZIPWIKI_HOSTED_MODE);
}

/**
 * CLI distribution channel. Release builds lock `auth login` to production.
 * Default in this monorepo is **dev** unless `ZIPWIKI_CLI_CHANNEL=release`.
 */
export function zipCodexCliChannel(
  env: NodeJS.ProcessEnv = process.env,
): "dev" | "release" {
  const raw = env.ZIPWIKI_CLI_CHANNEL?.trim().toLowerCase();
  if (raw === "release" || raw === "production") return "release";
  if (raw === "dev" || raw === "development") return "dev";
  return "dev";
}

export function isZipWikiCliReleaseChannel(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return zipCodexCliChannel(env) === "release";
}

/**
 * Resolve which API preset `auth login` may target.
 * Release → always production. Dev channel → local|dev both mean hosted Dev; default: dev.
 */
export function resolveAuthLoginTarget(
  requested: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ZipwikiApiTarget {
  const release = isZipWikiCliReleaseChannel(env);
  const raw = requested?.trim().toLowerCase();

  if (release) {
    if (raw && raw !== "production") {
      throw new Error(
        `Release builds only support --env production (got ${raw}). Use a dev CLI build for local/dev.`,
      );
    }
    return "production";
  }

  if (!raw) return "dev";
  if (raw === "local" || raw === "dev") return "dev";
  if (raw === "production") return "production";
  throw new Error(
    `Unknown --env ${raw}. Use local, dev, or production (local and dev both use the hosted Dev API).`,
  );
}

function parseCredentialFromEnv(
  raw: string | undefined,
): ParseCredentialSource | undefined {
  const v = raw?.trim().toLowerCase();
  if (v === "zipwiki" || v === "llama" || v === "local") return v;
  return undefined;
}

function okfCredentialFromEnv(
  raw: string | undefined,
): OkfCredentialSource | undefined {
  const v = raw?.trim().toLowerCase();
  if (v === "zipwiki" || v === "anthropic" || v === "local") return v;
  return undefined;
}

/**
 * Resolve parse credential source.
 * Explicit `ZIPWIKI_PARSE_CREDENTIAL` wins (BYO override).
 * Otherwise URL set ⇒ hosted `zipwiki`; else `local`.
 */
export function resolveParseCredentialSource(
  env: NodeJS.ProcessEnv = process.env,
): ParseCredentialSource {
  const explicit = parseCredentialFromEnv(env.ZIPWIKI_PARSE_CREDENTIAL);
  if (explicit) return explicit;

  const legacyMode = env.ZIPWIKI_PARSE_MODE?.trim().toLowerCase();
  if (legacyMode === "remote") return "zipwiki";
  if (legacyMode === "local") return "local";

  // URL alone ⇒ hosted (key may be obtained later). HOSTED_MODE is legacy-only.
  if (hasZipwikiApiCredentials(env) || isHostedMode({ env })) {
    return "zipwiki";
  }

  return "local";
}

/**
 * Resolve OKF credential source.
 * Explicit `ZIPWIKI_OKF_CREDENTIAL` wins (BYO override).
 * Otherwise URL set ⇒ hosted `zipwiki`; else `local`.
 */
export function resolveOkfCredentialSource(
  env: NodeJS.ProcessEnv = process.env,
): OkfCredentialSource {
  const explicit = okfCredentialFromEnv(env.ZIPWIKI_OKF_CREDENTIAL);
  if (explicit) return explicit;

  const legacyMode = env.ZIPWIKI_OKF_MODE?.trim().toLowerCase();
  if (legacyMode === "remote") return "zipwiki";
  if (legacyMode === "local") return "local";

  if (hasZipwikiApiCredentials(env) || isHostedMode({ env })) {
    return "zipwiki";
  }

  return "local";
}

/** True when parse uses ZipWiki API (`ZIPWIKI_API_KEY`). */
export function isRemoteParseMode(input?: {
  env?: NodeJS.ProcessEnv;
  remoteParse?: boolean;
}): boolean {
  if (input?.remoteParse === true) return true;
  return resolveParseCredentialSource(input?.env) === "zipwiki";
}

/** True when OKF uses ZipWiki API (`ZIPWIKI_API_KEY`). */
export function isRemoteOkfMode(input?: {
  env?: NodeJS.ProcessEnv;
  remoteOkf?: boolean;
}): boolean {
  if (input?.remoteOkf === true) return true;
  return resolveOkfCredentialSource(input?.env) === "zipwiki";
}

export function isHostedApiConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return hasZipwikiApiCredentials(env);
}

export function resolveZipwikiApiUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const url = env.ZIPWIKI_API_URL?.trim();
  if (!url) return undefined;
  // Localhost and api-dev.zipwiki.ai aliases → hosted Dev Fly app.
  if (isDevApiUrl(url)) return ZIPWIKI_DEV_API_URL;
  return url;
}

export function resolveZipwikiApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const key = env.ZIPWIKI_API_KEY?.trim();
  return key || undefined;
}

export function resolveZipwikiApiConfig(
  env: NodeJS.ProcessEnv = process.env,
): ZipwikiApiConfig {
  return {
    url: resolveZipwikiApiUrl(env),
    key: resolveZipwikiApiKey(env),
  };
}
