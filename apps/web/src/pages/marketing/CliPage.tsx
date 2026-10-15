import {
  ADVANCED_CLI,
  CLI_MODES,
} from "../../lib/marketing-copy";
import {
  FeatureGrid,
  PageHero,
  PrimaryCta,
  SecondaryCta,
  Section,
} from "./MarketingUi";

export default function CliPage() {
  return (
    <main>
      <Section>
        <PageHero
          kicker="CLI"
          title="Create and query packages from a terminal"
          lead="The same engine MCP uses—pack, open, search, read, origin—for CI, sample corpora, and power users. Local-first: LiteParse without an account; login only for hosted credits."
        />
        <div className="mt-10">
          <FeatureGrid items={CLI_MODES} />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <PrimaryCta to="/install">Install</PrimaryCta>
          <SecondaryCta to="/mcp">MCP</SecondaryCta>
        </div>
      </Section>

      <section className="border-t border-(--line) bg-white/50">
        <Section>
          <h2 className="font-display text-3xl font-semibold text-(--ink)">
            Why the CLI matters
          </h2>
          <ul className="mt-6 max-w-3xl list-disc space-y-3 pl-5 text-(--muted)">
            <li>
              <span className="font-medium text-(--ink)">Local-first.</span> Pack
              and query without an account; enrich later with{" "}
              <code className="text-xs">okf_enrich</code> or hosted OKF when you
              have credits.
            </li>
            <li>
              <span className="font-medium text-(--ink)">Scriptable.</span> CI and
              sample corpora get the full selective-read loop.
            </li>
            <li>
              <span className="font-medium text-(--ink)">Parity with MCP.</span>{" "}
              Anything the agent can do, the CLI can demonstrate and automate.
            </li>
            <li>
              <span className="font-medium text-(--ink)">Future Rust CLI.</span> A
              faster native binary for supported OSes; TypeScript remains the
              everywhere runtime for MCP and web-adjacent hosts.
            </li>
          </ul>
        </Section>
      </section>

      <Section>
        <h2 className="font-display text-3xl font-semibold text-(--ink)">
          Example — Florida session laws
        </h2>
        <p className="mt-3 max-w-2xl text-(--muted)">
          Most people never open a terminal. When you do, the commands look like
          this:
        </p>
        <pre className="mt-6 overflow-x-auto rounded-md bg-(--paper) px-3 py-3 text-xs leading-relaxed text-(--ink)">
          {ADVANCED_CLI}
        </pre>
      </Section>
    </main>
  );
}
