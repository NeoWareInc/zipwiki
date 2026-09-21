import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminBillingPage() {
  const ensure = useMutation(api.adminBilling.ensureProviders);
  const restock = useMutation(api.adminBilling.restock);
  const setLowFloat = useMutation(api.adminBilling.setLowFloat);
  const overview = useQuery(api.adminBilling.overview);
  const [error, setError] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [thresholds, setThresholds] = useState<Record<string, string>>({});

  useEffect(() => {
    void ensure({}).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Could not prepare providers");
    });
  }, [ensure]);

  async function onRestock(slug: string) {
    setError("");
    const usd = Number(amounts[slug] ?? "");
    if (!Number.isFinite(usd) || usd <= 0) {
      setError("Enter a dollar amount you added in the vendor console");
      return;
    }
    try {
      await restock({
        slug,
        usdCents: Math.round(usd * 100),
        note: notes[slug],
      });
      setAmounts((prev) => ({ ...prev, [slug]: "" }));
      setNotes((prev) => ({ ...prev, [slug]: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restock failed");
    }
  }

  async function onThreshold(slug: string) {
    setError("");
    const usd = Number(thresholds[slug] ?? "");
    if (!Number.isFinite(usd) || usd < 0) {
      setError("Enter a low-float threshold in dollars");
      return;
    }
    try {
      await setLowFloat({ slug, usdCents: Math.round(usd * 100) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save threshold");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Billing</h1>
        <p className="mt-1 text-sm text-(--muted)">
          Customer credits and the master vendor accounts. API keys stay on Fly
          and are not shown here.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold">Master accounts</h2>
        {(overview?.providers ?? []).map((provider) => (
          <div
            key={provider.slug}
            className="space-y-3 rounded-xl border border-(--border) bg-white p-5 shadow-soft"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">{provider.displayName}</h3>
              <p className="text-sm text-(--muted)">
                Secret env <code>{provider.secretEnv}</code>
              </p>
            </div>
            <p className="text-sm">
              Float {dollars(provider.floatUsdCents)}
              {provider.lowFloat
                ? " · low — add funds in the vendor console"
                : ""}
            </p>
            <p className="text-sm text-(--muted)">
              Since last restock: {provider.calls.toLocaleString()} calls ·{" "}
              {provider.pages.toLocaleString()} pages ·{" "}
              {provider.inputTokens.toLocaleString()} in /{" "}
              {provider.outputTokens.toLocaleString()} out tokens
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Dollars added"
                value={amounts[provider.slug] ?? ""}
                onChange={(e) =>
                  setAmounts((prev) => ({ ...prev, [provider.slug]: e.target.value }))
                }
                className="w-36 rounded-md border border-(--border) px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="Note"
                value={notes[provider.slug] ?? ""}
                onChange={(e) =>
                  setNotes((prev) => ({ ...prev, [provider.slug]: e.target.value }))
                }
                className="min-w-40 flex-1 rounded-md border border-(--border) px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void onRestock(provider.slug)}
                className="rounded-md bg-(--accent) px-3 py-2 text-sm font-semibold text-white"
              >
                Record restock
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Low-float warning ($)"
                value={
                  thresholds[provider.slug] ??
                  (provider.lowFloatUsdCents
                    ? String(provider.lowFloatUsdCents / 100)
                    : "")
                }
                onChange={(e) =>
                  setThresholds((prev) => ({
                    ...prev,
                    [provider.slug]: e.target.value,
                  }))
                }
                className="w-48 rounded-md border border-(--border) px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void onThreshold(provider.slug)}
                className="rounded-md border border-(--border) px-3 py-2 text-sm font-semibold"
              >
                Save warning
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Customer credits</h2>
        <div className="overflow-x-auto rounded-xl border border-(--border) bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-(--border) text-(--muted)">
              <tr>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Remaining</th>
                <th className="px-3 py-2 font-medium">Spent</th>
                <th className="px-3 py-2 font-medium">Auto-reload</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.accounts ?? []).map((account) => (
                <tr key={account.id} className="border-b border-(--border)">
                  <td className="px-3 py-2">
                    {account.email}
                    <div className="text-(--muted)">{account.name}</div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {account.creditsUnlimited
                      ? "Unlimited"
                      : account.creditsRemaining.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {account.creditsSpent.toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    {account.autoReloadEnabled ? "On" : "Off"}
                    {account.autoReloadLastError
                      ? ` · ${account.autoReloadLastError}`
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Recent ledger</h2>
        <ul className="space-y-2 text-sm">
          {(overview?.recent ?? []).map((row) => (
            <li key={row.id} className="rounded-md border border-(--border) bg-white px-3 py-2">
              <span className="font-medium">{row.email || "account"}</span>{" "}
              {row.kind} {row.credits.toLocaleString()} credits
              {row.provider ? ` · ${row.provider}` : ""}
              {row.model ? ` ${row.model}` : ""}
              {row.pages ? ` · ${row.pages} pages` : ""}
              <span className="text-(--muted)"> · {row.createdAt}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
