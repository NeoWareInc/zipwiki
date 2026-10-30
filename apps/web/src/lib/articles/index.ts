import { introducingZipwiki } from "./introducing-zipwiki";
import { stillJustAZip } from "./still-just-a-zip";
import type { ResourceArticle } from "./types";

export type { ArticleSection, ResourceArticle } from "./types";

/**
 * Articles on /resources and /resources/:slug.
 *
 * Editorial drafts live in repo-root `/articles` (`.md` + `.pdf`) and stay
 * off the website until publish. Only released pieces belong here.
 */
export const RESOURCE_ARTICLES: readonly ResourceArticle[] = [
  stillJustAZip,
  introducingZipwiki,
];

/** Alias kept for older imports; drafts are no longer in the web tree. */
export const ALL_RESOURCE_ARTICLES: readonly ResourceArticle[] =
  RESOURCE_ARTICLES;

export function getResourceArticle(
  slug: string,
): ResourceArticle | undefined {
  return RESOURCE_ARTICLES.find((article) => article.slug === slug);
}

/** Public path for an article PDF when one is published under public/articles/. */
export function getResourceArticlePdfPath(slug: string): string | undefined {
  return getResourceArticle(slug)?.pdfPath;
}
