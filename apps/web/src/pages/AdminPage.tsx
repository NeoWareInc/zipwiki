import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { planOptionLabel, sortPlansByTier } from "../lib/plan-labels";

export default function AdminPage() {
  const [search, setSearch] = useState("");
  const [planError, setPlanError] = useState("");
  const accounts = useQuery(api.admin.listAccounts, {
    search: search || undefined,
  });
  const plans = useQuery(api.plans.listPlans);
  const summary = useQuery(api.admin.summary);
  const setDisabled = useMutation(api.admin.setDisabled);
  const setRole = useMutation(api.admin.setRole);
  const setPlan = useMutation(api.admin.setPlan);

  const planOptions = sortPlansByTier(plans ?? []);

  const list = (accounts ?? []) as Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    disabled: boolean;
    plan: { slug: string; name: string };
    usage: { parseCount: number; okfCount: number };
  }>;
  const admins = list.filter((a) => a.role === "admin");
  const customers = list.filter((a) => a.role !== "admin");

  async function changePlan(accountId: string, planSlug: string) {
    setPlanError("");
    try {
      await setPlan({ id: accountId as Id<"accounts">, planSlug });
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Failed to set plan");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Users</h1>
        <p className="mt-1 text-sm text-(--muted)">
          Manage accounts, roles, plans, and access. Only visible to admins.
        </p>
      </div>

      {summary && (
        <div className="grid gap-4 md:grid-cols-5">
          <Stat label="Accounts" value={summary.accounts} />
          <Stat label="Admins" value={summary.admins} />
          <Stat label="Total parses" value={summary.totalParses} />
          <Stat label="Total OKF" value={summary.totalOkf} />
          <Stat label="Disabled" value={summary.disabledAccounts} />
        </div>
      )}

      {planError && <p className="text-sm text-red-600">{planError}</p>}

      <input
        type="search"
        placeholder="Search email, name, or role…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md rounded-md border border-(--border) px-3 py-2 text-sm"
      />

      <AccountTable
        title="Admins"
        rows={admins}
        emptyLabel="No admins found."
        planOptions={planOptions}
        onDisable={(id, disabled) =>
          void setDisabled({ id: id as Id<"accounts">, disabled })
        }
        onSetRole={(id, role) =>
          void setRole({ id: id as Id<"accounts">, role })
        }
        onSetPlan={(id, planSlug) => void changePlan(id, planSlug)}
      />
      <AccountTable
        title="Customers"
        rows={customers}
        emptyLabel="No customers found."
        planOptions={planOptions}
        onDisable={(id, disabled) =>
          void setDisabled({ id: id as Id<"accounts">, disabled })
        }
        onSetRole={(id, role) =>
          void setRole({ id: id as Id<"accounts">, role })
        }
        onSetPlan={(id, planSlug) => void changePlan(id, planSlug)}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-(--border) bg-white shadow-soft p-4">
      <p className="text-xs text-(--muted)">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function AccountTable({
  title,
  rows,
  emptyLabel,
  planOptions,
  onDisable,
  onSetRole,
  onSetPlan,
}: {
  title: string;
  rows: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    disabled: boolean;
    plan: { slug: string; name: string };
    usage: { parseCount: number; okfCount: number };
  }>;
  emptyLabel: string;
  planOptions: Array<{
    slug: string;
    name: string;
    maxParsesPerMonth: number;
    maxOkfPerMonth: number;
  }>;
  onDisable: (id: string, disabled: boolean) => void;
  onSetRole: (id: string, role: "admin" | "customer") => void;
  onSetPlan: (id: string, planSlug: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <div className="overflow-hidden rounded-xl border border-(--border) bg-white shadow-soft">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-(--border) bg-(--paper)">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Usage</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-(--border) last:border-0">
                <td className="px-4 py-3">
                  <Link
                    to={`/admin/accounts/${a.id}`}
                    className="font-medium text-(--accent) hover:underline"
                  >
                    {a.email}
                  </Link>
                  <div className="text-xs text-(--muted)">{a.name}</div>
                </td>
                <td className="px-4 py-3">
                  <select
                    aria-label={`Plan for ${a.email}`}
                    value={a.plan.slug}
                    onChange={(e) => onSetPlan(a.id, e.target.value)}
                    className="max-w-44 rounded-md border border-(--border) bg-white px-2 py-1 text-sm"
                  >
                    {!planOptions.some((p) => p.slug === a.plan.slug) && (
                      <option value={a.plan.slug}>{a.plan.name}</option>
                    )}
                    {planOptions.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {planOptionLabel(p)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-(--muted)">
                  {a.usage.parseCount} / {a.usage.okfCount}
                </td>
                <td className="px-4 py-3">
                  {a.disabled ? "disabled" : a.status}
                </td>
                <td className="px-4 py-3 space-x-2 text-right">
                  <button
                    type="button"
                    className="text-xs text-(--accent) hover:underline"
                    onClick={() =>
                      onSetRole(
                        a.id,
                        a.role === "admin" ? "customer" : "admin",
                      )
                    }
                  >
                    {a.role === "admin" ? "Demote" : "Promote"}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => onDisable(a.id, !a.disabled)}
                  >
                    {a.disabled ? "Enable" : "Disable"}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-(--muted)">
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
