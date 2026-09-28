import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

type KeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt?: number | null;
  createdAt?: number;
};

export default function KeysPage() {
  const [params, setParams] = useSearchParams();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revealedById, setRevealedById] = useState<Record<string, string>>({});
  const [welcome, setWelcome] = useState(false);
  const [busy, setBusy] = useState(false);
  const keys = useQuery(api.apiKeys.listMine);
  const createMine = useMutation(api.apiKeys.createMine);
  const revokeMine = useMutation(api.apiKeys.revokeMine);

  useEffect(() => {
    if (params.get("welcome") === "1") {
      setWelcome(true);
      params.delete("welcome");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  async function create(name: string) {
    setBusy(true);
    try {
      const res = await createMine({ name });
      setNewKey(res.apiKey);
      setRevealedById((prev) => ({ ...prev, [res.id]: res.apiKey }));
    } finally {
      setBusy(false);
    }
  }

  const newestId = keys?.[0]?.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-3xl font-semibold">API keys</h1>
        <button
          type="button"
          onClick={() => void create("API key")}
          disabled={busy}
          className="rounded-md bg-(--accent) px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-(--accent-bright)"
        >
          Create key
        </button>
      </div>

      {welcome && (
        <div className="rounded-xl border border-(--border) bg-(--paper) p-4 text-sm text-(--ink)">
          Welcome — your account is ready. Connect the CLI with{" "}
          <code className="text-xs">zipwiki login</code>. The dashboard uses
          your session and does not need a key.
        </div>
      )}

      <p className="text-sm text-(--muted)">
        Full secrets are shown only once when created.{" "}
        <code className="text-xs">zipwiki login</code> connects this same
        account and writes the API URL and key on that machine. Last used
        updates when the key hits the hosted API (parse, OKF, whoami).
      </p>

      {newKey && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-medium">New key — copy now:</p>
          <p className="mt-1 text-(--muted)">
            Used by zipwiki and HTTP clients as a Bearer token — not for signing
            into this website. It won&apos;t be shown again after you leave this
            page.
          </p>
          <div className="mt-2 flex items-start gap-2">
            <code className="block flex-1 break-all rounded-md bg-white/70 p-3 text-xs">
              {newKey}
            </code>
            <CopyButton value={newKey} label="Copy API key" />
          </div>
          <p className="mt-3 text-xs text-(--muted)">
            This key is for HTTP clients. The CLI uses{" "}
            <code>zipwiki login</code>, which saves the connection for this
            account.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-(--border) bg-white shadow-soft">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-(--border) bg-(--paper)">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Prefix</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Last used</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {keys?.map((k: KeyRow) => {
              const fullKey = revealedById[k.id];
              const isNewest = k.id === newestId;
              return (
                <tr
                  key={k.id}
                  className="border-b border-(--border) last:border-0"
                >
                  <td className="px-4 py-3">
                    {k.name}
                    {isNewest ? (
                      <span className="ml-2 text-xs text-(--muted)">
                        (newest)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs">
                        {fullKey ?? `${k.keyPrefix}…`}
                      </code>
                      {fullKey ? (
                        <CopyButton value={fullKey} label="Copy API key" />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-(--muted)">
                    {k.createdAt
                      ? new Date(k.createdAt).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-(--muted)">
                    {k.lastUsedAt
                      ? new Date(k.lastUsedAt).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() =>
                        void revokeMine({ id: k.id as Id<"apiKeys"> })
                      }
                      className="text-red-600 hover:underline"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              );
            })}
            {keys?.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-(--muted)"
                >
                  No keys yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={copied ? "Copied" : label}
      aria-label={copied ? "Copied" : label}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-(--border) bg-white text-(--ink) hover:bg-(--paper)"
    >
      {copied ? <CheckIcon /> : <ClipboardIcon />}
    </button>
  );
}

function ClipboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
