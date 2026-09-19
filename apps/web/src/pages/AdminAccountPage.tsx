import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { planEntitlementBlurb, planOptionLabel, sortPlansByTier } from "../lib/plan-labels";

export default function AdminAccountPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const data = useQuery(
    api.admin.accountDetail,
    id ? { id: id as Id<"accounts"> } : "skip",
  );
  const plans = useQuery(api.plans.listPlans);
  const setPlan = useMutation(api.admin.setPlan);
  const setRole = useMutation(api.admin.setRole);
  const setDisabled = useMutation(api.admin.setDisabled);
  const revokeKeys = useMutation(api.admin.revokeKeys);
  const remove = useMutation(api.admin.deleteAccount);

  if (data === undefined) return <p className="text-(--muted)">Loading…</p>;
  if (data === null) {
    return <p className="text-sm text-red-600">Account not found</p>;
  }

  const a = data.account;
  const planOptions = sortPlansByTier(plans ?? []);

  async function run(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin" className="text-sm text-(--muted) hover:underline">
          ← Users
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold">{a.email}</h1>
        <p className="text-sm text-(--muted)">
          {a.auth} sign-in · joined {new Date(a.createdAt).toLocaleDateString()}
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-(--border) bg-white shadow-soft p-4 space-y-3">
          <p>
            Plan:{" "}
            <strong>
              {a.plan.slug === "custom" ? "Unlimited" : a.plan.name}
            </strong>
          </p>
          <p className="text-sm text-(--muted)">
            {planEntitlementBlurb(a.plan)}
          </p>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Assign plan</span>
            <select
              value={a.plan.slug}
              onChange={(e) =>
                void run(() =>
                  setPlan({
                    id: a.id as Id<"accounts">,
                    planSlug: e.target.value,
                  }),
                )
              }
              className="w-full rounded-md border border-(--border) bg-white px-3 py-2 text-sm"
            >
              {planOptions.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {planOptionLabel(p)}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-(--muted)">
            Free (LiteParse) → Standard (2,000 docs) → Pro (20,000 docs) →
            Unlimited. Unlimited is admin/sales assigned, not Stripe self-serve.
          </p>
        </div>
        <div className="rounded-xl border border-(--border) bg-white shadow-soft p-4 space-y-2">
          <p>
            Role: <strong>{a.role}</strong> · Status:{" "}
            <strong>{a.disabled ? "disabled" : a.status}</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-(--border) px-2 py-1 text-xs"
              onClick={() =>
                void run(() =>
                  setRole({
                    id: a.id as Id<"accounts">,
                    role: a.role === "admin" ? "customer" : "admin",
                  }),
                )
              }
            >
              Toggle role
            </button>
            <button
              type="button"
              className="rounded-md border border-(--border) px-2 py-1 text-xs"
              onClick={() =>
                void run(() =>
                  setDisabled({
                    id: a.id as Id<"accounts">,
                    disabled: !a.disabled,
                  }),
                )
              }
            >
              {a.disabled ? "Enable" : "Disable"}
            </button>
            <button
              type="button"
              className="rounded-md border border-(--border) px-2 py-1 text-xs text-red-600"
              onClick={() =>
                void run(() => revokeKeys({ id: a.id as Id<"accounts"> }))
              }
            >
              Revoke keys
            </button>
            <button
              type="button"
              className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700"
              onClick={() =>
                void run(async () => {
                  await remove({ id: a.id as Id<"accounts"> });
                  navigate("/admin");
                })
              }
            >
              Delete account
            </button>
          </div>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold">API keys</h2>
        <ul className="rounded-xl border border-(--border) bg-white shadow-soft divide-y divide-(--border)">
          {data.keys.map((k: {
            id: string;
            name: string;
            prefix: string;
            revoked: boolean;
          }) => (
            <li key={k.id} className="px-4 py-3 text-sm">
              {k.name} · <code>{k.prefix}…</code>
              {k.revoked ? " (revoked)" : ""}
            </li>
          ))}
          {data.keys.length === 0 && (
            <li className="px-4 py-6 text-sm text-(--muted)">No keys</li>
          )}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold">Usage periods</h2>
        <ul className="rounded-xl border border-(--border) bg-white shadow-soft divide-y divide-(--border)">
          {data.periods.map((p: {
            periodStart: string;
            parseCount: number;
            okfCount: number;
          }) => (
            <li key={p.periodStart} className="px-4 py-3 text-sm">
              {new Date(p.periodStart).toLocaleDateString()}: {p.parseCount}{" "}
              parses / {p.okfCount} OKF
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
