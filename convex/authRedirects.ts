/**
 * Allowed dashboard origins for Convex Auth redirects and similar links.
 * Prefer comma-separated WEB_ORIGIN; always include SITE_URL and local Vite.
 */
/** One origin for links. Prefers a hosted https origin over localhost. */
export function firstWebOrigin(): string {
  const origins = allowedAuthOrigins().filter((origin) =>
    /^https?:\/\//i.test(origin),
  );
  const hosted = origins.find(
    (origin) => !/localhost|127\.0\.0\.1/i.test(origin),
  );
  return hosted ?? origins[0] ?? "http://localhost:5173";
}

export function allowedAuthOrigins(): string[] {
  const fromWeb = (process.env.WEB_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const site = (process.env.SITE_URL ?? "").trim().replace(/\/$/, "");
  const defaults = ["http://localhost:5173", "http://localhost:3000"];
  return [...new Set([...fromWeb, ...(site ? [site] : []), ...defaults])];
}

/** This project's Vercel aliases / deployment hosts (not arbitrary *.vercel.app). */
export function isTrustedZipWikiHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "zipwiki.ai" || host === "www.zipwiki.ai") return true;
  if (/^zipwiki-web(?:[.-][a-z0-9-]+)?\.vercel\.app$/.test(host)) return true;
  if (/^zipwiki-[a-z0-9]+-neoware\.vercel\.app$/.test(host)) return true;
  return false;
}

function isLocalDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

function isAllowedRedirectOrigin(origin: string): boolean {
  if (allowedAuthOrigins().includes(origin)) return true;
  if (isLocalDevOrigin(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && isTrustedZipWikiHost(url.hostname);
  } catch {
    return false;
  }
}

/** Resolve a post-auth redirectTo against the allowlist. */
export function resolveAuthRedirect(redirectTo?: string): string {
  const raw = redirectTo?.trim() ?? "";
  if (!raw) {
    const site = (process.env.SITE_URL ?? "").trim().replace(/\/$/, "");
    if (!site) {
      throw new Error("SITE_URL is not configured for relative redirectTo");
    }
    return site;
  }
  const site = (process.env.SITE_URL ?? "").trim().replace(/\/$/, "");
  const origins = allowedAuthOrigins();

  if (raw.startsWith("/")) {
    if (!site) {
      throw new Error("SITE_URL is not configured for relative redirectTo");
    }
    return `${site}${raw}`;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid redirectTo: ${raw}`);
  }

  if (!isAllowedRedirectOrigin(url.origin)) {
    throw new Error(
      `Invalid redirectTo ${raw} for allowed origins: ${origins.join(", ")}`,
    );
  }
  return raw;
}
