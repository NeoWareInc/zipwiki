import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export default function AdminPage() {
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const accounts = useQuery(api.admin.listAccounts, {
    search: search || undefined,
  });
  const summary = useQuery(api.admin.summary);
  const setDisabled = useMutation(api.admin.setDisabled);
  const setRole = useMutation(api.admin.setRole);
  const setCreditsUnlimited = useMutation(api.admin.setCreditsUnlimited);

  const list = (accounts ?? []) as Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    disabled: boolean;
    usage: { parseCount: number; okfCount: number };
    creditsRemaining?: number;
    creditsUnlimited?: boolean;
  }>;
  const admins = list.filter((a) => a.role === "admin");
  const customers = list.filter((a) => a.role !== "admin");

  async function toggleUnlimited(accountId: string, unlimited: boolean) {
    setActionError("");
    try {
      await setCreditsUnlimited({
        id: accountId as Id<"accounts">,
        unlimited,
      });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update credits",
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Users</h1>
        <p className="mt-1 text-sm text-(--muted)">
          Manage accounts, roles, credits, and access. Only visible to admins.
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

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

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
        onDisable={(id, disabled) =>
          void setDisabled({ id: id as Id<"accounts">, disabled })
        }
        onSetRole={(id, role) =>
          void setRole({ id: id as Id<"accounts">, role })
        }
        onSetUnlimited={(id, unlimited) => void toggleUnlimited(id, unlimited)}
      />
      <AccountTable
        title="Customers"
        rows={customers}
        emptyLabel="No customers found."
        onDisable={(id, disabled) =>
          void setDisabled({ id: id as Id<"accounts">, disabled })
        }
        onSetRole={(id, role) =>
          void setRole({ id: id as Id<"accounts">, role })
        }
        onSetUnlimited={(id, unlimited) => void toggleUnlimited(id, unlimited)}
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
  onDisable,
  onSetRole,
  onSetUnlimited,
}: {
  title: string;
  rows: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    disabled: boolean;
    usage: { parseCount: number; okfCount: number };
    creditsRemaining?: number;
    creditsUnlimited?: boolean;
  }>;
  emptyLabel: string;
  onDisable: (id: string, disabled: boolean) => void;
  onSetRole: (id: string, role: "admin" | "customer") => void;
  onSetUnlimited: (id: string, unlimited: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <div className="overflow-hidden rounded-xl border border-(--border) bg-white shadow-soft">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-(--border) bg-(--paper)">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Credits</th>
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
                <td className="px-4 py-3 text-(--muted) tabular-nums">
                  <label className="flex items-center gap-2 text-(--ink)">
                    <input
                      type="checkbox"
                      checked={a.creditsUnlimited === true}
                      onChange={(e) => onSetUnlimited(a.id, e.target.checked)}
                      aria-label={`Unlimited credits for ${a.email}`}
                    />
                    <span>
                      {a.creditsUnlimited
                        ? "Unlimited"
                        : (a.creditsRemaining ?? 0).toLocaleString()}
                    </span>
                  </label>
                  <div className="text-xs">
                    {a.usage.parseCount}p / {a.usage.okfCount}okf
                  </div>
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
                <td colSpan={4} className="px-4 py-8 text-center text-(--muted)">
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
