/**
 * Public API origin for this Convex deployment.
 * Device login must not hand the CLI a localhost or pasted-wrong ZIPWIKI_API_URL.
 * Keep these hosts aligned with ZIPWIKI_API_PRESETS in the CLI.
 */
const DEV_CONVEX_SITE = "dashing-cod-224";
const DEV_API_URL = "https://zipwiki-api-dev.fly.dev";
const PROD_API_URL = "https://api.zipwiki.ai";

function trimOrigin(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

function isLocalOrigin(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url) || url.includes(",");
}

export function canonicalPublicApiUrl(
  env: {
    CONVEX_SITE_URL?: string;
    ZIPWIKI_API_URL?: string;
    ZIPWIKI_PUBLIC_API_URL?: string;
  } = process.env,
): string {
  const site = trimOrigin(env.CONVEX_SITE_URL).toLowerCase();
  if (site.includes(DEV_CONVEX_SITE)) return DEV_API_URL;

  const raw = trimOrigin(env.ZIPWIKI_API_URL || env.ZIPWIKI_PUBLIC_API_URL);
  const normalized = raw.toLowerCase();
  if (
    normalized === DEV_API_URL ||
    normalized === "https://api-dev.zipwiki.ai"
  ) {
    return DEV_API_URL;
  }
  if (
    normalized === PROD_API_URL ||
    normalized === "https://zipwiki-api-prod.fly.dev"
  ) {
    return PROD_API_URL;
  }
  if (raw && !isLocalOrigin(raw)) return raw;
  return PROD_API_URL;
}
