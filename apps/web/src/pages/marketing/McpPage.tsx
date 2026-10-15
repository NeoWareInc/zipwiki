import {
  ADVANCED_CLI,
  AGENT_PROMPTS,
  CLI_MODES,
  MCP_TOOLS_BLURB,
  PLUGIN_BUNDLE,
  PLUGIN_HOSTS,
  PLUGIN_STEPS,
  SHOW_INSTALL_IN_NAV,
} from "../../lib/marketing-copy";
import {
  FeatureGrid,
  PageHero,
  PrimaryCta,
  PromptCard,
  SecondaryCta,
  Section,
} from "./MarketingUi";

export default function McpPage() {
  return (
    <main>
      <Section>
        <PageHero
          kicker="MCP & CLI"
          title="Agents and terminals, same local engine"
          lead="Stdio MCP for Cursor, Claude Code, and Claude Desktop—plus the zipwiki CLI for CI and scripts. Both talk to .zipwiki files on disk. No upload of the archive unless you choose hosted parse."
        />
        <div className="mt-10">
          <FeatureGrid items={PLUGIN_BUNDLE} />
        </div>
        {SHOW_INSTALL_IN_NAV && (
          <div className="mt-8 flex flex-wrap gap-3">
            <PrimaryCta to="/install#agents">Connect your agent</PrimaryCta>
            <SecondaryCta to="/install">Install CLI</SecondaryCta>
          </div>
        )}
      </Section>

      <section id="mcp" className="border-t border-(--line) bg-white/50">
        <Section>
          <h2 className="font-display text-3xl font-semibold text-(--ink)">
            MCP — tools for coding agents
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-(--muted)">
            {MCP_TOOLS_BLURB}
          </p>
          <h3 className="mt-10 font-display text-xl font-semibold text-(--ink)">
            Install → connect → ask
          </h3>
          <ol className="mt-6 grid gap-4 md:grid-cols-2">
            {PLUGIN_STEPS.map((step, i) => (
              <li key={step} className="space-y-2">
                <p className="text-xs font-semibold text-(--accent)">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="text-sm leading-relaxed text-(--ink)">{step}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PLUGIN_HOSTS.map((host) => (
              <div key={host.title} className="space-y-2">
                <h3 className="font-display text-lg font-semibold text-(--ink)">
                  {host.title}
                </h3>
                <p className="text-sm leading-relaxed text-(--muted)">
                  {host.body}
                </p>
              </div>
            ))}
          </div>
        </Section>
      </section>

      <Section>
        <h2 className="font-display text-3xl font-semibold text-(--ink)">
          Prompts to paste
        </h2>
        <p className="mt-2 max-w-2xl text-(--muted)">
          After the plugin is on, run the Florida session-laws sample. These are
          the asks—not terminal commands.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {AGENT_PROMPTS.map((item) => (
            <PromptCard key={item.id} item={item} />
          ))}
        </div>
      </Section>

      <section id="cli" className="border-t border-(--line) bg-white/50">
        <Section>
          <h2 className="font-display text-3xl font-semibold text-(--ink)">
            CLI — pack and query from a terminal
          </h2>
          <p className="mt-3 max-w-3xl text-(--muted)">
            The same engine MCP uses—pack, open, search, read, origin—for CI,
            sample corpora, and power users. Local-first: LiteParse without an
            account; login only for hosted credits.
          </p>
          <div className="mt-10">
            <FeatureGrid items={CLI_MODES} />
          </div>
          <h3 className="mt-12 font-display text-xl font-semibold text-(--ink)">
            Why the CLI matters
          </h3>
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
          <h3 className="mt-12 font-display text-xl font-semibold text-(--ink)">
            Example — Florida session laws
          </h3>
          <p className="mt-3 max-w-2xl text-(--muted)">
            Most people never open a terminal. When you do, the commands look
            like this:
          </p>
          <pre className="mt-6 overflow-x-auto rounded-md bg-(--paper) px-3 py-3 text-xs leading-relaxed text-(--ink)">
            {ADVANCED_CLI}
          </pre>
          {SHOW_INSTALL_IN_NAV && (
            <div className="mt-8">
              <PrimaryCta to="/install">Install</PrimaryCta>
            </div>
          )}
        </Section>
      </section>
    </main>
  );
}
