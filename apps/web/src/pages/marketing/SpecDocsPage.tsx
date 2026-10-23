import { useEffect, useMemo } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { Link, Navigate, useParams } from "react-router-dom";
import { FORMAT_SPECS_REPO_URL } from "../../lib/docs-urls";
import { SITE_NAME } from "../../lib/marketing-copy";
import {
  getSpecDoc,
  rewriteSpecMarkdownLinks,
  SPEC_DOCS,
} from "../../lib/specs-catalog";
import {
  PageHero,
  PrimaryCta,
  SecondaryCta,
  Section,
} from "./MarketingUi";

const SECTION_SCROLL = "scroll-mt-[calc(var(--site-header-h,4.5rem)+3.5rem)]";

export function SpecDocsIndexPage() {
  useEffect(() => {
    document.title = `Format specifications — ${SITE_NAME}`;
    window.scrollTo(0, 0);
  }, []);

  return (
    <main>
      <Section className={SECTION_SCROLL}>
        <PageHero
          kicker="Specifications"
          title="ZipWiki & NeoZip format specs"
          lead="Application Notes are published as public markdown (citable on GitHub) and rendered here for reading. The ZipWiki product repository stays private."
        />

        <ul className="mt-10 grid gap-6 md:grid-cols-2">
          {SPEC_DOCS.map((doc) => (
            <li key={doc.slug}>
              <article className="flex h-full flex-col justify-between rounded-xl border border-(--border) bg-(--paper) p-6 shadow-soft">
                <div>
                  <h2 className="font-display text-xl font-semibold text-(--ink)">
                    <Link
                      to={doc.href}
                      className="hover:text-(--accent) hover:underline"
                    >
                      {doc.title}
                    </Link>
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-(--muted)">
                    {doc.description}
                  </p>
                </div>
                <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold">
                  <Link to={doc.href} className="text-(--accent) hover:underline">
                    Read on site →
                  </Link>
                  <a
                    href={doc.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-(--muted) hover:text-(--accent) hover:underline"
                  >
                    Source markdown ↗
                  </a>
                </div>
              </article>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-sm text-(--muted)">
          Canonical raw files:{" "}
          <a
            href={FORMAT_SPECS_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-(--accent) hover:underline"
          >
            github.com/NeoWareInc/format-specs
          </a>
          . NeoZip.io and other sites should link either here or to that repo.
        </p>
      </Section>
    </main>
  );
}

export function SpecDocPage() {
  const { slug } = useParams<{ slug: string }>();
  const doc = slug ? getSpecDoc(slug) : undefined;

  const html = useMemo(() => {
    if (!doc) return "";
    const rewritten = rewriteSpecMarkdownLinks(doc.markdown);
    const parsed = marked.parse(rewritten, { async: false });
    if (typeof parsed !== "string") return "";
    return DOMPurify.sanitize(parsed);
  }, [doc]);

  useEffect(() => {
    if (doc) {
      document.title = `${doc.title} — ${SITE_NAME}`;
    }
    window.scrollTo(0, 0);
  }, [doc]);

  if (!doc) {
    return <Navigate to="/docs" replace />;
  }

  return (
    <main>
      <Section className={SECTION_SCROLL}>
        <p className="text-sm">
          <Link
            to="/docs"
            className="font-semibold text-(--accent) hover:underline"
          >
            ← All specifications
          </Link>
        </p>
        <p className="mt-4 text-xs font-semibold tracking-wide text-(--accent) uppercase">
          Application Note / Spec
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-(--ink) md:text-4xl">
          {doc.title}
        </h1>
        <p className="mt-3 max-w-3xl text-(--muted)">{doc.description}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <PrimaryCta to={doc.sourceUrl}>View source markdown ↗</PrimaryCta>
          <SecondaryCta to="/resources#appnote">Resources overview</SecondaryCta>
        </div>
      </Section>

      <div className="border-t border-(--line) bg-(--surface)">
        <Section className={SECTION_SCROLL}>
          <article
            className="markdown-view max-w-3xl"
            // Trusted: our own AppNote markdown, sanitized with DOMPurify.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </Section>
      </div>
    </main>
  );
}
