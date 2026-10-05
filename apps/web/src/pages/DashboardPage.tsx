import { useQuery } from "convex/react";
import { Link, useSearchParams } from "react-router-dom";
import type { ReactNode } from "react";
import { api } from "@convex/_generated/api";
import {
  usageColor,
  usageInk,
  usageKindLabel,
  usageVisualKind,
  type UsageVisualKind,
} from "../lib/usage-colors";

/** Share of the used portion, with a small floor so a thin cost stays visible. */
function segmentWidths(amounts: number[], usedPct: number): number[] {
  const total = amounts.reduce((sum, n) => sum + Math.max(0, n), 0);
  if (total <= 0 || usedPct <= 0) return amounts.map(() => 0);
  const raw = amounts.map((n) => (n > 0 ? (n / total) * usedPct : 0));
  const minPct = 2;
  const lifted = raw.map((pct, i) =>
    amounts[i] > 0 && pct > 0 && pct < minPct ? minPct : pct,
  );
  const liftedSum = lifted.reduce((sum, n) => sum + n, 0);
  if (liftedSum <= usedPct || liftedSum <= 0) return lifted;
  return lifted.map((pct) => (pct / liftedSum) * usedPct);
}

function CreditBar({
  parseCredits,
  okfCredits,
  queryCredits,
  used,
  purchased,
  unlimited,
}: {
  parseCredits: number;
  okfCredits: number;
  queryCredits: number;
  used: number;
  purchased: number;
  unlimited: boolean;
}) {
  const legend = (
    <CreditLegend
      parseCredits={parseCredits}
      okfCredits={okfCredits}
      queryCredits={queryCredits}
    />
  );

  if (unlimited) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="font-medium">ZipWiki credits</span>
          <span className="text-(--muted)">Unlimited</span>
        </div>
        <div className="flex h-6 overflow-hidden rounded-full bg-(--line)">
          <div
            className="h-full w-1/3"
            style={{ background: usageColor("parse") }}
          />
          <div
            className="h-full w-1/3"
            style={{ background: usageColor("okf") }}
          />
          <div
            className="h-full w-1/3"
            style={{ background: usageColor("query") }}
          />
        </div>
        {legend}
      </div>
    );
  }

  const remaining = Math.max(0, purchased - used);
  const usedPct =
    purchased <= 0 ? 0 : Math.min(100, (used / purchased) * 100);
  const [parsePct, okfPct, queryPct] = segmentWidths(
    [parseCredits, okfCredits, queryCredits],
    usedPct,
  );
  const low = remaining <= 500;
  const segments: Array<{
    kind: UsageVisualKind;
    pct: number;
    credits: number;
  }> = [
    { kind: "parse", pct: parsePct ?? 0, credits: parseCredits },
    { kind: "okf", pct: okfPct ?? 0, credits: okfCredits },
    { kind: "query", pct: queryPct ?? 0, credits: queryCredits },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <span className="font-medium">ZipWiki credits</span>
        <span className="text-(--muted) tabular-nums">
          {remaining.toLocaleString()} remaining · {used.toLocaleString()} used
          / {purchased.toLocaleString()} purchased
        </span>
      </div>
      <div className="flex h-6 overflow-hidden rounded-full bg-(--line)">
        {segments.map(
          (segment) =>
            segment.pct > 0 && (
              <div
                key={segment.kind}
                className="h-full"
                style={{
                  width: `${segment.pct}%`,
                  background: usageColor(segment.kind),
                }}
                title={`${usageKindLabel(segment.kind)}: ${segment.credits.toLocaleString()}`}
              />
            ),
        )}
      </div>
      {low && purchased > 0 && (
        <p className="text-xs text-amber-700">Credits running low</p>
      )}
      {legend}
    </div>
  );
}

function CreditLegend({
  parseCredits,
  okfCredits,
  queryCredits,
}: {
  parseCredits: number;
  okfCredits: number;
  queryCredits: number;
}) {
  const items: Array<{ kind: UsageVisualKind; credits: number }> = [
    { kind: "parse", credits: parseCredits },
    { kind: "okf", credits: okfCredits },
    { kind: "query", credits: queryCredits },
  ];
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-(--muted)">
        {items.map((item) => (
          <li key={item.kind} className="inline-flex items-center gap-2">
            <span
              className="inline-block size-3.5 rounded-sm"
              style={{ background: usageColor(item.kind) }}
              aria-hidden
            />
            <span>{usageKindLabel(item.kind)}</span>
            <span className="tabular-nums font-medium text-(--ink)">
              {item.credits.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-(--muted)">
        Portal and CLI asks spend ZipWiki credits. MCP and your own model key
        stay off this total.
      </p>
    </div>
  );
}

function KindCard({
  kind,
  children,
}: {
  kind: UsageVisualKind;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-lg border border-(--border) bg-(--paper) p-4"
      style={{ borderLeftWidth: 4, borderLeftColor: usageColor(kind) }}
    >
      {children}
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
  if (type === "llamaparse_byo") return "LlamaParse (your key)";
  if (type === "parse") return "Parsing";
  if (type === "okf") return "OKF Enrichment";
  if (type === "liteparse") return "LiteParse";
  if (type === "pack") return "Pack Knowledge Archive";
  if (type === "query") {
    const action = engine?.trim();
    if (action === "open") return "Open Knowledge Archive";
    if (action === "search") return "Search Knowledge Archive";
    if (action === "query") return "Query Knowledge Archive";
    if (action === "list") return "List Knowledge Archive";
    if (action === "web_open") return "Web open Knowledge Archive";
    if (action === "web_search") return "Web search Knowledge Archive";
    return action
      ? `Query Knowledge Archive · ${action}`
      : "Query Knowledge Archive";
  }
  return type;
}

function CreditAmount({
  type,
  creditCost,
}: {
  type: string;
  creditCost: number | null;
}) {
  const kind = usageVisualKind(type);
  if (creditCost == null) {
    return <span className="text-(--muted)">—</span>;
  }
  return (
    <span className="font-medium tabular-nums" style={{ color: usageInk(kind) }}>
      {creditCost.toLocaleString()}
    </span>
  );
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
  const parseCredits = usage?.parseCreditsSpent ?? 0;
  const okfCredits = usage?.okfCreditsSpent ?? 0;
  const queryCredits = usage?.queryCreditsSpent ?? 0;
  const ownKeyFiles = usage?.byoLlamaCount ?? 0;
  const ownKeyCredits = usage?.byoLlamaCredits ?? 0;

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
            parseCredits={parseCredits}
            okfCredits={okfCredits}
            queryCredits={queryCredits}
            used={usage.creditsSpent ?? 0}
            purchased={usage.creditsPurchased ?? 0}
            unlimited={unlimited}
          />

          <div className="grid gap-4 md:grid-cols-3 text-sm">
            <KindCard kind="parse">
              <p
                className="font-medium"
                style={{ color: usageInk("parse") }}
              >
                {usageKindLabel("parse")}
              </p>
              <p className="mt-1 tabular-nums" style={{ color: usageInk("parse") }}>
                {parseCredits.toLocaleString()} ZipWiki credits
              </p>
              <p className="mt-0.5 text-(--muted) tabular-nums">
                {parsePages.toLocaleString()} pages ·{" "}
                {usage.parseCount.toLocaleString()} documents
              </p>
            </KindCard>
            <KindCard kind="okf">
              <p className="font-medium" style={{ color: usageInk("okf") }}>
                {usageKindLabel("okf")}
              </p>
              <p className="mt-1 tabular-nums" style={{ color: usageInk("okf") }}>
                {okfCredits.toLocaleString()} ZipWiki credits
              </p>
              <p className="mt-0.5 text-(--muted) tabular-nums">
                {usage.okfCount.toLocaleString()} enrichments ·{" "}
                {(usage.okfInputTokens ?? 0).toLocaleString()} in /{" "}
                {(usage.okfOutputTokens ?? 0).toLocaleString()} out
              </p>
            </KindCard>
            <KindCard kind="query">
              <p
                className="font-medium"
                style={{ color: usageInk("query") }}
              >
                {usageKindLabel("query")}
              </p>
              <p
                className="mt-1 tabular-nums"
                style={{ color: usageInk("query") }}
              >
                {queryCredits.toLocaleString()} ZipWiki credits
              </p>
              <p className="mt-0.5 text-(--muted) tabular-nums">
                {(usage.queryCount ?? 0).toLocaleString()} open / search /
                browse · {(usage.packCount ?? 0).toLocaleString()} packs
              </p>
              <p className="mt-2 text-xs text-(--muted)">
                Portal and CLI asks spend ZipWiki credits. MCP and your own
                model key stay off this total.
              </p>
            </KindCard>
          </div>

          {ownKeyFiles > 0 || ownKeyCredits > 0 ? (
            <div className="rounded-lg border border-(--border) bg-(--paper) p-4 text-sm">
              <p className="font-medium text-(--ink)">
                LlamaParse (your API key)
              </p>
              <p className="mt-1 tabular-nums">
                {ownKeyFiles.toLocaleString()} file
                {ownKeyFiles === 1 ? "" : "s"}
                {" · "}
                {ownKeyCredits.toLocaleString()} Llama credits
              </p>
              <p className="mt-2 text-xs text-(--muted)">
                Billed by LlamaParse on your key. These jobs do not spend
                ZipWiki credits.
              </p>
            </div>
          ) : null}

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
            Pack, open/search/query, hosted parse, and OKF enrichment — with
            pages and ZipWiki credits when billed.
          </p>
        </div>
        {usageLog === undefined && (
          <p className="text-sm text-(--muted)">Loading…</p>
        )}
        {usageLog && usageLog.length === 0 && (
          <p className="text-sm text-(--muted)">
            No activity yet. Pack a Knowledge Archive or open one with the agent
            to see entries here.
          </p>
        )}
        {usageLog && usageLog.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-xl text-left text-sm">
              <thead>
                <tr className="border-b border-(--border) text-(--muted)">
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">File / model</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">
                    Pages / tokens
                  </th>
                  <th className="py-2 font-medium tabular-nums">
                    ZipWiki credits
                  </th>
                </tr>
              </thead>
              <tbody>
                {usageLog.map((row) => {
                  const kind = usageVisualKind(row.type);
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-(--border)/60 align-top"
                    >
                      <td className="py-2 pr-3 whitespace-nowrap text-(--muted)">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className="font-medium"
                          style={{ color: usageInk(kind) }}
                        >
                          {eventLabel(row.type, row.engine)}
                        </span>
                        {row.status && row.status !== "success" ? (
                          <span className="text-(--muted)">
                            {" "}
                            · {row.status}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className="py-2 pr-3 max-w-56 truncate"
                        title={row.filename ?? row.model ?? undefined}
                      >
                        {row.filename ??
                          row.model ??
                          (row.bytes != null ? (
                            <span className="text-(--muted)">
                              {formatBytes(row.bytes)}
                            </span>
                          ) : (
                            "—"
                          ))}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {row.pages != null
                          ? row.pages.toLocaleString()
                          : row.inputTokens != null || row.outputTokens != null
                            ? `${(row.inputTokens ?? 0).toLocaleString()} / ${(row.outputTokens ?? 0).toLocaleString()}`
                            : "—"}
                      </td>
                      <td className="py-2">
                        {row.type === "llamaparse_byo" ? (
                          <span className="tabular-nums text-(--muted)">
                            {(row.llamaCredits ?? 0).toLocaleString()} Llama
                          </span>
                        ) : row.type === "query" && row.creditCost == null ? (
                          <span className="text-(--muted)">not billed</span>
                        ) : (
                          <CreditAmount
                            type={row.type}
                            creditCost={row.creditCost}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
