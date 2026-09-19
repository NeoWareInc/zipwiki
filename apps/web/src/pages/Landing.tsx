import UserFlow from "../UserFlow";
import {
  ADVANCED_CLI,
  AGENT_PROMPTS,
  AUDIENCES,
  PLUGIN_BUNDLE,
  PLUGIN_HOSTS,
  PLUGIN_STEPS,
  SITE_TAGLINE,
  WAITLIST_HREF,
} from "../lib/marketing-copy";
import { Logo } from "../components/Logo";
import {
  FeatureGrid,
  PrimaryCta,
  PromptCard,
  SecondaryCta,
  Section,
} from "./marketing/MarketingUi";

export default function Landing() {
  return (
    <main>
      <section className="mx-auto flex max-w-6xl flex-col justify-center gap-10 px-6 py-12 md:gap-14 md:py-16">
        <div className="max-w-2xl space-y-5">
          <h1 className="anim-rise">
            <Logo
              variant="lockup"
              className="h-16 w-auto sm:h-20 md:h-[5.75rem]"
            />
          </h1>
          <p className="anim-rise anim-rise-delay-1 font-display text-2xl leading-snug text-(--ink) md:text-3xl">
            {SITE_TAGLINE}
          </p>
          <p className="anim-rise anim-rise-delay-2 max-w-xl text-base leading-relaxed text-(--muted) md:text-lg">
            Install the ZipWiki plugin. Your agent packs documents into a{" "}
            <code className="text-[0.95em]">.zipwiki</code> and can tell you
            what’s inside—no cloud index required.
          </p>
          <div className="anim-rise anim-rise-delay-3 flex flex-wrap items-center gap-3 pt-1">
            <PrimaryCta to={WAITLIST_HREF}>Join waitlist</PrimaryCta>
            <SecondaryCta to="/how-it-works">See how it works</SecondaryCta>
          </div>
        </div>
        <UserFlow />
      </section>

      <section className="border-t border-(--line) bg-white/50">
        <Section>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-(--ink)">
            Files, then the plugin, then answers
          </h2>
          <p className="mt-3 max-w-2xl text-(--muted)">
            The knowledge base is a portable <code className="text-sm">.zipwiki</code>{" "}
            file. The plugin is how you and your agent create and query it. The
            dashboard is only for account, keys, and billing.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {AUDIENCES.map((a) => (
              <div
                key={a.title}
                className="rounded-xl border border-(--border) bg-white/80 p-6 shadow-soft"
              >
                <h3 className="font-display text-lg font-semibold text-(--ink)">
                  {a.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--muted)">
                  {a.body}
                </p>
              </div>
            ))}
          </div>
        </Section>
      </section>

      <Section id="plugin" className="scroll-mt-24">
        <p className="text-xs font-semibold tracking-wide text-(--accent) uppercase">
          Plugin
        </p>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-(--ink) md:text-4xl">
          One install. Skills, MCP, and CLI.
        </h2>
        <p className="mt-3 max-w-2xl text-(--muted) md:text-lg">
          The ZipWiki plugin is the product. Your agent packs and queries{" "}
          <code className="text-sm">.zipwiki</code> files. You do not install
          three command-line tools.
        </p>
        <div className="mt-10">
          <FeatureGrid items={PLUGIN_BUNDLE} />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <PrimaryCta to={WAITLIST_HREF}>Join waitlist</PrimaryCta>
          <SecondaryCta to="/how-it-works">See how it works</SecondaryCta>
        </div>
      </Section>

      <section className="border-t border-(--line) bg-white/50">
        <Section>
          <h2 className="font-display text-3xl font-semibold text-(--ink)">
            Waitlist → plugin → ask
          </h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-2">
            {PLUGIN_STEPS.map((step, i) => (
              <li
                key={step}
                className="rounded-xl border border-(--border) bg-white/80 p-6 shadow-soft"
              >
                <p className="text-xs font-semibold text-(--accent)">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-(--ink)">{step}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PLUGIN_HOSTS.map((host) => (
              <div
                key={host.title}
                className="rounded-xl border border-(--border) bg-white/80 p-6 shadow-soft"
              >
                <h3 className="font-display text-lg font-semibold text-(--ink)">
                  {host.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--muted)">
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
          After the plugin is on, these are the asks—not terminal commands.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {AGENT_PROMPTS.map((item) => (
            <PromptCard key={item.id} item={item} />
          ))}
        </div>
      </Section>

      <section className="border-t border-(--line) bg-white/40">
        <Section>
          <details className="rounded-xl border border-(--border) bg-white/80 p-6 shadow-soft">
            <summary className="cursor-pointer font-display text-lg font-semibold text-(--ink)">
              Advanced / CI
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-(--muted)">
              CI and scripts can call zipwiki / zipaccess. Most people
              never open a terminal. The plugin includes that CLI.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-md bg-(--paper) px-3 py-2 text-xs text-(--ink)">
              {ADVANCED_CLI}
            </pre>
            <p className="mt-4 text-xs text-(--muted)">
              For plugin authors: the local MCP tools are pack, open, search,
              read OKF/parsed/entry, extract, and OKF enrich. Prefer the skill
              over calling tools by name in user-facing docs.
            </p>
          </details>
        </Section>
      </section>
    </main>
  );
}
