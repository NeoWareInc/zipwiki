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
          title="Turn files an AI cannot read into a catalog it can search"
          lead="Pack parses hard documents into markdown, writes an OKF index the agent can skim, then searches that index before opening a full parse. You talk to the agent. The .zipwiki stays on disk."
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
          Parse: make a markdown the agent can actually read
        </h2>
        <p className="mt-3 max-w-3xl text-(--muted)">
          ZipWiki does not upload your folder to a hosted vector store. It
          converts each primary into whole-document markdown under{" "}
          <code className="text-sm">wiki/parsed/</code> and keeps the original
          in the same archive. The agent streams that markdown when it needs
          evidence—not the binary Word file.
        </p>
        <div className="mt-10">
          <FeatureGrid items={PARSE_ENGINES} />
        </div>
        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-(--muted)">
          Plain <code className="text-xs">.txt</code> and markdown are already
          readable; parse still copies them so every document has the same
          path. Intermediate LibreOffice PDFs never enter the{" "}
          <code className="text-xs">.zipwiki</code>. If a TIFF or Office file
          cannot be parsed, it still appears in the catalog with OKF when the
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
            Search looks at those fields first, then optionally scans parsed
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
          Same loop every time. Prefer OKF skims before dumping full parses.
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
            Unparsed scans still appear so you can see what needs a better parse
            or a hosted pass.
          </p>
          <div className="mt-8 overflow-x-auto rounded-xl border border-(--border) bg-white shadow-soft">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-(--line) text-(--muted)">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">OKF</th>
                  <th className="px-4 py-3 font-medium">Parsed</th>
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
