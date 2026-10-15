import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { AdminCreditsLock } from "../components/AdminCreditsLock";

const VENDOR_CONSOLES = [
  {
    name: "LlamaParse (LlamaCloud)",
    href: "https://cloud.llamaindex.ai/",
    note: "Sign in → Settings → Organization → Plan & Credits (balance, plan, overage, invoices)",
  },
  {
    name: "Anthropic (Claude API)",
    href: "https://console.anthropic.com/settings/billing",
    note: "Credit balance, auto-reload, and billing alerts",
  },
] as const;

export default function AdminBillingPage() {
  const overview = useQuery(api.adminBilling.overview);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Billing</h1>
        <p className="mt-1 text-sm text-(--muted)">
          Customer ZipWiki prepaid credits and the platform spend lock. Hosted
          LlamaParse / Claude keys stay on Fly — manage vendor balances in their
          consoles (and turn on their email alerts). Usage by account is under{" "}
          <Link to="/admin/usage" className="text-(--accent) hover:underline">
            Usage
          </Link>
          .
        </p>
      </div>

      <section className="rounded-xl border border-(--border) bg-white p-5 shadow-soft space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Vendor credits</h2>
          <p className="mt-1 text-sm text-(--muted)">
            ZipWiki does not show live vendor wallets. Open each console for
            balance, autofill, and alert emails. API keys stay on Fly.
          </p>
        </div>
        <ul className="space-y-3">
          {VENDOR_CONSOLES.map((vendor) => (
            <li
              key={vendor.name}
              className="rounded-lg border border-(--border) bg-(--paper) px-4 py-3"
            >
              <a
                href={vendor.href}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-(--accent) hover:underline"
              >
                {vendor.name} →
              </a>
              <p className="mt-1 text-sm text-(--muted)">{vendor.note}</p>
              <p className="mt-1 break-all text-xs text-(--muted)">{vendor.href}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Customer credits</h2>
        <AdminCreditsLock />
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
                    {account.creditsLocked ? "Locked · " : ""}
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
    </div>
  );
}
