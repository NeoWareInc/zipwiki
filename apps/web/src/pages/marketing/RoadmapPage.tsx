import { ROADMAP } from "../../lib/marketing-copy";
import { PageHero, Section, StatusBadge } from "./MarketingUi";

export default function RoadmapPage() {
  return (
    <main>
      <Section>
        <PageHero
          kicker="Roadmap"
          title="What ZipWiki is when it’s finished"
          lead="The site describes the completed product. Badges mark what you can use now, what’s next to ship, and what we may add later."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {ROADMAP.map((item) => (
            <article
              key={item.title}
              className="rounded-xl border border-(--border) bg-white/80 p-5 shadow-soft"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-lg font-semibold text-(--ink)">
                  {item.title}
                </h2>
                <StatusBadge status={item.status} />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-(--muted)">
                {item.why}
              </p>
            </article>
          ))}
        </div>
      </Section>
    </main>
  );
}
