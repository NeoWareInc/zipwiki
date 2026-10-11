import { Link } from "react-router-dom";
import UserFlow from "../UserFlow";
import {
  HOME_OUTCOMES,
  HOME_SURFACES,
  SITE_TAGLINE,
  WAITLIST_HREF,
} from "../lib/marketing-copy";
import { Logo } from "../components/Logo";
import { PrimaryCta, SecondaryCta, Section } from "./marketing/MarketingUi";

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
            Turn ordinary documents into a portable{" "}
            <code className="text-[0.95em]">.zipwiki</code>: source text
            extracted into compact markdown that AI can catalog, search, and
            read selectively—fast for models, without unpacking binaries or
            dumping every file into context.
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
          <div className="mt-10">
            <SecondaryCta to="/product">Explore product capabilities</SecondaryCta>
          </div>
        </Section>
      </section>

      <Section>
        <h2 className="font-display text-3xl font-semibold tracking-tight text-(--ink)">
          One knowledge file, three ways in
        </h2>
        <p className="mt-3 max-w-2xl text-(--muted)">
          Same <code className="text-sm">.zipwiki</code>, same open sequence—
          different operators.
        </p>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {HOME_SURFACES.map((surface) => (
            <div key={surface.title} className="space-y-3">
              <h3 className="font-display text-xl font-semibold text-(--ink)">
                {surface.title}
              </h3>
              <p className="text-sm leading-relaxed text-(--muted)">
                {surface.body}
              </p>
              <Link
                to={surface.to}
                className="inline-block text-sm font-semibold text-(--accent) underline-offset-4 hover:underline"
              >
                {surface.cta} →
              </Link>
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}
