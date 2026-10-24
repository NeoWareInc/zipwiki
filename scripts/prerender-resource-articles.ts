/**
 * After `vite build`, write one HTML file per public resource article so
 * crawlers and link previews see the right title, description, OG image,
 * and canonical URL (the SPA alone only ships the homepage head tags).
 *
 * Output: apps/web/dist/resources/<slug>/index.html
 *
 * Run: pnpm --filter @zipwiki/web exec tsx ../../scripts/prerender-resource-articles.ts
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RESOURCE_ARTICLES } from "../apps/web/src/lib/articles/index";
import type { ResourceArticle } from "../apps/web/src/lib/articles/types";
import {
  NOINDEX_CONTENT,
  shouldNoIndexBuild,
} from "../apps/web/src/lib/robots-policy";
import { absoluteUrl, resolveSiteOrigin } from "../apps/web/src/lib/site-origin";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const webRoot = join(root, "apps/web");
const distIndex = join(webRoot, "dist/index.html");

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function upsertMeta(
  html: string,
  attr: "name" | "property",
  key: string,
  content: string,
): string {
  const re = new RegExp(`<meta\\s+[^>]*${attr}=["']${key}["'][^>]*>`, "i");
  const tag = `<meta ${attr}="${key}" content="${escapeAttr(content)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function removeMeta(
  html: string,
  attr: "name" | "property",
  key: string,
): string {
  return html.replace(
    new RegExp(`\\s*<meta\\s+[^>]*${attr}=["']${key}["'][^>]*>`, "gi"),
    "",
  );
}

function upsertLink(html: string, rel: string, href: string): string {
  const re = new RegExp(`<link\\s+[^>]*rel=["']${rel}["'][^>]*>`, "i");
  const tag = `<link rel="${rel}" href="${escapeAttr(href)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function setTitle(html: string, title: string): string {
  return html.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeAttr(title)}</title>`,
  );
}

function applyArticleHead(
  html: string,
  article: ResourceArticle,
  origin: string,
): string {
  const title = `${article.title} — ZipWiki`;
  const description = article.excerpt;
  const path = `/resources/${article.slug}`;
  const canonical = absoluteUrl(origin, path);
  const image = absoluteUrl(
    origin,
    article.ogImage ?? article.headerImage ?? "/zipwiki-og.png",
  );

  let out = html;
  out = setTitle(out, title);
  out = upsertMeta(out, "name", "description", description);
  out = upsertMeta(out, "property", "og:title", title);
  out = upsertMeta(out, "property", "og:description", description);
  out = upsertMeta(out, "property", "og:image", image);
  out = upsertMeta(out, "property", "og:type", "article");
  out = upsertMeta(out, "property", "og:url", canonical);
  out = upsertMeta(out, "name", "twitter:card", "summary_large_image");
  out = upsertMeta(out, "name", "twitter:title", title);
  out = upsertMeta(out, "name", "twitter:description", description);
  out = upsertMeta(out, "name", "twitter:image", image);
  out = upsertLink(out, "canonical", canonical);
  return out;
}

function main(): void {
  if (!existsSync(distIndex)) {
    console.error(
      `prerender-resource-articles: missing ${distIndex} (run vite build first)`,
    );
    process.exit(1);
  }

  const origin = resolveSiteOrigin(process.env);
  if (!RESOURCE_ARTICLES.length) {
    console.error("prerender-resource-articles: no RESOURCE_ARTICLES found");
    process.exit(1);
  }

  const template = readFileSync(distIndex, "utf8");
  const noIndex = shouldNoIndexBuild(process.env);

  // Absolute OG/Twitter images on the homepage shell (crawlers prefer full URLs).
  const homeImage = absoluteUrl(origin, "/zipwiki-og.png");
  let home = template;
  home = upsertMeta(home, "property", "og:image", homeImage);
  home = upsertMeta(home, "name", "twitter:image", homeImage);
  home = upsertMeta(home, "property", "og:url", absoluteUrl(origin, "/"));
  home = upsertLink(home, "canonical", absoluteUrl(origin, "/"));
  if (noIndex) {
    home = upsertMeta(home, "name", "robots", NOINDEX_CONTENT);
    home = upsertMeta(home, "name", "googlebot", NOINDEX_CONTENT);
  } else {
    home = removeMeta(home, "name", "robots");
    home = removeMeta(home, "name", "googlebot");
  }
  writeFileSync(distIndex, home);

  const robotsPath = join(webRoot, "dist/robots.txt");
  if (noIndex) {
    writeFileSync(
      robotsPath,
      [
        "# Staging / rehearsal — do not index (duplicate of zipwiki.ai).",
        "User-agent: *",
        "Disallow: /",
        "",
      ].join("\n"),
    );
    console.log(
      `prerender-resource-articles: robots.txt Disallow:/ (noindex build)`,
    );
  } else {
    writeFileSync(
      robotsPath,
      ["User-agent: *", "Allow: /", ""].join("\n"),
    );
  }

  for (const article of RESOURCE_ARTICLES) {
    let html = applyArticleHead(home, article, origin);
    if (noIndex) {
      html = upsertMeta(html, "name", "robots", NOINDEX_CONTENT);
      html = upsertMeta(html, "name", "googlebot", NOINDEX_CONTENT);
    } else {
      html = removeMeta(html, "name", "robots");
      html = removeMeta(html, "name", "googlebot");
    }
    const outDir = join(webRoot, "dist/resources", article.slug);
    mkdirSync(outDir, { recursive: true });
    const outFile = join(outDir, "index.html");
    writeFileSync(outFile, html);
    console.log(
      `prerender-resource-articles: ${outFile} → ${origin}/resources/${article.slug}`,
    );
  }
}

main();
