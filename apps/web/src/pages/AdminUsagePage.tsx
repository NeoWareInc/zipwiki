import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { usageColor, usageKindLabel } from "../lib/usage-colors";

export default function AdminUsagePage() {
  const data = useQuery(api.admin.usageOverview);

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
                style={{ color: usageColor("parse") }}
              >
                Parsing
              </th>
              <th className="px-4 py-3 font-medium tabular-nums">Llama</th>
              <th
                className="px-4 py-3 font-medium tabular-nums"
                style={{ color: usageColor("okf") }}
              >
                OKF Enrichment
              </th>
              <th
                className="px-4 py-3 font-medium tabular-nums"
                style={{ color: usageColor("okf") }}
              >
                OKF ¢
              </th>
              <th
                className="px-4 py-3 font-medium tabular-nums"
                style={{ color: usageColor("query") }}
              >
                Pack
              </th>
              <th
                className="px-4 py-3 font-medium tabular-nums"
                style={{ color: usageColor("query") }}
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
                  style={{ color: usageColor("parse") }}
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
                  style={{ color: usageColor("okf") }}
                >
                  {row.okfInputTokens.toLocaleString()} in /{" "}
                  {row.okfOutputTokens.toLocaleString()} out ·{" "}
                  {row.okfCount.toLocaleString()} calls
                </td>
                <td
                  className="px-4 py-3 tabular-nums font-medium"
                  style={{ color: usageColor("okf") }}
                >
                  {row.okfCreditsSpent.toLocaleString()}
                </td>
                <td
                  className="px-4 py-3 tabular-nums"
                  style={{ color: usageColor("query") }}
                >
                  {row.packCount.toLocaleString()}
                </td>
                <td
                  className="px-4 py-3 tabular-nums"
                  style={{ color: usageColor("query") }}
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
    </div>
  );
}
