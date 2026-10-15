import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";

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
            <Logo variant="mark" alt="" className="h-7 w-7" />
            ZipWiki
          </Link>
          <h1 className="font-display text-3xl font-semibold text-(--ink)">
            {title}
          </h1>
          <p className="text-sm text-(--muted)">Last updated October 15, 2026</p>
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
        These Terms of Service (“Terms”) govern your use of ZipWiki, including
        zipwiki.ai, the ZipWiki CLI and MCP server, account portal, APIs, and
        related documentation (together, the “Service”), offered by NeoWare Inc.
        (“ZipWiki,” “we,” “us”). By accessing or using the Service, you agree to
        these Terms.
      </p>

      <p>
        <strong>The Service.</strong> ZipWiki helps you create and query
        portable <code className="text-xs">.zipwiki</code> packages. You may use
        the CLI and MCP server locally without an account. Optional hosted
        features (such as hosted document parse, OKF enrichment, and related
        APIs) require an account and prepaid credits.
      </p>

      <p>
        <strong>Accounts.</strong> You must provide a valid email address and
        keep your account secure. You are responsible for activity under your
        account and API keys. Notify us promptly of unauthorized use. We may
        suspend or terminate accounts that violate these Terms or create risk to
        the Service or other users.
      </p>

      <p>
        <strong>Acceptable use.</strong> You may not: abuse or overload the
        Service; attempt unauthorized access; reverse engineer hosted components
        except as allowed by law; interfere with security or billing; use the
        Service to process unlawful content; or resell hosted capacity in a way
        that circumvents our credit or rate limits without our written consent.
        We may refuse or limit use that violates these Terms or applicable law.
      </p>

      <p>
        <strong>Your content.</strong> You retain rights to documents and{" "}
        <code className="text-xs">.zipwiki</code> packages you create. Local
        packages remain on your systems unless you submit content to a hosted
        feature. For hosted features, you grant NeoWare Inc. a limited license
        to process that content solely to provide the requested service, operate
        and secure the Service, and comply with law. You represent that you have
        the rights needed to submit that content.
      </p>

      <p>
        <strong>Credits and billing.</strong> Local CLI and MCP use is free.
        Hosted features consume prepaid credits purchased through our billing
        provider (Stripe). Credit rates and what a credit buys are shown in the
        account billing UI at purchase or use time. Credits are generally
        non-refundable except where required by law or where we state otherwise.
        Unused credits may expire if we publish an expiration policy in the
        billing UI. Prices and rates may change prospectively.
      </p>

      <p>
        <strong>Software and APIs.</strong> Local CLI/MCP software is provided
        under its applicable license terms (including any open-source notices
        shipped with the package). Hosted APIs may change; we will try to avoid
        breaking changes without notice for production clients, but we do not
        guarantee uninterrupted or error-free operation.
      </p>

      <p>
        <strong>Third-party services.</strong> Hosted parse and model features
        may rely on third-party processors. Their availability and output quality
        are outside our full control. Use of those features is also subject to
        any applicable third-party terms.
      </p>

      <p>
        <strong>Privacy.</strong> How we handle personal information is
        described in our{" "}
        <Link to="/privacy" className="underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </p>

      <p>
        <strong>Disclaimer.</strong> The Service is provided “as is” and “as
        available.” To the fullest extent permitted by law, we disclaim
        warranties of merchantability, fitness for a particular purpose, and
        non-infringement. We do not warrant that outputs from parse, OKF, or
        answer features are complete, accurate, or suitable for any legal,
        medical, financial, or other professional use without your own review.
      </p>

      <p>
        <strong>Limitation of liability.</strong> To the fullest extent
        permitted by law, NeoWare Inc. is not liable for indirect, incidental,
        special, consequential, or punitive damages, or for lost profits, data,
        or business, arising from your use of the Service. Our aggregate
        liability for claims relating to the Service is limited to the greater
        of (a) the amounts you paid us for credits in the twelve months before
        the claim or (b) one hundred U.S. dollars (US$100).
      </p>

      <p>
        <strong>Termination.</strong> You may stop using the Service at any
        time. We may suspend or end access if you breach these Terms or if we
        discontinue the Service. Provisions that by nature should survive
        (including ownership, disclaimers, and liability limits) will survive
        termination.
      </p>

      <p>
        <strong>Changes.</strong> We may update these Terms from time to time.
        The “Last updated” date will change when we do. Continued use after an
        update constitutes acceptance of the revised Terms.
      </p>

      <p>
        <strong>Contact.</strong>{" "}
        <a className="underline" href="mailto:hello@zipwiki.ai">
          hello@zipwiki.ai
        </a>
        . NeoWare Inc.
      </p>
    </LegalShell>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <p>
        This Privacy Policy describes how NeoWare Inc. (“ZipWiki,” “we,” “us”)
        collects, uses, and shares information when you use zipwiki.ai, the
        ZipWiki CLI and MCP server, and related hosted APIs.
      </p>

      <p>
        <strong>Local-first by design.</strong> Creating and querying a{" "}
        <code className="text-xs">.zipwiki</code> package with the CLI or MCP
        on your machine keeps your documents and package files on that machine.
        We do not receive those files unless you use a hosted feature that
        requires sending content to our API (for example hosted parse or hosted
        OKF enrichment).
      </p>

      <p>
        <strong>Account information.</strong> If you create an account, we
        collect your email address and authentication data (one-time codes sent
        by email; optional device approval for CLI login). We store account
        settings, API keys you create in the portal, prepaid credit balances,
        and related account metadata.
      </p>

      <p>
        <strong>Billing.</strong> Credit purchases are processed by Stripe. We
        receive payment status, customer identifiers, and purchase amounts needed
        to credit your account. We do not store full card numbers on ZipWiki
        servers; Stripe handles card data under its own terms and privacy
        policy.
      </p>

      <p>
        <strong>Hosted processing.</strong> When you choose hosted parse, OKF
        enrichment, or similar APIs, document bytes or derived text you submit
        are processed to fulfill that request. We may use subprocessors such as
        LlamaParse (document parsing) and model providers (for example Anthropic
        for OKF or answer features). Content is used to provide the requested
        service, not to sell or publicly disclose your documents.
      </p>

      <p>
        <strong>Usage and operations.</strong> We keep records of credit
        consumption, feature usage (for example parse or OKF jobs), and
        operational logs (such as IP address, user agent, timestamps, and error
        metadata) for billing, security, abuse prevention, and reliability.
        Hosting and backend providers (including our website host, API host, and
        Convex database) may process the same classes of data as needed to run
        the service.
      </p>

      <p>
        <strong>Contact email.</strong> If you email{" "}
        <a className="underline" href="mailto:hello@zipwiki.ai">
          hello@zipwiki.ai
        </a>
        , we collect the address and message content so we can respond.
      </p>

      <p>
        <strong>Cookies and sessions.</strong> Signed-in areas use session or
        authentication cookies (or equivalent browser storage) to keep you
        logged in and protect the account. The public marketing pages do not
        require an account cookie. We do not use advertising trackers on the
        site for the purpose of selling personal information.
      </p>

      <p>
        <strong>Sharing.</strong> We share information with service providers
        that help us operate ZipWiki (authentication email delivery, payments,
        hosting, databases, and document/AI processors you invoke). We do not
        sell personal information. We may disclose information if required by
        law or to protect the security and integrity of the service.
      </p>

      <p>
        <strong>Retention.</strong> We retain account, billing, and usage
        records for as long as your account is active and as needed for legal,
        tax, and security purposes. You may request deletion of your account;
        some records (for example payment history) may be kept where we are
        required to do so.
      </p>

      <p>
        <strong>Your choices.</strong> You can avoid hosted processing by using
        only local CLI/MCP workflows. You can update account settings in the
        portal, revoke API keys, and contact us to request access, correction,
        or deletion of personal data we hold, subject to applicable law.
      </p>

      <p>
        <strong>Children.</strong> ZipWiki is not directed to children under 13,
        and we do not knowingly collect personal information from them.
      </p>

      <p>
        <strong>Changes.</strong> We may update this policy from time to time.
        The “Last updated” date at the top will change when we do. Continued use
        of the service after an update means you accept the revised policy.
      </p>

      <p>
        <strong>Contact.</strong> Privacy questions:{" "}
        <a className="underline" href="mailto:hello@zipwiki.ai">
          hello@zipwiki.ai
        </a>
        . NeoWare Inc.
      </p>
    </LegalShell>
  );
}
