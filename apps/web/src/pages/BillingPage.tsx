import { useSearchParams } from "react-router-dom";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { formatPlanQuota } from "../lib/plan-labels";

const PLANS = [
  {
    slug: "standard" as const,
    name: "Standard",
    price: "$10/month",
    blurb:
      "2,000 LlamaParse documents (up to 100 pages), multi-format. 2,000 ZipWiki OKF enrichments. Extra usage falls back to Free (LiteParse + your agent’s LLM).",
  },
  {
    slug: "pro" as const,
    name: "Pro",
    price: "$50/month",
    blurb:
      "20,000 LlamaParse documents (up to 1,000 pages). 20,000 ZipWiki OKF enrichments. Extra usage falls back to Free (LiteParse + host LLM).",
  },
] as const;

const CUSTOM_MAILTO =
  "mailto:sales@zipwiki.ai?subject=ZipWiki%20Custom%20plan";

export default function BillingPage() {
  const [params] = useSearchParams();
  const [pending, setPending] = useState(false);
  const me = useQuery(api.profiles.me);
  const checkout = useAction(api.stripe.createCheckout);
  const portal = useAction(api.stripe.createBillingPortal);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">Billing</h1>

      {(params.get("success") || params.get("checkout") === "success") && (
        <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
          Subscription updated successfully.
        </p>
      )}

      {(params.get("cancel") || params.get("checkout") === "cancel") && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Checkout canceled — your plan was not changed.
        </p>
      )}

      <div className="rounded-xl border border-(--border) bg-white shadow-soft p-6 space-y-4">
        <p>
          Current plan: <strong>{me?.plan?.name ?? "Free"}</strong>
        </p>
        <p className="text-sm text-(--muted)">Status: {me?.account.status}</p>
        {me?.plan?.slug === "free" || !me?.plan ? (
          <p className="text-sm text-(--muted)">
            Free includes unlimited local LiteParse (PDF native; Office needs
            LibreOffice on your machine) and host-LLM OKF via MCP{" "}
            <code className="text-xs">okf_enrich</code>. No hosted
            LlamaParse or ZipWiki OKF quota.
          </p>
        ) : me.plan.slug === "custom" ? (
          <p className="text-sm text-(--muted)">
            Custom includes unlimited hosted LlamaParse and ZipWiki OKF
            (admin/sales assigned).
          </p>
        ) : (
          <p className="text-sm text-(--muted)">
            Includes {formatPlanQuota(me.plan.maxParsesPerMonth)} LlamaParse
            documents and {formatPlanQuota(me.plan.maxOkfPerMonth)} ZipWiki OKF
            enrichments per month
            {me.plan.maxPagesPerDocument != null
              ? ` (up to ${me.plan.maxPagesPerDocument.toLocaleString()} pages per document)`
              : ""}
            . When those quotas are used, usage soft-falls back to Free
            (LiteParse + host LLM) — not a hard block.
          </p>
        )}

        {me?.account.stripeCustomerId && (
          <button
            type="button"
            onClick={() => {
              setPending(true);
              void portal({})
                .then((res) => {
                  if (res.url) window.location.href = res.url;
                })
                .finally(() => setPending(false));
            }}
            disabled={pending}
            className="rounded-md border border-(--border) px-4 py-2 text-sm font-semibold"
          >
            Manage billing
          </button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {PLANS.map((plan) => (
          <div
            key={plan.slug}
            className={`rounded-xl border bg-white shadow-soft shadow-soft-hover p-6 space-y-3 ${
              me?.plan?.slug === plan.slug
                ? "border-(--accent) ring-1 ring-(--accent)/30"
                : "border-(--border)"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-semibold">{plan.name}</h2>
              {me?.plan?.slug === plan.slug && (
                <span className="rounded-full bg-(--accent)/10 px-2.5 py-0.5 text-xs font-semibold text-(--accent)">
                  Current
                </span>
              )}
            </div>
            <p className="text-sm text-(--muted)">{plan.price}</p>
            <p className="text-sm">{plan.blurb}</p>
            <button
              type="button"
              disabled={pending || me?.plan?.slug === plan.slug}
              onClick={() => {
                setPending(true);
                void checkout({ plan: plan.slug })
                  .then((res) => {
                    if (res.url) window.location.href = res.url;
                  })
                  .finally(() => setPending(false));
              }}
              className="rounded-md bg-(--accent) px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-(--accent-bright) disabled:opacity-50 disabled:hover:bg-(--accent)"
            >
              {me?.plan?.slug === plan.slug ? "Current plan" : `Choose ${plan.name}`}
            </button>
          </div>
        ))}
      </div>

      <p className="text-sm text-(--muted)">
        Need more?{" "}
        <a className="text-(--accent) hover:underline" href={CUSTOM_MAILTO}>
          Contact sales
        </a>{" "}
        for a Custom quote (unlimited hosted usage, admin-assigned).
      </p>
    </div>
  );
}
