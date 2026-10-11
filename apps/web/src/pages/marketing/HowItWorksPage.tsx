import {
  HOW_STEPS,
  OKF_FIELDS,
  OKF_INDEXING,
  PARSE_ENGINES,
  PARSE_FAMILIES,
  PARSE_PROBLEM,
  SAMPLE_CATALOG,
  SAMPLE_OKF,
} from "../../lib/marketing-copy";
import { FeatureGrid, PageHero, PromptCard, Section } from "./MarketingUi";

export default function HowItWorksPage() {
  return (
    <main>
      <Section>
        <PageHero
          kicker="How it works"
          title="Pack once. Open, search, and read only what you need."
          lead="Extract each source’s text into compact markdown under wiki/parsed/, index with OKF under wiki/okf/, summarize with a package digest, optionally omit bulky originals. Agents and the CLI follow the same sequence."
        />
      </Section>

      <section className="border-t border-(--line) bg-white/50">
        <Section>
          <h2 className="font-display text-3xl font-semibold text-(--ink)">
            {PARSE_PROBLEM.title}
          </h2>
          <p className="mt-3 max-w-3xl text-(--muted)">{PARSE_PROBLEM.lead}</p>
          <div className="mt-10">
            <FeatureGrid items={PARSE_FAMILIES} columns={2} />
          </div>
        </Section>
      </section>

      <Section>
        <h2 className="font-display text-3xl font-semibold text-(--ink)">
          Parsed means extracted markdown for AI
        </h2>
        <p className="mt-3 max-w-3xl text-(--muted)">
          At pack time ZipWiki pulls text documentation from each source into{" "}
          <code className="text-sm">wiki/parsed/*.md</code>—fast, compact, and
          easy for models to consume. That is the extreme speedup: agents stream
          markdown evidence instead of chewing through PDF or Word binaries.
        </p>
        <div className="mt-10">
          <FeatureGrid items={PARSE_ENGINES} />
        </div>
      </Section>

      <section className="border-t border-(--line) bg-white/50">
        <Section>
          <h2 className="font-display text-3xl font-semibold text-(--ink)">
            {OKF_INDEXING.title}
          </h2>
          <p className="mt-3 max-w-3xl text-(--muted)">{OKF_INDEXING.lead}</p>
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
        </Section>
      </section>

      <Section>
        <h2 className="font-display text-3xl font-semibold text-(--ink)">
          Pack, catalog, search, read, origin
        </h2>
        <p className="mt-3 max-w-2xl text-(--muted)">
          Same loop every time. Prefer OKF skims before streaming full extracted
          markdown.
        </p>
        <ol className="mt-12 grid gap-8 md:grid-cols-2">
          {HOW_STEPS.map((step, i) => (
            <li key={step.title} className="space-y-3">
              <p className="text-xs font-semibold tracking-wide text-(--accent) uppercase">
                Step {i + 1}
              </p>
              <h3 className="font-display text-2xl font-semibold text-(--ink)">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-(--muted)">{step.detail}</p>
              <PromptCard
                item={{
                  id: step.title.toLowerCase(),
                  title: `Say this — ${step.title}`,
                  description: "Copy into Cursor or Claude.",
                  prompt: step.prompt,
                }}
              />
            </li>
          ))}
        </ol>
      </Section>

      <section className="border-t border-(--line) bg-white/50">
        <Section>
          <h2 className="font-display text-3xl font-semibold text-(--ink)">
            What the agent should report
          </h2>
          <p className="mt-3 max-w-2xl text-(--muted)">
            A catalog from OKF and extracted markdown paths—not a raw zip listing.
          </p>
          <div className="mt-8 overflow-x-auto rounded-xl border border-(--border) bg-white shadow-soft">
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
        </Section>
      </section>
    </main>
  );
}
