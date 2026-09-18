import {
  PRODUCT_PILLARS,
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
          title="Ask your agent. Keep a file."
          lead="ZipWiki is not three CLIs to memorize. Install the plugin, then say what you want packed or found. Hosted parse is optional."
        />
        <div className="mt-10">
          <FeatureGrid items={PRODUCT_PILLARS} />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <PrimaryCta to="/#plugin">Install the plugin</PrimaryCta>
          <SecondaryCta to="/how-it-works">See the loop</SecondaryCta>
        </div>
      </Section>

      <section className="border-t border-(--line) bg-white/50">
        <Section>
          <h2 className="font-display text-3xl font-semibold text-(--ink)">
            Trust the archive, not a hosted index
          </h2>
          <p className="mt-3 max-w-2xl text-(--muted)">
            Integrity and layout are properties of the{" "}
            <code className="text-sm">.zipwiki</code>—not a tutorial for a
            terminal.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {TRUST_BULLETS.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-(--border) bg-white/80 p-6 shadow-soft"
              >
                <h3 className="font-semibold text-(--ink)">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-(--muted)">
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
