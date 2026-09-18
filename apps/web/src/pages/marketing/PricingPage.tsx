import { PLANS } from "../../lib/marketing-copy";
import { PageHero, PrimaryCta, Section } from "./MarketingUi";

export default function PricingPage() {
  return (
    <main>
      <Section>
        <PageHero
          kicker="Pricing"
          title="Free to start. Hosted parse when you need it."
          lead="Free is the plugin plus local LiteParse and your agent’s LLM. Paid plans add hosted LlamaParse and ZipWiki OKF. When those quotas run out, you soft-fall back to Free—not a hard block."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {PLANS.map((plan) => (
            <div
              key={plan.slug}
              className="flex flex-col rounded-xl border border-(--border) bg-white/80 p-6 shadow-soft"
            >
              <h2 className="font-display text-2xl font-semibold text-(--ink)">
                {plan.name}
              </h2>
              <p className="mt-1 font-display text-3xl text-(--ink)">{plan.price}</p>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-(--muted)">
                {plan.blurb}
              </p>
              <div className="mt-6">
                <PrimaryCta to={plan.href}>{plan.cta}</PrimaryCta>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}
