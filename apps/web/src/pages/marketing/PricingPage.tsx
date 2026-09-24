import { PLANS } from "../../lib/marketing-copy";
import { PageHero, PrimaryCta, Section } from "./MarketingUi";

export default function PricingPage() {
  return (
    <main>
      <Section>
        <PageHero
          kicker="Pricing"
          title="Free locally. Credits for high-quality hosted parse."
          lead="Start with the plugin, local LiteParse, and your agent’s LLM. Add prepaid credits when documents need high-quality hosted parsing or ZipWiki OKF. About $10 covers roughly 640 pages of high-quality (Agentic) results."
        />

        <ul className="mt-10 grid gap-8 md:grid-cols-2">
          {PLANS.map((plan) => (
            <li key={plan.slug} className="flex flex-col">
              <h2 className="font-display text-2xl font-semibold text-(--ink)">
                {plan.name}
              </h2>
              <p className="mt-2 font-display text-3xl tracking-tight text-(--ink)">
                {plan.price}
              </p>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-(--muted)">
                {plan.blurb}
              </p>
              <div className="mt-6">
                <PrimaryCta to={plan.href}>{plan.cta}</PrimaryCta>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
