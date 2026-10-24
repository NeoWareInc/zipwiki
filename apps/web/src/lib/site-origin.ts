/**
 * Public site origin for canonical / Open Graph URLs.
 * Prefer an explicit site URL; fall back from the Vercel env, then production.
 */
export function resolveSiteOrigin(
  env: Record<string, string | undefined> = typeof process !== "undefined"
    ? process.env
    : {},
): string {
  const explicit = (
    env.SITE_URL ||
    env.VITE_SITE_URL ||
    env.ZIPWIKI_SITE_URL ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");
  if (explicit) return explicit;

  if (env.VERCEL_ENV === "production") return "https://zipwiki.ai";

  const branch = (env.VERCEL_GIT_COMMIT_REF || "").trim();
  if (branch === "dev") return "https://dev.zipwiki.ai";

  const vercel = (env.VERCEL_URL || "").trim().replace(/\/+$/, "");
  if (vercel) {
    return vercel.startsWith("http") ? vercel : `https://${vercel}`;
  }

  return "https://zipwiki.ai";
}

export function absoluteUrl(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, "");
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
