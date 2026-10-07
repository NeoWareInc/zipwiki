import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { usageColor, usageInk, usageKindLabel } from "../lib/usage-colors";

const ANOMALY_ENGINES = [
  "query_no_excerpts",
  "query_no_phrase_hits",
  "query_follow_fail",
  "query_preamble",
  "query_incomplete",
  "query_api_error",
  "query_client_reject",
  "query_session_no_answer",
  "anthropic",
  "web_open",
] as const;

export default function AdminUsagePage() {
  const data = useQuery(api.admin.usageOverview);
  const [status, setStatus] = useState<"all" | "success" | "fail">("fail");
  const [engine, setEngine] = useState("");
  const [accountId, setAccountId] = useState<Id<"accounts"> | "">("");

  const logArgs = useMemo(
    () => ({
      ...(status !== "all" ? { status } : {}),
      ...(engine.trim() ? { engine: engine.trim() } : {}),
      ...(accountId ? { accountId } : {}),
      type: "query" as const,
    }),
    [status, engine, accountId],
  );

  const log = usePaginatedQuery(api.admin.usageEventLog, logArgs, {
    initialNumItems: 40,
  });

  if (data === undefined) {
    return <p className="text-(--muted)">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Usage</h1>
        <p className="mt-1 text-sm text-(--muted)">
          Current period started{" "}
          {new Date(data.periodStart).toLocaleDateString()}. LlamaParse pages /
          credits, OKF tokens, and pack vs query activity per account.
        </p>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--muted)">
          {(
            [
              ["parse", usageKindLabel("parse")],
              ["okf", usageKindLabel("okf")],
              ["query", usageKindLabel("query")],
            ] as const
          ).map(([kind, label]) => (
            <li key={kind} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 rounded-sm"
                style={{ background: usageColor(kind) }}
                aria-hidden
              />
              {label}
            </li>
          ))}
        </ul>
      </div>

      <div className="overflow-x-auto rounded-xl border border-(--border) bg-white shadow-soft">
        <table className="w-full min-w-[64rem] text-left text-sm">
          <thead>
            <tr className="border-b border-(--border) text-(--muted)">
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 font-medium tabular-nums">Credits</th>
              <th
                className="px-4 py-3 font-medium tabular-nums"
                style={{ color: usageInk("parse") }}
              >
                Parsing
              </th>
              <th className="px-4 py-3 font-medium tabular-nums">Llama</th>
              <th
                className="px-4 py-3 font-medium tabular-nums"
                style={{ color: usageInk("okf") }}
              >
                OKF Enrichment
              </th>
              <th
                className="px-4 py-3 font-medium tabular-nums"
                style={{ color: usageInk("okf") }}
              >
                OKF ¢
              </th>
              <th
                className="px-4 py-3 font-medium tabular-nums"
                style={{ color: usageInk("query") }}
              >
                Pack
              </th>
              <th
                className="px-4 py-3 font-medium tabular-nums"
                style={{ color: usageInk("query") }}
              >
                Query
              </th>
            </tr>
          </thead>
          <tbody>
            {data.accounts.map((row) => (
              <tr
                key={row.id}
                className="border-b border-(--border)/60 align-top"
              >
                <td className="px-4 py-3">
                  <Link
                    to={`/admin/accounts/${row.id}`}
                    className="font-medium text-(--accent) hover:underline"
                  >
                    {row.email}
                  </Link>
                  {row.disabled ? (
                    <span className="ml-2 text-xs text-(--muted)">login disabled</span>
                  ) : null}
                  {row.creditsLocked ? (
                    <span className="ml-2 text-xs text-(--muted)">credits locked</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {row.creditsUnlimited
                    ? "∞"
                    : row.creditsRemaining.toLocaleString()}
                </td>
                <td
                  className="px-4 py-3 tabular-nums"
                  style={{ color: usageInk("parse") }}
                >
                  {row.parseCount.toLocaleString()} docs ·{" "}
                  {row.parsePages.toLocaleString()} pg ·{" "}
                  {row.parseCreditsSpent.toLocaleString()} ¢
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {row.llamaCredits.toLocaleString()}
                </td>
                <td
                  className="px-4 py-3 tabular-nums"
                  style={{ color: usageInk("okf") }}
                >
                  {row.okfInputTokens.toLocaleString()} in /{" "}
                  {row.okfOutputTokens.toLocaleString()} out ·{" "}
                  {row.okfCount.toLocaleString()} calls
                </td>
                <td
                  className="px-4 py-3 tabular-nums font-medium"
                  style={{ color: usageInk("okf") }}
                >
                  {row.okfCreditsSpent.toLocaleString()}
                </td>
                <td
                  className="px-4 py-3 tabular-nums"
                  style={{ color: usageInk("query") }}
                >
                  {row.packCount.toLocaleString()}
                </td>
                <td
                  className="px-4 py-3 tabular-nums"
                  style={{ color: usageInk("query") }}
                >
                  {row.queryCount.toLocaleString()}
                </td>
              </tr>
            ))}
            {data.accounts.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-(--muted)"
                >
                  No accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Query event log</h2>
          <p className="mt-1 text-sm text-(--muted)">
            Soft activity and Ask anomalies share this log. Filter by fail to
            find sessions that charged or stalled without a good answer.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-(--muted)">Status</span>
            <select
              className="rounded-md border border-(--border) bg-white px-2 py-1.5"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "all" | "success" | "fail")
              }
            >
              <option value="all">All</option>
              <option value="success">Success</option>
              <option value="fail">Fail</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-(--muted)">Engine / anomaly</span>
            <select
              className="min-w-48 rounded-md border border-(--border) bg-white px-2 py-1.5"
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
            >
              <option value="">All</option>
              {ANOMALY_ENGINES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-(--muted)">Account</span>
            <select
              className="min-w-56 rounded-md border border-(--border) bg-white px-2 py-1.5"
              value={accountId}
              onChange={(e) =>
                setAccountId((e.target.value || "") as Id<"accounts"> | "")
              }
            >
              <option value="">All accounts</option>
              {data.accounts.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.email}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto rounded-xl border border-(--border) bg-white shadow-soft">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead>
              <tr className="border-b border-(--border) text-(--muted)">
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Engine</th>
                <th className="px-4 py-2 font-medium">Ask id</th>
                <th className="px-4 py-2 font-medium">File</th>
                <th className="px-4 py-2 font-medium tabular-nums">Credits</th>
              </tr>
            </thead>
            <tbody>
              {log.results.map((e) => (
                <tr key={e.id} className="border-b border-(--border)/60">
                  <td className="px-4 py-2 whitespace-nowrap text-(--muted)">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      to={`/admin/accounts/${e.accountId}`}
                      className="text-(--accent) hover:underline"
                    >
                      {e.email}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        e.status === "fail"
                          ? "font-medium text-red-700"
                          : "text-(--muted)"
                      }
                    >
                      {e.status ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {e.engine ?? "—"}
                  </td>
                  <td className="max-w-36 truncate px-4 py-2 font-mono text-xs">
                    {e.createId ?? "—"}
                  </td>
                  <td className="max-w-40 truncate px-4 py-2">
                    {e.filename ?? e.model ?? "—"}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {e.creditCost != null ? e.creditCost.toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
              {log.results.length === 0 && log.status !== "LoadingFirstPage" && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-(--muted)"
                  >
                    No events match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {log.status === "CanLoadMore" && (
          <button
            type="button"
            className="rounded-md border border-(--border) px-3 py-1.5 text-sm hover:bg-(--surface)"
            onClick={() => log.loadMore(40)}
          >
            Load more
          </button>
        )}
      </section>
    </div>
  );
}
