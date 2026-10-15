import {
  AGENT_PROMPTS,
  MCP_TOOLS_BLURB,
  PLUGIN_BUNDLE,
  PLUGIN_HOSTS,
  PLUGIN_STEPS,
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
          kicker="MCP"
          title="Let coding agents use a local .zipwiki like a tool"
          lead="Stdio MCP on the machine that holds the file—Cursor, Claude Code, Claude Desktop, and similar hosts. No upload of the archive. No exploding it onto disk to answer a question."
        />
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-(--muted)">
          {MCP_TOOLS_BLURB}
        </p>
        <div className="mt-10">
          <FeatureGrid items={PLUGIN_BUNDLE} />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <PrimaryCta to="/install#agents">Connect your agent</PrimaryCta>
          <SecondaryCta to="/cli">CLI</SecondaryCta>
        </div>
      </Section>

      <section className="border-t border-(--line) bg-white/50">
        <Section>
          <h2 className="font-display text-3xl font-semibold text-(--ink)">
            Install → connect → ask
          </h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-2">
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
    </main>
  );
}
