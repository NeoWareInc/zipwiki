import {
  CLASSIC_ZIP_PROBLEM,
  HOME_OUTCOMES,
  PRODUCT_CAPABILITIES,
  TRUST_BULLETS,
} from "../../lib/marketing-copy";
import {
  FeatureGrid,
  PageHero,
  PrimaryCta,
  SecondaryCta,
  Section,
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
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {CLASSIC_ZIP_PROBLEM.map((col) => (
            <div key={col.title} className="space-y-2">
              <h2 className="font-display text-xl font-semibold text-(--ink)">
                {col.title}
              </h2>
              <p className="text-sm leading-relaxed text-(--muted)">{col.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <section className="border-t border-(--line) bg-white/50">
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
            <FeatureGrid items={PRODUCT_CAPABILITIES} columns={2} />
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
          <PrimaryCta to="/install">Install</PrimaryCta>
          <SecondaryCta to="/how-it-works">See how it works</SecondaryCta>
        </div>
      </Section>

      <section className="border-t border-(--line) bg-white/50">
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
