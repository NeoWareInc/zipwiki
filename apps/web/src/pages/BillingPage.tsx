import { useSearchParams } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@convex/_generated/api";

const PRESETS = [5, 10, 25, 50, 100] as const;
const MIN_USD = 5;
const MAX_USD = 10_000;
const DEFAULT_USD = 10;
const CREDITS_PER_DOLLAR = 100;

function clampUsd(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_USD;
  return Math.min(MAX_USD, Math.max(MIN_USD, Math.round(n * 100) / 100));
}

export default function BillingPage() {
  const [params] = useSearchParams();
  const [pending, setPending] = useState(false);
  const [usd, setUsd] = useState(DEFAULT_USD);
  const [custom, setCustom] = useState(String(DEFAULT_USD));
  const [reloadOn, setReloadOn] = useState(false);
  const [reloadThreshold, setReloadThreshold] = useState("500");
  const [reloadUsd, setReloadUsd] = useState("10");
  const [reloadReady, setReloadReady] = useState(false);
  const me = useQuery(api.profiles.me);
  const usage = useQuery(api.usage.myUsage);
  const checkout = useAction(api.stripe.createCreditCheckout);
  const portal = useAction(api.stripe.createBillingPortal);
  const setAutoReload = useMutation(api.billing.setAutoReload);

  const credits = useMemo(
    () => Math.round(clampUsd(usd) * CREDITS_PER_DOLLAR),
    [usd],
  );

  useEffect(() => {
    if (!usage || reloadReady) return;
    setReloadReady(true);
    setReloadOn(usage.autoReloadEnabled);
    setReloadThreshold(String(usage.autoReloadThresholdCredits));
    setReloadUsd((usage.autoReloadUsdCents / 100).toFixed(2));
  }, [usage, reloadReady]);

  const remaining = usage?.creditsRemaining ?? 0;
  const purchased = usage?.creditsPurchased ?? 0;
  const spent = usage?.creditsSpent ?? 0;
  const unlimited = usage?.creditsUnlimited === true;
  const low = usage?.lowCredits === true;

  function selectPreset(n: number) {
    setUsd(n);
    setCustom(String(n));
  }

  function onCustomChange(raw: string) {
    setCustom(raw);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      setUsd(clampUsd(parsed));
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">Billing</h1>

      {(params.get("success") || params.get("checkout") === "success") && (
        <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
          Payment received — credits will appear in a few seconds.
        </p>
      )}

      {(params.get("cancel") || params.get("checkout") === "cancel") && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Checkout canceled — no credits were purchased.
        </p>
      )}

      {low && !unlimited && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Credits are running low ({remaining.toLocaleString()} remaining).
          Buy more below to keep hosted LlamaParse and ZipWiki OKF available.
        </p>
      )}

      <div className="rounded-xl border border-(--border) bg-white shadow-soft p-6 space-y-3">
        <h2 className="font-display text-xl font-semibold">Credit balance</h2>
        {unlimited ? (
          <p className="text-sm">
            Unlimited hosted usage (admin assigned).
          </p>
        ) : (
          <>
            <p className="text-3xl font-semibold tabular-nums">
              {remaining.toLocaleString()}{" "}
              <span className="text-base font-normal text-(--muted)">
                remaining
              </span>
            </p>
            <p className="text-sm text-(--muted)">
              Purchased {purchased.toLocaleString()} · Used{" "}
              {spent.toLocaleString()}
            </p>
          </>
        )}
        <p className="text-sm text-(--muted)">
          Credits pay for hosted LlamaParse and hosted ZipWiki OKF (outside
          MCP). Local LiteParse and MCP host-LLM OKF stay free.
        </p>
        <p className="text-sm text-(--muted)">
          Account status: {me?.account.status ?? "—"}
        </p>

        {me?.account.stripeCustomerId && (
          <button
            type="button"
            onClick={() => {
              setPending(true);
              void portal({})
                .then((res) => {
                  if (res.url) window.location.href = res.url;
                })
                .finally(() => setPending(false));
            }}
            disabled={pending}
            className="rounded-md border border-(--border) px-4 py-2 text-sm font-semibold"
          >
            Manage billing / receipts
          </button>
        )}
      </div>

      <div className="rounded-xl border border-(--border) bg-white shadow-soft p-6 space-y-4">
        <h2 className="font-display text-xl font-semibold">Automatic restock</h2>
        <p className="text-sm text-(--muted)">
          When your balance falls under the threshold, ZipWiki charges the card
          from your last credit purchase and emails a receipt.
        </p>
        {!usage?.hasPaymentMethod && (
          <p className="text-sm text-(--muted)">
            Buy credits once so Stripe can keep a card for automatic restock.
          </p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reloadOn}
            onChange={(e) => setReloadOn(e.target.checked)}
          />
          Restock automatically
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">When balance is under</span>
            <input
              type="number"
              min={0}
              value={reloadThreshold}
              onChange={(e) => setReloadThreshold(e.target.value)}
              className="w-36 rounded-md border border-(--border) bg-white px-3 py-2"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Reload amount (USD)</span>
            <input
              type="number"
              min={MIN_USD}
              max={MAX_USD}
              step="0.01"
              value={reloadUsd}
              onChange={(e) => setReloadUsd(e.target.value)}
              className="w-36 rounded-md border border-(--border) bg-white px-3 py-2"
            />
          </label>
        </div>
        {usage?.autoReloadLastError && (
          <p className="text-sm text-red-600">
            Last automatic charge failed: {usage.autoReloadLastError}
          </p>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setPending(true);
            void setAutoReload({
              enabled: reloadOn,
              thresholdCredits: Number(reloadThreshold),
              usdCents: Math.round(Number(reloadUsd) * 100),
            })
              .catch((err) => {
                alert(err instanceof Error ? err.message : "Could not save");
              })
              .finally(() => setPending(false));
          }}
          className="rounded-md border border-(--border) px-4 py-2 text-sm font-semibold"
        >
          Save automatic restock
        </button>
      </div>

      <div className="rounded-xl border border-(--border) bg-white shadow-soft p-6 space-y-4">
        <h2 className="font-display text-xl font-semibold">Buy credits</h2>
        <p className="text-sm text-(--muted)">
          ${MIN_USD.toFixed(2)}–${MAX_USD.toLocaleString()} · 100 credits per
          dollar · default ${DEFAULT_USD.toFixed(2)}
        </p>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => selectPreset(n)}
              className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${
                usd === n
                  ? "border-(--accent) bg-(--accent)/10 text-(--accent)"
                  : "border-(--border)"
              }`}
            >
              ${n}
            </button>
          ))}
        </div>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">Amount (USD)</span>
          <input
            type="number"
            min={MIN_USD}
            max={MAX_USD}
            step="0.01"
            value={custom}
            onChange={(e) => onCustomChange(e.target.value)}
            onBlur={() => {
              const clamped = clampUsd(Number(custom) || DEFAULT_USD);
              setUsd(clamped);
              setCustom(String(clamped));
            }}
            className="w-full max-w-xs rounded-md border border-(--border) bg-white px-3 py-2"
          />
        </label>

        <p className="text-sm">
          You get{" "}
          <strong className="tabular-nums">{credits.toLocaleString()}</strong>{" "}
          credits for{" "}
          <strong>${clampUsd(usd).toFixed(2)}</strong>.
        </p>

        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setPending(true);
            const cents = Math.round(clampUsd(usd) * 100);
            void checkout({ usdCents: cents })
              .then((res) => {
                if (res.url) window.location.href = res.url;
              })
              .catch((err) => {
                console.error(err);
                alert(err instanceof Error ? err.message : "Checkout failed");
              })
              .finally(() => setPending(false));
          }}
          className="rounded-md bg-(--accent) px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-(--accent-bright) disabled:opacity-50"
        >
          {pending ? "Starting checkout…" : "Buy credits"}
        </button>
      </div>
    </div>
  );
}
