/**
 * Staging / rehearsal hosts must not be indexed (duplicate of zipwiki.ai).
 */

export function isNoIndexHost(hostname: string): boolean {
  const host = hostname.split(":")[0]?.toLowerCase() ?? "";
  if (host === "dev.zipwiki.ai") return true;
  // Vercel preview for the `dev` git branch (e.g. zipwiki-web-git-dev-neoware.vercel.app)
  if (host.includes("-git-dev-")) return true;
  return false;
}

/** Build-time: inject noindex when this deploy is not production zipwiki.ai. */
export function shouldNoIndexBuild(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.VERCEL_ENV === "production") return false;
  if (env.VERCEL_ENV === "preview") return true;
  if ((env.VERCEL_GIT_COMMIT_REF || "").trim() === "dev") return true;
  const site = (
    env.SITE_URL ||
    env.VITE_SITE_URL ||
    env.ZIPWIKI_SITE_URL ||
    ""
  ).toLowerCase();
  if (site.includes("dev.zipwiki.ai")) return true;
  return false;
}

export const NOINDEX_CONTENT = "noindex, nofollow";
