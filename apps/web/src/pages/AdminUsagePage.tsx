import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  usageColor,
  usageKindLabel,
  usageVisualKind,
} from "../lib/usage-colors";

const PAGE_SIZE = 100;

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "success", label: "Success" },
  { value: "fail", label: "Fail" },
] as const;

const ENGINE_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "pack", label: "pack" },
  { value: "open", label: "open" },
  { value: "web_open", label: "web_open" },
  { value: "search", label: "search" },
  { value: "web_search", label: "web_search" },
  { value: "query", label: "query / ask" },
  { value: "list", label: "list" },
] as const;

type LogEvent = {
  id: string;
  createdAt: number;
  accountId: Id<"accounts">;
  email: string;
  type: string;
  engine: string | null;
  status: string | null;
  provider: string | null;
  model: string | null;
  pages: number | null;
  bytes: number | null;
  llamaCredits: number | null;
  creditCost: number | null;
  filename: string | null;
  jobId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createId: string | null;
  okfCount: number | null;
  parseCount: number | null;
};

type StepEvent = {
  id: string;
  createdAt: number;
  accountId: Id<"accounts">;
  email: string;
  createId: string;
  type: string;
  engine: string | null;
  status: string | null;
  provider: string | null;
  model: string | null;
  pages: number | null;
  bytes: number | null;
  llamaCredits: number | null;
  creditCost: number | null;
  filename: string | null;
  jobId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

function formatBytes(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function eventTypeLabel(type: string, engine: string | null): string {
  if (type === "pack_start") return "Start Create ZipWiki";
  if (type === "pack_end" || type === "pack") return "End Create ZipWiki";
  if (type === "query") {
    const action = engine?.trim();
    if (!action) return "Query ZipWiki";
    if (action === "open" || action === "web_open") return "Query · open";
    if (action === "search" || action === "web_search") return "Query · search";
    if (action === "query") return "Query · ask";
    if (action === "list") return "Query · list";
    return `Query · ${action}`;
  }
  if (type === "llamaparse_byo") return "LlamaParse (user key)";
  if (type === "parse") return "Parsing";
  if (type === "okf") return "OKF Enrichment";
  if (type === "liteparse") return "LiteParse";
  return type;
}

function selectClass() {
  return "rounded-md border border-(--border) bg-white px-3 py-2 text-sm";
}

function pagesOrTokens(row: {
  pages: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  okfCount?: number | null;
  parseCount?: number | null;
}): string {
  const parts: string[] = [];
  if (row.pages != null) parts.push(`${row.pages.toLocaleString()} docs`);
  if (row.parseCount != null) {
    parts.push(`${row.parseCount.toLocaleString()} parse`);
  }
  if (row.okfCount != null) parts.push(`${row.okfCount.toLocaleString()} OKF`);
  if (row.inputTokens != null || row.outputTokens != null) {
    parts.push(
      `${(row.inputTokens ?? 0).toLocaleString()} in / ${(row.outputTokens ?? 0).toLocaleString()} out`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function creditsCell(row: {
  type: string;
  llamaCredits: number | null;
  creditCost: number | null;
}): ReactNode {
  const kind = usageVisualKind(row.type);
  if (row.type === "llamaparse_byo") {
    return (
      <span className="text-(--muted)">
        {(row.llamaCredits ?? 0).toLocaleString()} Llama
      </span>
    );
  }
  if (row.creditCost != null) {
    return (
      <span className="font-medium" style={{ color: usageColor(kind) }}>
        {row.creditCost.toLocaleString()}
      </span>
    );
  }
  if (row.llamaCredits != null && row.llamaCredits > 0) {
    return (
      <span className="text-(--muted)">
        {row.llamaCredits.toLocaleString()} Llama
      </span>
    );
  }
  return <span className="text-(--muted)">—</span>;
}

function EventCells({
  row,
  eventLabel,
  eventExtra,
}: {
  row: LogEvent | StepEvent;
  eventLabel?: string;
  eventExtra?: ReactNode;
}) {
  const kind = usageVisualKind(row.type);
  const label = eventLabel ?? eventTypeLabel(row.type, row.engine);
  return (
    <>
      <td className="px-3 py-2 whitespace-nowrap text-(--muted) align-top">
        {new Date(row.createdAt).toLocaleString()}
      </td>
      <td className="px-3 py-2 align-top">
        <Link
          to={`/admin/accounts/${row.accountId}`}
          className="text-(--accent) hover:underline"
        >
          {row.email}
        </Link>
      </td>
      <td className="px-3 py-2 align-top">
        <span className="font-medium" style={{ color: usageColor(kind) }}>
          {label}
        </span>
        {row.engine &&
        row.type !== "query" &&
        row.type !== "pack_start" &&
        row.type !== "pack_end" &&
        row.type !== "pack" ? (
          <span className="text-(--muted)"> · {row.engine}</span>
        ) : null}
        {eventExtra}
      </td>
      <td className="px-3 py-2 text-(--muted) align-top">
        {row.status ?? "—"}
      </td>
      <td
        className="px-3 py-2 max-w-48 truncate font-mono text-xs align-top"
        title={row.filename ?? row.model ?? row.jobId ?? undefined}
      >
        {row.filename ??
          row.model ??
          (row.bytes != null ? formatBytes(row.bytes) : "—")}
      </td>
      <td className="px-3 py-2 tabular-nums align-top">{pagesOrTokens(row)}</td>
      <td className="px-3 py-2 tabular-nums align-top">{creditsCell(row)}</td>
      <td className="px-3 py-2 text-(--muted) align-top">
        {row.provider ?? "—"}
      </td>
    </>
  );
}

function CreateDetailsModal({
  createId,
  onClose,
}: {
  createId: string;
  onClose: () => void;
}) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const cursor = cursors[pageIndex] ?? null;
  const steps = useQuery(api.admin.usageStepLog, {
    createId,
    paginationOpts: { numItems: PAGE_SIZE, cursor },
  });

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
            <p className="mt-0.5 font-mono text-xs text-(--muted)">{createId}</p>
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
          <table className="w-full min-w-[56rem] text-left text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-(--border) text-(--muted)">
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">User</th>
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
                    colSpan={8}
                    className="px-3 py-8 text-center text-(--muted)"
                  >
                    Loading…
                  </td>
                </tr>
              )}
              {steps && steps.page.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
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
                  <EventCells row={step as StepEvent} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsagePage() {
  const data = useQuery(api.admin.usageOverview);
  const accounts = useQuery(api.admin.listAccounts, {});
  const wipeLogs = useMutation(api.usage.wipeActivityLogs);

  const [accountId, setAccountId] = useState<Id<"accounts"> | "">("");
  const [status, setStatus] = useState("");
  const [engine, setEngine] = useState("");
  const [detailsCreateId, setDetailsCreateId] = useState<string | null>(null);
  const [wiping, setWiping] = useState(false);

  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);

  const filterKey = `${accountId}|${status}|${engine}`;
  useEffect(() => {
    setCursors([null]);
    setPageIndex(0);
  }, [filterKey]);

  const cursor = cursors[pageIndex] ?? null;
  const log = useQuery(api.admin.usageEventLog, {
    paginationOpts: { numItems: PAGE_SIZE, cursor },
    ...(accountId ? { accountId } : {}),
    ...(status ? { status } : {}),
    ...(engine ? { engine } : {}),
  });

  const accountOptions = useMemo(() => {
    const rows = accounts ?? [];
    return [...rows].sort((a, b) => a.email.localeCompare(b.email));
  }, [accounts]);

  const events = (log?.page ?? null) as LogEvent[] | null;

  function goNext() {
    if (!log || log.isDone) return;
    setCursors((prev) => {
      const trimmed = prev.slice(0, pageIndex + 1);
      return [...trimmed, log.continueCursor];
    });
    setPageIndex((i) => i + 1);
  }

  function goPrev() {
    if (pageIndex <= 0) return;
    setPageIndex((i) => i - 1);
  }

  async function onWipe() {
    if (
      !window.confirm(
        "Delete all activity log rows (usageEvents + usageStepEvents)? Billing ledger and period totals are kept.",
      )
    ) {
      return;
    }
    setWiping(true);
    try {
      const result = await wipeLogs({});
      window.alert(
        `Deleted ${result.eventsDeleted} primary + ${result.stepsDeleted} step rows.`,
      );
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setWiping(false);
    }
  }

  if (data === undefined) {
    return <p className="text-(--muted)">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Usage</h1>
        <p className="mt-1 text-sm text-(--muted)">
          Current period started{" "}
          {new Date(data.periodStart).toLocaleDateString()}. Period totals per
          account, plus the primary activity log (start/end Create + Query).
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
                    <span className="ml-2 text-xs text-(--muted)">
                      login disabled
                    </span>
                  ) : null}
                  {row.creditsLocked ? (
                    <span className="ml-2 text-xs text-(--muted)">
                      credits locked
                    </span>
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

      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Event log</h2>
            <p className="mt-1 text-sm text-(--muted)">
              Start / End Create ZipWiki and Query only. Open Details on an End
              (or Start) row to load parse / OKF / LiteParse steps for that
              create.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-800 disabled:opacity-40"
            disabled={wiping}
            onClick={() => void onWipe()}
          >
            {wiping ? "Wiping…" : "Wipe activity logs"}
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs text-(--muted)">
            User
            <select
              className={selectClass()}
              value={accountId}
              onChange={(e) =>
                setAccountId(
                  e.target.value
                    ? (e.target.value as Id<"accounts">)
                    : "",
                )
              }
            >
              <option value="">All users</option>
              {accountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-(--muted)">
            Status
            <select
              className={selectClass()}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-(--muted)">
            Action
            <select
              className={selectClass()}
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
            >
              {ENGINE_OPTIONS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-(--muted)">
            Page {pageIndex + 1}
            {events
              ? ` · ${events.length} row${events.length === 1 ? "" : "s"}`
              : ""}
            {log?.isDone ? " · end of log" : ""}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md border border-(--border) px-3 py-1.5 font-medium disabled:opacity-40"
              disabled={pageIndex <= 0 || log === undefined}
              onClick={goPrev}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded-md border border-(--border) px-3 py-1.5 font-medium disabled:opacity-40"
              disabled={!log || log.isDone}
              onClick={goNext}
            >
              Next
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-(--border) bg-white shadow-soft">
          <table className="w-full min-w-[72rem] text-left text-sm">
            <thead>
              <tr className="border-b border-(--border) text-(--muted)">
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">File / model</th>
                <th className="px-3 py-2 font-medium tabular-nums">
                  Totals
                </th>
                <th className="px-3 py-2 font-medium tabular-nums">Credits</th>
                <th className="px-3 py-2 font-medium">Provider</th>
              </tr>
            </thead>
            <tbody>
              {events === null && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-center text-(--muted)"
                  >
                    Loading…
                  </td>
                </tr>
              )}
              {events && events.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-center text-(--muted)"
                  >
                    No events match these filters.
                  </td>
                </tr>
              )}
              {events?.map((row) => {
                const canDetails =
                  Boolean(row.createId) &&
                  (row.type === "pack_end" ||
                    row.type === "pack_start" ||
                    row.type === "pack");
                return (
                  <tr
                    key={row.id}
                    className="border-b border-(--border)/60 align-top"
                  >
                    <EventCells
                      row={row}
                      eventExtra={
                        canDetails ? (
                          <button
                            type="button"
                            className="mt-1 block text-xs text-(--accent) hover:underline"
                            onClick={() =>
                              setDetailsCreateId(row.createId as string)
                            }
                          >
                            Details
                          </button>
                        ) : null
                      }
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {detailsCreateId ? (
        <CreateDetailsModal
          createId={detailsCreateId}
          onClose={() => setDetailsCreateId(null)}
        />
      ) : null}
    </div>
  );
}
