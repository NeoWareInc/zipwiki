import { useQuery } from "convex/react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@convex/_generated/api";

function CreditBar({
  used,
  purchased,
  unlimited,
}: {
  used: number;
  purchased: number;
  unlimited: boolean;
}) {
  if (unlimited) {
    return (
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">Credits</span>
          <span className="text-(--muted)">Unlimited</span>
        </div>
        <div className="h-2 rounded-full bg-(--line)">
          <div className="h-2 w-full rounded-full bg-(--accent)" />
        </div>
      </div>
    );
  }

  const remaining = Math.max(0, purchased - used);
  const pct =
    purchased <= 0
      ? 0
      : Math.min(100, Math.round((used / purchased) * 100));
  const low = remaining <= 500;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="font-medium">Credits</span>
        <span className="text-(--muted) tabular-nums">
          {remaining.toLocaleString()} remaining · {used.toLocaleString()} used
          / {purchased.toLocaleString()} purchased
        </span>
      </div>
      <div className="h-2 rounded-full bg-(--line)">
        <div
          className={`h-2 rounded-full ${low ? "bg-amber-500" : "bg-(--accent)"}`}
          style={{ width: `${purchased <= 0 ? 0 : pct}%` }}
        />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [params] = useSearchParams();
  const me = useQuery(api.profiles.me);
  const usage = useQuery(api.usage.myUsage);

  const unlimited = usage?.creditsUnlimited === true;
  const low = usage?.lowCredits === true;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Usage</h1>
        <p className="mt-1 text-(--muted)">
          Account: <strong>{me?.account.status ?? "—"}</strong>
        </p>
      </div>

      {params.get("checkout") === "success" && (
        <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
          Payment received — credits will appear in a few seconds.
        </p>
      )}
      {params.get("checkout") === "cancel" && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Checkout canceled — no credits were purchased.
        </p>
      )}

      {low && !unlimited && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Credits are running low (
          {(usage?.creditsRemaining ?? 0).toLocaleString()} remaining).{" "}
          <Link
            className="font-semibold text-(--accent) underline"
            to="/dashboard/billing"
          >
            Buy more credits
          </Link>{" "}
          to keep hosted LlamaParse and ZipWiki OKF available.
        </p>
      )}

      {usage && (
        <div className="space-y-6 rounded-xl border border-(--border) bg-white shadow-soft p-6">
          <CreditBar
            used={usage.creditsSpent ?? 0}
            purchased={usage.creditsPurchased ?? 0}
            unlimited={unlimited}
          />

          <div className="grid gap-4 md:grid-cols-2 text-sm">
            <div className="rounded-lg border border-(--border) bg-(--paper) p-4">
              <p className="font-medium">LlamaParse</p>
              <p className="mt-1 text-(--muted) tabular-nums">
                {(usage.llamaCredits ?? 0).toLocaleString()} Llama credits ·{" "}
                {(usage.parseCreditsSpent ?? 0).toLocaleString()} ZipWiki credits
              </p>
              <p className="mt-1 text-xs text-(--muted)">
                {usage.parseCount.toLocaleString()} documents this month. LlamaParse
                bills per page; ZipWiki charges that dollar cost ($1.25 per 1,000
                Llama credits).
              </p>
            </div>
            <div className="rounded-lg border border-(--border) bg-(--paper) p-4">
              <p className="font-medium">
                Hosted ZipWiki OKF / LLM (1 credit each)
              </p>
              <p className="mt-1 text-(--muted) tabular-nums">
                {usage.okfCount.toLocaleString()} this month
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-(--border) bg-(--paper) p-4 text-sm">
            <p className="font-medium text-(--ink)">
              LiteParse (unlimited, not billed)
            </p>
            <p className="mt-1 text-(--muted)">
              Success: <strong>{usage.liteparseSuccessCount ?? 0}</strong>
              {" · "}
              Failed: <strong>{usage.liteparseFailCount ?? 0}</strong>
              {" · "}
              Total:{" "}
              <strong>
                {(usage.liteparseSuccessCount ?? 0) +
                  (usage.liteparseFailCount ?? 0)}
              </strong>
            </p>
            <p className="mt-2 text-xs text-(--muted)">
              Local packs and credit-fallback use LiteParse. PDF is native;
              Office formats need LibreOffice on the packing machine. MCP{" "}
              <code className="text-xs">okf_enrich</code> uses your agent’s LLM
              at no credit cost.
            </p>
          </div>

          {!unlimited && (usage.creditsRemaining ?? 0) <= 0 && (
            <p className="text-sm text-(--muted)">
              No credits remaining —{" "}
              <Link
                className="text-(--accent) hover:underline"
                to="/dashboard/billing"
              >
                buy credits
              </Link>{" "}
              for hosted multi-format LlamaParse and ZipWiki OKF.
            </p>
          )}
          <p className="text-xs text-(--muted)">
            Period started {new Date(usage.periodStart).toLocaleDateString()}.
          </p>
        </div>
      )}
    </div>
  );
}
