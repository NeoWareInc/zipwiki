import {
  DOWNLOAD_PREREQS,
  WAITLIST_HREF,
} from "../../lib/marketing-copy";
import {
  PageHero,
  PrimaryCta,
  SecondaryCta,
  Section,
} from "./MarketingUi";

export default function InstallPage() {
  return (
    <main>
      <Section>
        <PageHero
          kicker="Install"
          title="Public installs are not open yet"
          lead="ZipWiki installers and the npm-from-site package will appear here when Beta is ready. There is no public install link at this time."
        />
        <div className="mt-8 flex flex-wrap gap-3">
          <PrimaryCta to={WAITLIST_HREF}>Join waitlist</PrimaryCta>
          <SecondaryCta to="/product">Product</SecondaryCta>
          <SecondaryCta to="/how-it-works">See how it works</SecondaryCta>
        </div>
      </Section>

      <section className="border-t border-(--line) bg-white/50">
        <Section>
          <h2 className="font-display text-3xl font-semibold text-(--ink)">
            What will ship here
          </h2>
          <p className="mt-3 max-w-3xl text-(--muted)">
            One package for this machine: the{" "}
            <code className="text-sm">zipwiki</code> command, LiteParse, and the{" "}
            <code className="text-sm">zipwiki-mcp</code> server. Builds for macOS
            (Apple silicon and Intel), Linux x64, and Windows x64—distributed from
            this site, not the public npm registry.
          </p>
          <h3 className="mt-10 font-display text-xl font-semibold text-(--ink)">
            Prerequisites (when available)
          </h3>
          <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-(--muted)">
            {DOWNLOAD_PREREQS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
      </section>

      <Section>
        <h2 className="font-display text-3xl font-semibold text-(--ink)">
          Early access
        </h2>
        <p className="mt-3 max-w-3xl text-(--muted)">
          Join the waitlist for release notes and install instructions. Until
          then, explore Product, How it works, MCP, and CLI on this site—or sign
          in if you already have an account.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <PrimaryCta to={WAITLIST_HREF}>Join waitlist</PrimaryCta>
          <SecondaryCta to="/login">Sign in</SecondaryCta>
        </div>
      </Section>
    </main>
  );
}
