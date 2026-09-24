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
          <span className="font-medium">ZipWiki credits</span>
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
        <span className="font-medium">ZipWiki credits</span>
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

function formatBytes(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function eventLabel(type: string, engine?: string | null): string {
  if (type === "parse") return "Hosted parse";
  if (type === "okf") return "ZipWiki OKF";
  if (type === "liteparse") return "LiteParse";
  if (type === "pack") return "Pack";
  if (type === "query") {
    const action = engine?.trim();
    if (action === "open") return "Open";
    if (action === "search") return "Search";
    if (action === "query") return "Query";
    if (action === "list") return "List";
    return action ? `Query · ${action}` : "Query";
  }
  return type;
}

export default function DashboardPage() {
  const [params] = useSearchParams();
  const me = useQuery(api.profiles.me);
  const usage = useQuery(api.usage.myUsage);
  const usageLog = useQuery(api.usage.myUsageLog, { limit: 40 });

  const unlimited = usage?.creditsUnlimited === true;
  const low = usage?.lowCredits === true;

  const logParsePages =
    usageLog?.reduce(
      (sum, row) =>
        row.type === "parse" && row.pages != null ? sum + row.pages : sum,
      0,
    ) ?? 0;
  const parsePages = Math.max(usage?.parsePages ?? 0, logParsePages);

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
          to keep hosted parse and ZipWiki OKF available.
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
              <p className="font-medium">Hosted parse</p>
              <p className="mt-1 text-(--muted) tabular-nums">
                {(usage.parseCreditsSpent ?? 0).toLocaleString()} ZipWiki
                credits · {parsePages.toLocaleString()} pages ·{" "}
                {usage.parseCount.toLocaleString()} documents
              </p>
            </div>
            <div className="rounded-lg border border-(--border) bg-(--paper) p-4">
              <p className="font-medium">ZipWiki OKF</p>
              <p className="mt-1 text-(--muted) tabular-nums">
                {usage.okfCount.toLocaleString()} enrichments ·{" "}
                {usage.okfCount.toLocaleString()} ZipWiki credits
              </p>
              <p className="mt-1 text-xs text-(--muted)">1 credit each</p>
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
              for hosted parse and ZipWiki OKF.
            </p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-(--border) bg-white shadow-soft p-6 space-y-4">
        <div>
          <h2 className="font-display text-xl font-semibold">Activity log</h2>
          <p className="mt-1 text-sm text-(--muted)">
            Pack, open/search/query, hosted parse, and ZipWiki OKF — with pages
            and ZipWiki credits when billed.
          </p>
        </div>
        {usageLog === undefined && (
          <p className="text-sm text-(--muted)">Loading…</p>
        )}
        {usageLog && usageLog.length === 0 && (
          <p className="text-sm text-(--muted)">
            No activity yet. Pack a knowledge base or open one with the agent to
            see entries here.
          </p>
        )}
        {usageLog && usageLog.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-xl text-left text-sm">
              <thead>
                <tr className="border-b border-(--border) text-(--muted)">
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">File</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">
                    Pages / docs
                  </th>
                  <th className="py-2 font-medium tabular-nums">
                    ZipWiki credits
                  </th>
                </tr>
              </thead>
              <tbody>
                {usageLog.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-(--border)/60 align-top"
                  >
                    <td className="py-2 pr-3 whitespace-nowrap text-(--muted)">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3">
                      {eventLabel(row.type, row.engine)}
                      {row.status && row.status !== "success" ? (
                        <span className="text-(--muted)"> · {row.status}</span>
                      ) : null}
                    </td>
                    <td
                      className="py-2 pr-3 max-w-56 truncate"
                      title={row.filename ?? undefined}
                    >
                      {row.filename ?? (
                        <span className="text-(--muted)">
                          {row.bytes != null ? formatBytes(row.bytes) : "—"}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {row.pages != null ? row.pages.toLocaleString() : "—"}
                    </td>
                    <td className="py-2 tabular-nums">
                      {row.creditCost != null
                        ? row.creditCost.toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
