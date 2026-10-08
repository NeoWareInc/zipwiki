import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { usageInk, usageVisualKind } from "../lib/usage-colors";

const STEP_PAGE_SIZE = 100;

const ENGINE_OPTIONS = [
  "anthropic",
  "web_open",
  "open",
  "search",
  "query",
  "list",
  "query_no_excerpts",
  "query_no_phrase_hits",
  "query_follow_fail",
  "query_preamble",
  "query_incomplete",
  "query_api_error",
  "query_client_reject",
  "query_session_no_answer",
] as const;

type LogTypeFilter = "all" | "query" | "pack";

type AccountOption = { id: Id<"accounts">; email: string };

function isPackRow(type: string): boolean {
  return type === "pack" || type === "pack_start" || type === "pack_end";
}

function formatBytes(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function pagesOrTokens(row: {
  pages: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  bytes?: number | null;
}): string {
  const parts: string[] = [];
  if (row.pages != null) parts.push(`${row.pages.toLocaleString()} pg`);
  if (row.inputTokens != null || row.outputTokens != null) {
    parts.push(
      `${(row.inputTokens ?? 0).toLocaleString()} in / ${(row.outputTokens ?? 0).toLocaleString()} out`,
    );
  }
  if (parts.length === 0 && row.bytes != null) return formatBytes(row.bytes);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function CreateDetailsModal({
  createId,
  scope,
  onClose,
}: {
  createId: string;
  scope: "admin" | "account";
  onClose: () => void;
}) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const cursor = cursors[pageIndex] ?? null;
  const paginationOpts = { numItems: STEP_PAGE_SIZE, cursor };
  const adminSteps = useQuery(
    api.admin.usageStepLog,
    scope === "admin" ? { createId, paginationOpts } : "skip",
  );
  const accountSteps = useQuery(
    api.usage.myUsageStepLog,
    scope === "account" ? { createId, paginationOpts } : "skip",
  );
  const steps = scope === "admin" ? adminSteps : accountSteps;

  function goNext() {
    if (!steps || steps.isDone) return;
    setCursors((prev) => {
      const trimmed = prev.slice(0, pageIndex + 1);
      return [...trimmed, steps.continueCursor];
    });
    setPageIndex((i) => i + 1);
  }

  function goPrev() {
    if (pageIndex <= 0) return;
    setPageIndex((i) => i - 1);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-details-title"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-xl border border-(--border) bg-white shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-(--border) px-4 py-3">
          <div>
            <h3
              id="create-details-title"
              className="font-display text-lg font-semibold"
            >
              Create ZipWiki steps
            </h3>
          </div>
          <button
            type="button"
            className="rounded-md border border-(--border) px-3 py-1.5 text-sm font-medium"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-(--border) px-4 py-2 text-sm">
          <p className="text-(--muted)">
            Page {pageIndex + 1}
            {steps?.page
              ? ` · ${steps.page.length} step${steps.page.length === 1 ? "" : "s"}`
              : ""}
            {steps?.isDone ? " · end" : ""}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md border border-(--border) px-3 py-1.5 font-medium disabled:opacity-40"
              disabled={pageIndex <= 0 || steps === undefined}
              onClick={goPrev}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded-md border border-(--border) px-3 py-1.5 font-medium disabled:opacity-40"
              disabled={!steps || steps.isDone}
              onClick={goNext}
            >
              Next
            </button>
          </div>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full min-w-4xl text-left text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-(--border) text-(--muted)">
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Step</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">File / model</th>
                <th className="px-3 py-2 font-medium tabular-nums">
                  Pages / tokens
                </th>
                <th className="px-3 py-2 font-medium tabular-nums">Credits</th>
                <th className="px-3 py-2 font-medium">Provider</th>
              </tr>
            </thead>
            <tbody>
              {steps === undefined && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-(--muted)"
                  >
                    Loading…
                  </td>
                </tr>
              )}
              {steps && steps.page.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-(--muted)"
                  >
                    No step events for this create.
                  </td>
                </tr>
              )}
              {steps?.page.map((step) => (
                <tr
                  key={step.id}
                  className="border-b border-(--border)/50 align-top"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-(--muted)">
                    {new Date(step.createdAt).toLocaleString()}
                  </td>
                  <td
                    className="px-3 py-2 font-medium"
                    style={{ color: usageInk(usageVisualKind(step.type)) }}
                  >
                    {step.type}
                    {step.engine ? (
                      <span className="text-(--muted)"> · {step.engine}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-(--muted)">
                    {step.status ?? "—"}
                  </td>
                  <td
                    className="max-w-48 truncate px-3 py-2 font-mono"
                    title={step.filename ?? step.model ?? step.jobId ?? undefined}
                  >
                    {step.filename ??
                      step.model ??
                      (step.bytes != null ? formatBytes(step.bytes) : "—")}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {pagesOrTokens(step)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {step.creditCost != null
                      ? step.creditCost.toLocaleString()
                      : step.llamaCredits != null
                        ? `${step.llamaCredits.toLocaleString()} Llama`
                        : "—"}
                  </td>
                  <td className="px-3 py-2 text-(--muted)">
                    {step.provider ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function UsageEventLog({
  mode,
  accounts,
}: {
  mode: "admin" | "account";
  accounts?: AccountOption[];
}) {
  const showAccount = mode === "admin";
  const [status, setStatus] = useState<"all" | "success" | "fail">("all");
  const [type, setType] = useState<LogTypeFilter>("all");
  const [engine, setEngine] = useState("");
  const [accountId, setAccountId] = useState<Id<"accounts"> | "">("");
  const [detailsCreateId, setDetailsCreateId] = useState<string | null>(null);

  const logArgs = useMemo(
    () => ({
      ...(status !== "all" ? { status } : {}),
      ...(type !== "all" ? { type } : {}),
      ...(engine.trim() ? { engine: engine.trim() } : {}),
      ...(showAccount && accountId ? { accountId } : {}),
    }),
    [status, type, engine, accountId, showAccount],
  );

  const adminLog = usePaginatedQuery(
    api.admin.usageEventLog,
    mode === "admin" ? logArgs : "skip",
    { initialNumItems: 40 },
  );
  const accountLog = usePaginatedQuery(
    api.usage.myUsageEventLog,
    mode === "account" ? logArgs : "skip",
    { initialNumItems: 40 },
  );
  const log = mode === "admin" ? adminLog : accountLog;
  const columnCount = showAccount ? 8 : 7;

  return (
    <>
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
          <span className="text-xs text-(--muted)">Type</span>
          <select
            className="rounded-md border border-(--border) bg-white px-2 py-1.5"
            value={type}
            onChange={(e) => setType(e.target.value as LogTypeFilter)}
          >
            <option value="all">All</option>
            <option value="query">Query</option>
            <option value="pack">Pack</option>
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
            {ENGINE_OPTIONS.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        {showAccount && accounts ? (
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
              {accounts.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.email}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="overflow-x-auto rounded-xl border border-(--border) bg-white shadow-soft">
        <table className="w-full min-w-4xl text-left text-sm">
          <thead>
            <tr className="border-b border-(--border) text-(--muted)">
              <th className="px-4 py-2 font-medium">When</th>
              {showAccount ? (
                <th className="px-4 py-2 font-medium">Account</th>
              ) : null}
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Engine</th>
              <th className="px-4 py-2 font-medium">File</th>
              <th className="px-4 py-2 font-medium tabular-nums">Credits</th>
              <th className="px-4 py-2 font-medium">Steps</th>
            </tr>
          </thead>
          <tbody>
            {log.results.map((e) => {
              const canDetails = Boolean(e.createId) && isPackRow(e.type);
              return (
                <tr key={e.id} className="border-b border-(--border)/60">
                  <td className="px-4 py-2 whitespace-nowrap text-(--muted)">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  {showAccount ? (
                    <td className="px-4 py-2">
                      <Link
                        to={`/admin/accounts/${e.accountId}`}
                        className="text-(--accent) hover:underline"
                      >
                        {e.email}
                      </Link>
                    </td>
                  ) : null}
                  <td
                    className="px-4 py-2 font-medium"
                    style={{ color: usageInk(usageVisualKind(e.type)) }}
                  >
                    {e.type}
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
                  <td className="max-w-40 truncate px-4 py-2">
                    {e.filename ?? e.model ?? "—"}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {e.creditCost != null ? e.creditCost.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {canDetails ? (
                      <button
                        type="button"
                        className="text-sm font-medium text-(--accent) hover:underline"
                        onClick={() => setDetailsCreateId(e.createId as string)}
                      >
                        Details
                      </button>
                    ) : (
                      <span className="text-(--muted)">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {log.results.length === 0 && log.status !== "LoadingFirstPage" && (
              <tr>
                <td
                  colSpan={columnCount}
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
      {detailsCreateId ? (
        <CreateDetailsModal
          createId={detailsCreateId}
          scope={mode}
          onClose={() => setDetailsCreateId(null)}
        />
      ) : null}
    </>
  );
}
