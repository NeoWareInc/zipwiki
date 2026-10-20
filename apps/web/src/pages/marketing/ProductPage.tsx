import {
  CLASSIC_ZIP_PROBLEM,
  HOME_OUTCOMES,
  PRODUCT_CAPABILITIES,
  PRODUCT_HERO_IMAGE,
  PRODUCT_STATS,
  PRODUCT_WORKFLOW,
  SHOW_INSTALL_IN_NAV,
  TRUST_BULLETS,
} from "../../lib/marketing-copy";
import {
  FeatureGrid,
  IllustratedFlow,
  PageHero,
  PrimaryCta,
  SecondaryCta,
  Section,
  StatBand,
  ThemedImage,
} from "./MarketingUi";

export default function ProductPage() {
  return (
    <main>
      <Section>
        <PageHero
          kicker="Product"
          titleClassName="max-w-none text-[clamp(1.15rem,5.4vw,3rem)]"
          title={
            <>
              <span className="block whitespace-nowrap">Compact when stored.</span>
              <span className="block whitespace-nowrap">
                Efficiently retrieved when needed.
              </span>
            </>
          }
          lead="Long-term archives must balance minimal storage footprints with long-term accessibility. Designed for AI-driven retrieval, ZipWiki pairs compressed document storage with pre-indexed Markdown—allowing agents to query and inspect historical records instantly."
        />
        <div className="mt-10">
          <ThemedImage
            eager
            src={PRODUCT_HERO_IMAGE.src}
            alt={PRODUCT_HERO_IMAGE.alt}
            width={PRODUCT_HERO_IMAGE.width}
            height={PRODUCT_HERO_IMAGE.height}
            className="h-auto w-full rounded-3xl shadow-soft ring-1 ring-(--line)"
          />
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {CLASSIC_ZIP_PROBLEM.map((col, i) => (
            <figure
              key={col.title}
              className="overflow-hidden rounded-2xl border border-(--border) bg-(--surface) shadow-soft"
            >
              <ThemedImage
                src={col.image.src}
                alt={col.image.alt}
                width={600}
                height={340}
                className="block h-auto w-full"
              />
              <figcaption className="space-y-2 p-6">
                <p
                  className={`text-xs font-semibold tracking-wide uppercase ${
                    i === 0 ? "text-(--muted)" : "text-(--accent)"
                  }`}
                >
                  {i === 0 ? "Before" : "With ZipWiki"}
                </p>
                <h2 className="font-display text-xl font-semibold text-(--ink)">
                  {col.title}
                </h2>
                <p className="text-sm leading-relaxed text-(--muted)">
                  {col.body}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <section className="border-t border-(--line) bg-linear-to-br from-(--hero-glow) via-(--paper) to-(--hero-warm)">
        <Section>
          <IllustratedFlow flow={PRODUCT_WORKFLOW} />
          <div className="mt-10">
            <SecondaryCta to="/how-it-works">
              See each step in detail
            </SecondaryCta>
          </div>
        </Section>
      </section>

      <section className="border-t border-(--line) bg-(--surface)/50">
        <Section>
          <h2 className="font-display text-3xl font-semibold text-(--ink)">
            Differentiating capabilities
          </h2>
          <p className="mt-3 max-w-2xl text-(--muted)">
            What ships today—text documentation extracted to markdown for extreme
            AI speedup, an embedded index, and selective access without a private
            server just to understand what you hold.
          </p>
          <div className="mt-10">
            <FeatureGrid items={PRODUCT_CAPABILITIES} columns={3} />
          </div>
          <div className="mt-14">
            <StatBand stats={PRODUCT_STATS} />
          </div>
        </Section>
      </section>

      <Section>
        <h2 className="font-display text-3xl font-semibold tracking-tight text-(--ink)">
          Portable document memory with an embedded AI index
        </h2>
        <p className="mt-3 max-w-2xl text-(--muted)">
          Not another cloud drive. Not generic RAG. ZipWiki keeps a portable
          archive as the distribution unit, then adds extracted markdown and an
          OKF index inside the same file.
        </p>
        <ul className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {HOME_OUTCOMES.map((item) => (
            <li key={item.title} className="space-y-2">
              <h3 className="font-display text-lg font-semibold text-(--ink)">
                {item.title}
              </h3>
              <p className="text-sm leading-relaxed text-(--muted)">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-wrap gap-3">
          {SHOW_INSTALL_IN_NAV ? (
            <PrimaryCta to="/install">Install</PrimaryCta>
          ) : (
            <PrimaryCta to="/mcp">MCP & CLI</PrimaryCta>
          )}
          <SecondaryCta to="/how-it-works">See how it works</SecondaryCta>
        </div>
      </Section>

      <section className="border-t border-(--line) bg-(--surface)/50">
        <Section>
          <h2 className="font-display text-3xl font-semibold text-(--ink)">
            Trust the archive, not a hosted index
          </h2>
          <p className="mt-3 max-w-2xl text-(--muted)">
            Integrity and layout are properties of the{" "}
            <code className="text-sm">.zipwiki</code>. The web portal is control
            plane and human Q&A—credits buy hosted intelligence; the file remains
            portable.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {TRUST_BULLETS.map((item) => (
              <div key={item.title} className="space-y-2">
                <h3 className="font-semibold text-(--ink)">{item.title}</h3>
                <p className="text-sm leading-relaxed text-(--muted)">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </Section>
      </section>
    </main>
  );
}
