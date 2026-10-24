import { SITE_NAME } from "./marketing-copy";
import { isNoIndexHost, NOINDEX_CONTENT } from "./robots-policy";
import { absoluteUrl, resolveSiteOrigin } from "./site-origin";

export type DocumentMeta = {
  title: string;
  description: string;
  /** Path or absolute URL for the preview image. */
  image?: string;
  /** Path or absolute URL for the canonical page. */
  path?: string;
  type?: "website" | "article";
};

function upsertMeta(
  attr: "name" | "property",
  key: string,
  content: string,
): void {
  let el = document.head.querySelector(`meta[${attr}="${CSS.escape(key)}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector(`link[rel="${CSS.escape(rel)}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/** Browser origin when available; otherwise build-time / env origin. */
export function publicSiteOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return resolveSiteOrigin();
    }
    return window.location.origin.replace(/\/+$/, "");
  }
  return resolveSiteOrigin();
}

/**
 * Update document title and social / SEO tags in the live SPA.
 * Crawlers still need the prerendered HTML from the build step.
 */
export function applyDocumentMeta(meta: DocumentMeta): void {
  const origin = publicSiteOrigin();
  const title = meta.title.includes(SITE_NAME)
    ? meta.title
    : `${meta.title} — ${SITE_NAME}`;
  document.title = title;

  upsertMeta("name", "description", meta.description);
  upsertMeta("property", "og:title", title);
  upsertMeta("property", "og:description", meta.description);
  upsertMeta("property", "og:type", meta.type ?? "website");
  upsertMeta("name", "twitter:card", "summary_large_image");
  upsertMeta("name", "twitter:title", title);
  upsertMeta("name", "twitter:description", meta.description);

  if (meta.image) {
    const image = absoluteUrl(origin, meta.image);
    upsertMeta("property", "og:image", image);
    upsertMeta("name", "twitter:image", image);
  }

  if (meta.path) {
    const url = absoluteUrl(origin, meta.path);
    upsertMeta("property", "og:url", url);
    upsertLink("canonical", url);
  }

  if (typeof window !== "undefined" && isNoIndexHost(window.location.hostname)) {
    upsertMeta("name", "robots", NOINDEX_CONTENT);
    upsertMeta("name", "googlebot", NOINDEX_CONTENT);
  }
}
