import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "@convex/_generated/api";

function UsageBar({
  label,
  used,
  max,
  fallbackLabel,
}: {
  label: string;
  used: number;
  max: number;
  fallbackLabel?: string;
}) {
  const unlimited = max >= Number.MAX_SAFE_INTEGER;
  const exhausted = !unlimited && (max <= 0 || used >= max);
  const pct =
    unlimited || max <= 0
      ? 0
      : Math.min(100, Math.round((used / max) * 100));
  const warn = !unlimited && max > 0 && pct >= 80 && !exhausted;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-(--muted)">
          {max <= 0
            ? "None (Free path)"
            : unlimited
              ? `${used.toLocaleString()} / no limit`
              : `${used} / ${max}`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-(--line)">
        <div
          className={`h-2 rounded-full ${
            exhausted
              ? "bg-(--muted)"
              : warn
                ? "bg-amber-500"
                : "bg-(--accent)"
          }`}
          style={{
            width: `${unlimited ? Math.min(8, used > 0 ? 8 : 0) : max <= 0 ? 0 : pct}%`,
          }}
        />
      </div>
      {exhausted && fallbackLabel && (
        <p className="text-xs text-(--muted)">{fallbackLabel}</p>
      )}
      {warn && (
        <p className="text-xs text-amber-700">
          Approaching monthly limit — further usage falls back to Free
          (LiteParse + host LLM). Upgrade in Billing if you need more.
        </p>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const me = useQuery(api.profiles.me);
  const usage = useQuery(api.usage.myUsage);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Usage</h1>
        <p className="mt-1 text-(--muted)">
          Plan: <strong>{me?.plan?.name ?? "—"}</strong> ({me?.account.status})
        </p>
      </div>

      {usage && (
        <div className="space-y-6 rounded-xl border border-(--border) bg-white shadow-soft p-6">
          <div className="grid gap-6 md:grid-cols-2">
            <UsageBar
              label="LlamaParse docs (hosted, billed)"
              used={usage.parseCount}
              max={usage.maxParses}
              fallbackLabel="Falling back to LiteParse (unlimited, not billed)."
            />
            <UsageBar
              label="ZipWiki OKF (hosted, billed)"
              used={usage.okfCount}
              max={usage.maxOkf}
              fallbackLabel="Use host-LLM OKF via MCP okf_enrich."
            />
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
              Free and quota-fallback packs use LiteParse. PDF is native; Office
              formats need LibreOffice on the packing machine.
            </p>
          </div>
          {usage.maxParses < Number.MAX_SAFE_INTEGER &&
            (usage.maxParses <= 0 || usage.parseCount >= usage.maxParses) && (
            <p className="text-sm text-(--muted)">
              No LlamaParse remaining —{" "}
              <Link className="text-(--accent) hover:underline" to="/dashboard/billing">
                upgrade
              </Link>{" "}
              for hosted multi-format LlamaParse.
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
