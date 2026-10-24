import { useEffect, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { SITE_NAME } from "../../lib/marketing-copy";
import {
  DEVELOPER_OKF_TABS,
  DEVELOPER_PROMPTS,
  DEVELOPER_USE_CASE_CARDS,
  DOCS_INDEX_URL,
  FORMAT_SPECS_REPO_URL,
  getResourceArticle,
  NEOZIP_APPNOTE_URL,
  RESOURCE_ARTICLES,
  RESOURCE_CARDS,
  RESOURCES_SECTIONS,
  SPEC_COMPARISON_ROWS,
  ZIPWIKI_APPNOTE_URL,
  type ResourceCardItem,
} from "../../lib/resources-content";
import {
  CodeTabs,
  FeatureGrid,
  OnThisPage,
  PageHero,
  PrimaryCta,
  PromptCard,
  SecondaryCta,
  Section,
} from "./MarketingUi";

const TEAM_EMAIL = "team@zipwiki.ai";

const BARE_DOMAIN_RE = /(?<![\w.@/-])([a-z0-9-]+\.(?:ai|io|com))(?![\w/-])/gi;

function linkifyDomains(text: string): ReactNode {
  const parts = text.split(BARE_DOMAIN_RE);
  if (parts.length === 1) return text;
  return parts.map((part, idx) =>
    idx % 2 === 1 ? (
      <a
        key={idx}
        href={`https://${part.toLowerCase()}`}
        className="font-semibold text-(--accent) hover:underline"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}

const SECTION_SCROLL = "scroll-mt-[calc(var(--site-header-h,4.5rem)+3.5rem)]";

function Band({
  tone,
  id,
  children,
}: {
  tone: "plain" | "tint";
  id?: string;
  children: ReactNode;
}) {
  const shell =
    tone === "tint"
      ? "border-t border-(--line) bg-(--surface)"
      : "border-t border-(--line) bg-transparent";
  return (
    <div className={shell}>
      <Section id={id} className={SECTION_SCROLL}>
        {children}
      </Section>
    </div>
  );
}

function ResourceCard({ item }: { item: ResourceCardItem }) {
  const body = (
    <div className="flex h-full flex-col justify-between rounded-xl border border-(--border) bg-(--surface)/80 p-6 shadow-soft transition-colors hover:border-(--accent)">
      <div>
        <span className="inline-block rounded-full bg-(--accent)/12 px-2.5 py-0.5 text-xs font-semibold text-(--accent)">
          {item.badge}
        </span>
        <h3 className="mt-3 font-display text-xl font-semibold text-(--ink)">
          {item.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-(--muted)">
          {item.description}
        </p>
      </div>
      <p className="mt-5 text-sm font-semibold text-(--accent)">
        {item.ctaLabel}
      </p>
    </div>
  );

  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className="block h-full"
      >
        {body}
      </a>
    );
  }

  if (item.href.startsWith("#")) {
    return (
      <a href={item.href} className="block h-full">
        {body}
      </a>
    );
  }

  return (
    <Link to={item.href} className="block h-full">
      {body}
    </Link>
  );
}

export default function ResourcesPage() {
  return (
    <main>
      <Section id="overview" className={SECTION_SCROLL}>
        <PageHero
          kicker="Resources"
          title="Articles, specifications, and developer guides"
          lead="Explore how .zipwiki packages store extracted markdown and OKF concept cards, read the ZipWiki Application Note, and see how developers customize OKF enrichment for specialized document collections."
        />
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {RESOURCE_CARDS.map((item) => (
            <ResourceCard key={item.title} item={item} />
          ))}
        </div>
      </Section>

      <OnThisPage sections={RESOURCES_SECTIONS} />

      <Band tone="tint" id="articles">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold tracking-wide text-(--accent) uppercase">
            Articles
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-(--ink)">
            ZipWiki articles &amp; technical walkthroughs
          </h2>
          <p className="mt-3 text-(--muted)">
            Architecture notes, format deep dives, and practical patterns for
            building AI-searchable archives.
          </p>
        </div>

        <ul className="mt-10 space-y-6">
          {RESOURCE_ARTICLES.map((article) => (
            <li key={article.slug}>
              <article className="rounded-xl border border-(--border) bg-(--paper) p-6 shadow-soft transition-colors hover:border-(--accent)/60 md:p-8">
                <p className="text-xs font-medium text-(--muted)">
                  {article.date} · {article.category} ·{" "}
                  {article.readTimeMinutes} min read
                </p>
                <h3 className="mt-2 font-display text-2xl font-semibold text-(--ink)">
                  <Link
                    to={`/resources/${article.slug}`}
                    className="hover:text-(--accent)"
                  >
                    {article.title}
                  </Link>
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-(--muted)">
                  {article.excerpt}
                </p>
                <div className="mt-4">
                  <Link
                    to={`/resources/${article.slug}`}
                    className="text-sm font-semibold text-(--accent) hover:underline"
                  >
                    Read article →
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </Band>

      <Band tone="plain" id="appnote">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold tracking-wide text-(--accent) uppercase">
            Specifications
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-(--ink)">
            The ZipWiki Application Note &amp; format specs
          </h2>
          <p className="mt-3 text-(--muted)">
            Every <code className="text-xs">.zipwiki</code> file is a standard
            ZIP archive that follows the NeoZip container profile and adds the{" "}
            <code className="text-xs">wiki/</code> AI knowledge tree. Specs are
            public markdown (for NeoZip.io and other sites) and are also rendered
            here—while the ZipWiki product repository stays private.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <PrimaryCta to={ZIPWIKI_APPNOTE_URL}>
            Read ZipWiki Application Note
          </PrimaryCta>
          <SecondaryCta to={NEOZIP_APPNOTE_URL}>
            NeoZip Application Note →
          </SecondaryCta>
          <SecondaryCta to={DOCS_INDEX_URL}>All specs →</SecondaryCta>
        </div>

        <div className="mt-10 overflow-x-auto rounded-xl border border-(--border) bg-(--surface) shadow-soft">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-(--line) text-(--muted)">
              <tr>
                <th className="px-4 py-3 font-medium">Specification</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">What it defines</th>
                <th className="px-4 py-3 font-medium">Read</th>
                <th className="px-4 py-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {SPEC_COMPARISON_ROWS.map((row) => (
                <tr
                  key={row.document}
                  className="border-b border-(--line)/70 last:border-0"
                >
                  <td className="px-4 py-3.5 font-medium text-(--ink)">
                    {row.document}
                  </td>
                  <td className="px-4 py-3.5 text-(--muted)">{row.scope}</td>
                  <td className="px-4 py-3.5 text-(--muted)">{row.covers}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <Link
                      to={row.href}
                      className="font-semibold text-(--accent) hover:underline"
                    >
                      On site →
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <a
                      href={row.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-(--muted) hover:text-(--accent) hover:underline"
                    >
                      Markdown ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-(--muted)">
          Canonical raw files for NeoZip.io and partners:{" "}
          <a
            href={FORMAT_SPECS_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-(--accent) hover:underline"
          >
            github.com/NeoWareInc/format-specs
          </a>
          .
        </p>
      </Band>

      <Band tone="tint" id="developers">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold tracking-wide text-(--accent) uppercase">
            Developers &amp; Special Use Cases
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-(--ink)">
            Custom OKF enrichment, domain profiles, and special corpora
          </h2>
          <p className="mt-3 text-(--muted)">
            Out of the box, ZipWiki classifies documents and writes general OKF
            concept cards. When you pack specialized collections—such as SEC
            filings, state session laws, full-length books, or clinical
            records—you can customize how OKF cards, tags, topic pages, and
            package notices are generated.
          </p>
        </div>

        <div className="mt-10">
          <FeatureGrid items={DEVELOPER_USE_CASE_CARDS} columns={2} />
        </div>

        <div className="mt-10">
          <CodeTabs tabs={DEVELOPER_OKF_TABS} />
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {DEVELOPER_PROMPTS.map((item) => (
            <PromptCard key={item.id} item={item} />
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-(--border) bg-(--paper) p-8 text-center shadow-soft">
          <h3 className="font-display text-2xl font-semibold text-(--ink)">
            Have a great use case? Let&rsquo;s talk.
          </h3>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-(--muted)">
            If you have a strong use case for ZipWiki, are interested in
            partnering with us, or have other suggestions, we would love to hear
            from you. Email the ZipWiki team at{" "}
            <a
              href={`mailto:${TEAM_EMAIL}`}
              className="font-semibold text-(--accent) hover:underline"
            >
              {TEAM_EMAIL}
            </a>
            .
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <PrimaryCta to={`mailto:${TEAM_EMAIL}`}>Email the team</PrimaryCta>
            <SecondaryCta to="/resources/introducing-zipwiki">
              Read the ZipWiki intro →
            </SecondaryCta>
          </div>
        </div>
      </Band>
    </main>
  );
}

export function ResourceArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const article = slug ? getResourceArticle(slug) : undefined;

  useEffect(() => {
    if (article) {
      document.title = `${article.title} — ${SITE_NAME}`;
    }
    window.scrollTo(0, 0);
  }, [article]);

  if (!article) {
    return <Navigate to="/resources" replace />;
  }

  return (
    <main>
      <Section>
        <div className="mx-auto max-w-3xl">
          <Link
            to="/resources"
            className="inline-flex items-center gap-1 text-sm font-semibold text-(--accent) hover:underline"
          >
            ← All resources
          </Link>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold tracking-wide text-(--accent) uppercase">
              {article.date} · {article.category} · {article.readTimeMinutes}{" "}
              min read
            </p>
            {article.pdfPath ? (
              <a
                href={article.pdfPath}
                download={`${article.slug}.pdf`}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-(--border) bg-(--paper) px-4 py-2 text-sm font-semibold text-(--ink) transition-colors hover:border-(--accent) hover:text-(--accent)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                  aria-hidden
                >
                  <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                  <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
                </svg>
                Download PDF
              </a>
            ) : null}
          </div>

          {article.headerImage ? (
            <img
              src={article.headerImage}
              alt={article.title}
              width={1200}
              height={630}
              className="mt-4 block h-auto w-full rounded-xl border border-(--line)"
            />
          ) : null}

          <h1
            className={
              article.headerImage
                ? "sr-only"
                : "mt-2 font-display text-3xl font-semibold tracking-tight text-(--ink) md:text-4xl"
            }
          >
            {article.title}
          </h1>

          {article.headerImage ? null : (
            <p className="mt-4 text-lg leading-relaxed text-(--muted)">
              {article.excerpt}
            </p>
          )}

          <div className="mt-8 space-y-10 border-t border-(--line) pt-10">
            {article.sections.map((section) => (
              <section key={section.heading} className="space-y-4">
                <h2 className="font-display text-2xl font-semibold text-(--ink)">
                  {section.heading}
                </h2>
                {section.paragraphs.map((paragraph, idx) => (
                  <p
                    key={idx}
                    className="text-base leading-relaxed text-(--ink)/90"
                  >
                    {linkifyDomains(paragraph)}
                  </p>
                ))}
                {section.bullets && (
                  <ul className="space-y-2 pl-5 text-sm leading-relaxed text-(--ink)/90 list-disc">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{linkifyDomains(bullet)}</li>
                    ))}
                  </ul>
                )}
                {section.code && (
                  <div className="overflow-x-auto rounded-xl border border-(--border) bg-(--surface) p-5 shadow-soft">
                    <p className="text-xs font-semibold tracking-wide text-(--accent) uppercase">
                      {section.code.caption}
                    </p>
                    <pre className="mt-3 overflow-x-auto text-xs leading-relaxed text-(--ink)">
                      {section.code.snippet}
                    </pre>
                  </div>
                )}
              </section>
            ))}
          </div>

          <div className="mt-14 rounded-2xl border border-(--border) bg-(--surface) p-6 shadow-soft sm:flex sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold text-(--ink)">
                Questions or suggestions on this topic?
              </h3>
              <p className="mt-1 text-sm text-(--muted)">
                Have a use case, partnership idea, or suggestion? Email{" "}
                <a
                  href={`mailto:${TEAM_EMAIL}`}
                  className="font-semibold text-(--accent) hover:underline"
                >
                  {TEAM_EMAIL}
                </a>
                .
              </p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 sm:mt-0">
              <PrimaryCta to={`mailto:${TEAM_EMAIL}`}>Email the team</PrimaryCta>
              <SecondaryCta to="/resources">All resources</SecondaryCta>
            </div>
          </div>
        </div>
      </Section>
    </main>
  );
}
