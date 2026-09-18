import { Link } from "react-router-dom";

function LegalShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="space-y-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-(--muted) hover:text-(--ink)"
          >
            <img
              src="/zipwiki-icon.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 rounded-md"
            />
            ZipWiki
          </Link>
          <h1 className="font-display text-3xl font-semibold text-(--ink)">
            {title}
          </h1>
          <p className="text-sm text-(--muted)">Last updated September 18, 2026</p>
        </div>
        <div className="space-y-4 text-sm leading-relaxed text-(--ink)/90">
          {children}
        </div>
        <p className="text-sm text-(--muted)">
          <Link to="/" className="underline underline-offset-2">
            Back to zipwiki.ai
          </Link>
        </p>
      </div>
    </main>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of Service">
      <p>
        By accessing or using ZipWiki (the website at zipwiki.ai, documentation,
        and related services we publish), you agree to these Terms of Service.
      </p>
      <p>
        <strong>The site today.</strong> zipwiki.ai is a public marketing site.
        Accounts, dashboard, API keys, and hosted parse are not offered yet.
        Waitlist requests are email only.
      </p>
      <p>
        <strong>Acceptable use.</strong> Do not abuse the site, attempt
        unauthorized access, or use ZipWiki materials to process unlawful
        content. We may refuse service that violates these terms or applicable
        law.
      </p>
      <p>
        <strong>Content.</strong> You retain rights to documents and packages
        you create locally. When hosted services exist, you will grant us a
        limited license to process that content solely to provide the service.
      </p>
      <p>
        <strong>Plans and billing.</strong> Paid plans described on /pricing are
        prospective. Fees, if any, will be billed according to the pricing shown
        at signup. Until signup exists, pricing is informational.
      </p>
      <p>
        <strong>Disclaimer.</strong> The site and future service are provided
        “as is.” We disclaim warranties to the fullest extent permitted by law
        and are not liable for indirect or consequential damages arising from
        use of the site or service.
      </p>
      <p>
        <strong>Changes.</strong> We may update these terms; continued use after
        notice constitutes acceptance. For questions, contact{" "}
        <a className="underline" href="mailto:hello@zipwiki.ai">
          hello@zipwiki.ai
        </a>
        .
      </p>
    </LegalShell>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <p>
        This Privacy Policy explains how ZipWiki collects and uses information
        when you use zipwiki.ai.
      </p>
      <p>
        <strong>Waitlist and contact.</strong> If you email hello@zipwiki.ai or
        sales@zipwiki.ai, we collect the address and message you send so we can
        reply. We do not sell that information.
      </p>
      <p>
        <strong>No accounts yet.</strong> We do not currently collect passwords,
        billing identifiers, or document contents through this site. When
        accounts and hosted parse launch, this policy will describe those
        processors (for example email verification, Stripe, LlamaParse).
      </p>
      <p>
        <strong>Usage data.</strong> Hosting providers may log standard request
        metadata (IP, user agent, timestamps) needed for security and
        reliability.
      </p>
      <p>
        <strong>Cookies.</strong> This marketing site does not require an
        account cookie. We do not sell personal information.
      </p>
      <p>
        <strong>Retention and rights.</strong> Contact{" "}
        <a className="underline" href="mailto:hello@zipwiki.ai">
          hello@zipwiki.ai
        </a>{" "}
        to request access or deletion of waitlist correspondence where
        applicable.
      </p>
    </LegalShell>
  );
}
