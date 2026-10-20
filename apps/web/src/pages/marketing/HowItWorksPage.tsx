import type { ReactNode } from "react";
import {
  CREATE_PACKAGE,
  HOW_COMING_SOON,
  HOW_EXTRACT_FLOW,
  HOW_IT_WORKS_HERO,
  HOW_PACK_FLOW,
  HOW_QUERY_FLOW,
  HOW_SECTIONS,
  OKF_FIELDS,
  OKF_INDEXING,
  OKF_SPEC_LINK_LABEL,
  OKF_SPEC_URL,
  ORIGIN_LINKS,
  PACKAGE_ACTIONS,
  PARSE_ENGINES,
  PARSE_FAMILIES,
  PARSE_PROBLEM,
  SAMPLE_CATALOG,
  SAMPLE_OKF,
} from "../../lib/marketing-copy";
import {
  CodeTabs,
  FeatureGrid,
  IllustratedFlow,
  OnThisPage,
  PageHero,
  PromptCard,
  Section,
} from "./MarketingUi";

/** Room for the sticky site header + section menu when jumping to an anchor. */
const SECTION_SCROLL = "scroll-mt-[calc(var(--site-header-h,4.5rem)+3.5rem)]";

/** Full-bleed band so consecutive sections alternate clearly. */
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

export default function HowItWorksPage() {
  return (
    <main>
      <Section>
        <PageHero
          kicker="How it works"
          title={HOW_IT_WORKS_HERO.title}
          lead={HOW_IT_WORKS_HERO.lead}
        />
      </Section>

      <OnThisPage sections={HOW_SECTIONS} />

      <Band tone="tint" id="pack">
        <h2 className="font-display text-3xl font-semibold text-(--ink)">
          {CREATE_PACKAGE.title}
        </h2>
        <p className="mt-3 max-w-3xl text-(--muted)">{CREATE_PACKAGE.lead}</p>
        <div className="mt-10 grid gap-8 md:grid-cols-2">
          {CREATE_PACKAGE.jobs.map((job) => (
            <div key={job.title} className="space-y-2">
              <h3 className="font-display text-xl font-semibold text-(--ink)">
                {job.title}
              </h3>
              <p className="text-sm leading-relaxed text-(--muted)">
                {job.body}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-16">
          <IllustratedFlow flow={HOW_PACK_FLOW} headingLevel={3} />
        </div>
      </Band>

      <Band tone="plain" id="parsing">
        <h2 className="font-display text-3xl font-semibold text-(--ink)">
          {PARSE_PROBLEM.title}
        </h2>
        <p className="mt-3 max-w-3xl text-(--muted)">{PARSE_PROBLEM.lead}</p>
        <div className="mt-10">
          <FeatureGrid items={PARSE_FAMILIES} columns={2} />
        </div>
        <p className="mt-10 max-w-3xl text-sm leading-relaxed text-(--muted)">
          Parsed means extracted markdown under{" "}
          <code className="text-xs">wiki/parsed/</code>—evidence the agent
          streams when needed, not the binary. ZipWiki does not upload your
          folder to a hosted vector store.
        </p>
        <div className="mt-8">
          <FeatureGrid items={PARSE_ENGINES} />
        </div>
        <p className="mt-8 max-w-3xl text-sm font-medium text-(--ink)">
          {HOW_COMING_SOON}
        </p>
      </Band>

      <Band tone="tint" id="okf">
        <h2 className="font-display text-3xl font-semibold text-(--ink)">
          {OKF_INDEXING.title}
        </h2>
        <p className="mt-3 max-w-3xl text-(--muted)">{OKF_INDEXING.lead}</p>
        <p className="mt-4 text-sm">
          <a
            className="font-medium text-(--accent) hover:underline"
            href={OKF_SPEC_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {OKF_SPEC_LINK_LABEL}
          </a>
        </p>
        <div className="mt-10">
          <FeatureGrid items={OKF_FIELDS} columns={2} />
        </div>
        <div className="mt-10 overflow-x-auto rounded-xl border border-(--border) bg-(--paper) p-5 shadow-soft">
          <p className="text-xs font-semibold tracking-wide text-(--accent) uppercase">
            Example OKF frontmatter
          </p>
          <pre className="mt-3 overflow-x-auto text-xs leading-relaxed text-(--ink)">
            {SAMPLE_OKF}
          </pre>
        </div>
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-(--muted)">
          Search looks at those fields first, then optionally scans extracted
          markdown at a lower weight. That is why “find homestead exemption”
          works without loading every chapter into the chat. OKF is markdown
          you can open in any editor—the same files live at{" "}
          <code className="text-xs">wiki/okf/</code> inside the zip.
        </p>
      </Band>

      <Band tone="plain" id="origins">
        <h2 className="font-display text-3xl font-semibold text-(--ink)">
          {ORIGIN_LINKS.title}
        </h2>
        <p className="mt-3 max-w-3xl text-(--muted)">{ORIGIN_LINKS.lead}</p>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {ORIGIN_LINKS.methods.map((method) => (
            <div key={method.title} className="space-y-2">
              <h3 className="font-display text-xl font-semibold text-(--ink)">
                {method.title}
              </h3>
              <p className="text-sm leading-relaxed text-(--muted)">
                {method.body}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-10">
          <CodeTabs
            tabs={[
              {
                label: "TSV list",
                caption: ".zipwiki-origins.tsv — one file, one link",
                code: ORIGIN_LINKS.tsvExample,
              },
              {
                label: "JSON map",
                caption: ".zipwiki-origins.json — entries map",
                code: ORIGIN_LINKS.jsonExample,
              },
              {
                label: "Filename pattern",
                caption: "Patterned names (optional)",
                code: ORIGIN_LINKS.patternExample,
              },
              {
                label: "Pack command",
                caption: "Pack with origins",
                code: ORIGIN_LINKS.cliExample,
              },
            ]}
          />
        </div>
        <div className="mt-8 max-w-2xl">
          <PromptCard
            item={{
              id: "pack-with-origins",
              title: "Ask your agent",
              description: "Pack a mixed earnings folder using a file→URL list.",
              prompt: ORIGIN_LINKS.agentPrompt,
            }}
          />
        </div>
      </Band>

      <div className="border-t border-(--line) bg-linear-to-br from-(--hero-glow) via-(--paper) to-(--hero-warm)">
        <Section id="query-extract" className={SECTION_SCROLL}>
          <p className="text-xs font-semibold tracking-wide text-(--accent) uppercase">
            Query &amp; Extract
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-(--ink)">
            The two moves agents make on a package
          </h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-(--muted)">
            Query answers from the index and extracted markdown. Extract
            writes real originals to disk. Both open the .zipwiki
            selectively—neither unpacks the whole archive.
          </p>
          <div className="mt-14">
            <IllustratedFlow flow={HOW_QUERY_FLOW} headingLevel={3} />
          </div>
          <div className="mt-20">
            <IllustratedFlow flow={HOW_EXTRACT_FLOW} headingLevel={3} />
          </div>
        </Section>
      </div>

      <Band tone="tint" id="actions">
        <h2 className="font-display text-3xl font-semibold text-(--ink)">
          {PACKAGE_ACTIONS.title}
        </h2>
        <p className="mt-3 max-w-3xl text-(--muted)">{PACKAGE_ACTIONS.lead}</p>
        <ul className="mt-12 grid gap-8 md:grid-cols-2">
          {PACKAGE_ACTIONS.items.map((action) => (
            <li key={action.title} className="space-y-3">
              <h3 className="font-display text-2xl font-semibold text-(--ink)">
                {action.title}
              </h3>
              <p className="text-sm leading-relaxed text-(--muted)">
                {action.detail}
              </p>
              <PromptCard
                item={{
                  id: action.title.toLowerCase().replace(/\s+/g, "-"),
                  title: `Say this — ${action.title}`,
                  description: "Copy into your AI agent.",
                  prompt: action.prompt,
                }}
              />
            </li>
          ))}
        </ul>
      </Band>

      <Band tone="plain" id="catalog">
        <h2 className="font-display text-3xl font-semibold text-(--ink)">
          What the agent should report
        </h2>
        <p className="mt-3 max-w-2xl text-(--muted)">
          A catalog from OKF, not a raw zip listing. This is the Florida
          session-laws sample:{" "}
          <code className="text-xs">Ch_YYYY-NNN.pdf</code> maps to{" "}
          <code className="text-xs">
            https://laws.flrules.org/{"{year}/{chapter}"}
          </code>
          . Scans without extracted markdown still appear so you can see what
          needs a better extraction or a hosted pass.
        </p>
        <div className="mt-8 overflow-x-auto rounded-xl border border-(--border) bg-(--surface) shadow-soft">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-(--line) text-(--muted)">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">OKF</th>
                <th className="px-4 py-3 font-medium">Markdown</th>
                <th className="px-4 py-3 font-medium">Read next</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_CATALOG.map((row) => (
                <tr
                  key={row.title}
                  className="border-b border-(--line)/70 last:border-0"
                >
                  <td className="px-4 py-3 font-medium text-(--ink)">
                    {row.title}
                  </td>
                  <td className="px-4 py-3 text-(--muted)">{row.type}</td>
                  <td className="px-4 py-3">{row.okf ? "Yes" : "—"}</td>
                  <td className="px-4 py-3">{row.parsed ? "Yes" : "No"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-(--muted)">
                    {row.next}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Band>
    </main>
  );
}
