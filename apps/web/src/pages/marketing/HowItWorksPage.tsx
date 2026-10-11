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
          lead="Extract each source’s text into compact markdown, index with OKF, summarize with ai.digest, optionally omit bulky originals. Agents and the CLI follow the same sequence—models read .md evidence, not binaries; the .zipwiki stays on disk."
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
          ZipWiki does not upload your folder to a hosted vector store. At pack
          time it pulls text documentation from each source into{" "}
          <code className="text-sm">wiki/parsed/*.md</code>—fast, compact, and
          easy for models to consume. That is the extreme speedup: agents stream
          markdown evidence instead of chewing through PDF or Word binaries. The
          original can stay in the same archive (or be omitted with an origin
          link).
        </p>
        <div className="mt-10">
          <FeatureGrid items={PARSE_ENGINES} />
        </div>
        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-(--muted)">
          Plain <code className="text-xs">.txt</code> and markdown are already
          readable; pack still places them under{" "}
          <code className="text-xs">wiki/parsed/</code> so every document has the
          same path. Intermediate LibreOffice PDFs never enter the{" "}
          <code className="text-xs">.zipwiki</code>. If a TIFF or Office file
          cannot be extracted, it still appears in the catalog with OKF when the
          agent can classify it from filename and any extracted scraps.
        </p>
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
          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-(--muted)">
            Search looks at those fields first, then optionally scans extracted
            markdown at a lower weight. That is why “find homestead exemption”
            works without loading every chapter into the chat. OKF is markdown
            you can open in any editor—the same files live at{" "}
            <code className="text-xs">wiki/okf/</code> inside the zip.
          </p>
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
            A catalog from OKF, not a raw zip listing. This is the Florida
            session-laws sample: <code className="text-xs">Ch_YYYY-NNN.pdf</code>{" "}
            maps to{" "}
            <code className="text-xs">https://laws.flrules.org/{"{year}/{chapter}"}</code>.
            Scans without extracted markdown still appear so you can see what
            needs a better extraction or a hosted pass.
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
                  <tr key={row.title} className="border-b border-(--line)/70 last:border-0">
                    <td className="px-4 py-3 font-medium text-(--ink)">{row.title}</td>
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
