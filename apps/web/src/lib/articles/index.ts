import { customOkfDomainRules } from "./custom-okf-domain-rules";
import { insideTheZipwikiAppnote } from "./inside-the-zipwiki-appnote";
import { introducingZipwiki } from "./introducing-zipwiki";
import type { ResourceArticle } from "./types";

export type { ArticleSection, ResourceArticle } from "./types";

/** Every article kept in source (including drafts not yet public). */
export const ALL_RESOURCE_ARTICLES: readonly ResourceArticle[] = [
  introducingZipwiki,
  insideTheZipwikiAppnote,
  customOkfDomainRules,
];

/**
 * Articles shown on /resources and reachable at /resources/:slug.
 * Drafts remain in ALL_RESOURCE_ARTICLES for later publish.
 */
export const RESOURCE_ARTICLES: readonly ResourceArticle[] = [
  introducingZipwiki,
];

export function getResourceArticle(
  slug: string,
): ResourceArticle | undefined {
  return RESOURCE_ARTICLES.find((article) => article.slug === slug);
}

/** Public path for an article PDF when one is published under public/articles/. */
export function getResourceArticlePdfPath(slug: string): string | undefined {
  return getResourceArticle(slug)?.pdfPath;
}
