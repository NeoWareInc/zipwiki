/**
 * Allowed dashboard origins for Convex Auth redirects and similar links.
 * Prefer comma-separated WEB_ORIGIN; always include SITE_URL and local Vite.
 */
export function allowedAuthOrigins(): string[] {
  const fromWeb = (process.env.WEB_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const site = (process.env.SITE_URL ?? "").trim().replace(/\/$/, "");
  const defaults = ["http://localhost:5173"];
  return [...new Set([...fromWeb, ...(site ? [site] : []), ...defaults])];
}

/** Resolve a post-auth redirectTo against the allowlist. */
export function resolveAuthRedirect(redirectTo: string): string {
  const raw = redirectTo.trim();
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

  const origin = url.origin;
  if (!origins.includes(origin)) {
    throw new Error(
      `Invalid redirectTo ${raw} for allowed origins: ${origins.join(", ")}`,
    );
  }
  return raw;
}
