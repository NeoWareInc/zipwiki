import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  DEFAULT_ACCOUNT_SETTINGS,
  type AccountSettingsBody,
} from "@zipwiki/api-client";
import { api } from "@convex/_generated/api";
import { FormError } from "../components/AuthChrome";

type Props = {
  /** Minimal chrome for /cli/setup */
  embedded?: boolean;
  onSaved?: () => void;
};

export function AccountSettingsForm({ embedded, onSaved }: Props) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const onboarding = params.get("onboarding") === "1" || embedded;

  const data = useQuery(api.settings.mine);
  const me = useQuery(api.profiles.me);
  const saveMine = useMutation(api.settings.saveMine);
  const planSlug = me?.plan?.slug ?? "free";
  const isFreePlan = planSlug === "free";

  const [form, setForm] = useState<AccountSettingsBody>(
    structuredClone(DEFAULT_ACCOUNT_SETTINGS),
  );
  const [advanced, setAdvanced] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.settings && typeof data.settings === "object") {
      const saved = data.settings as AccountSettingsBody;
      setForm({
        ...structuredClone(DEFAULT_ACCOUNT_SETTINGS),
        ...saved,
        byo: {
          llama: saved.byo?.llama === true || saved.parseCredential === "llama",
          anthropic:
            saved.byo?.anthropic === true || saved.okfCredential === "anthropic",
        },
      });
    }
  }, [data]);

  useEffect(() => {
    if (!isFreePlan) return;
    setForm((f) => {
      if (f.parseCredential !== "zipwiki") return f;
      return {
        ...f,
        parseCredential: "local",
        parser: {
          ...f.parser,
          engine: "liteparse",
          mode: "fixed",
          escalate: { ...f.parser.escalate, enabled: false },
        },
      };
    });
  }, [isFreePlan]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaveError("");
    setSaving(true);
    try {
      const toSave =
        isFreePlan && form.parseCredential === "zipwiki"
          ? {
              ...form,
              parseCredential: "local" as const,
              parser: {
                ...form.parser,
                engine: "liteparse" as const,
                mode: "fixed" as const,
              },
            }
          : form;
      await saveMine({ settings: toSave, markSetupComplete: true });
      onSaved?.();
      if (onboarding && !embedded) {
        navigate("/dashboard/keys?welcome=1");
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (data === undefined) {
    return <p className="text-(--muted)">Loading settings…</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {onboarding && (
        <p className="rounded-lg border border-(--border) bg-(--paper) p-4 text-sm text-(--muted)">
          Complete these preferences once. zipwiki downloads them when you pack.
          A bring-your-own Llama or Anthropic key stays on this machine and is
          turned on under Advanced settings.
        </p>
      )}
      {saveError && <FormError message={saveError} />}

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Parse source</h2>
        {isFreePlan && (
          <p className="rounded-lg border border-(--border) bg-(--paper) p-3 text-sm text-(--muted)">
            Without credits, pack uses local LiteParse only (not billed).{" "}
            <a className="text-(--accent) hover:underline" href="/dashboard/billing">
              Buy credits
            </a>{" "}
            for hosted LlamaParse.
          </p>
        )}
        <Select
          label="Where parse credentials come from"
          value={form.parseCredential}
          onChange={(v) => {
            const parseCredential = v as AccountSettingsBody["parseCredential"];
            if (isFreePlan && parseCredential === "zipwiki") return;
            setForm((f) => ({
              ...f,
              parseCredential,
              parser: {
                ...f.parser,
                engine:
                  parseCredential === "local" ? "liteparse" : "llamaparse",
                mode:
                  parseCredential === "local" ? f.parser.mode : "fixed",
              },
            }));
          }}
          options={[
            ...(isFreePlan
              ? []
              : [{ value: "zipwiki", label: "ZipWiki hosted LlamaParse" }]),
            { value: "local", label: "Local LiteParse" },
            ...(form.byo?.llama
              ? [{ value: "llama", label: "LlamaParse (your key)" }]
              : []),
          ]}
        />
        {form.parseCredential === "local" && (
          <>
            <Select
              label="Local parser"
              value={
                isFreePlan
                  ? "liteparse"
                  : form.parser.mode === "auto"
                    ? "auto"
                    : "liteparse"
              }
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  parser: {
                    ...f.parser,
                    engine: "liteparse",
                    mode: v === "auto" && !isFreePlan ? "auto" : "fixed",
                    escalate: {
                      ...f.parser.escalate,
                      enabled: v === "auto" && !isFreePlan,
                    },
                  },
                }))
              }
              options={[
                { value: "liteparse", label: "LiteParse (fixed)" },
                ...(isFreePlan
                  ? []
                  : [
                      {
                        value: "auto",
                        label: "Auto (escalate to Llama when needed)",
                      },
                    ]),
              ]}
            />
            <p className="text-sm text-(--muted)">
              PDF parses natively. Word / PowerPoint / spreadsheets need{" "}
              <a
                className="text-(--accent) hover:underline"
                href="https://developers.llamaindex.ai/liteparse/guides/multi-format/"
                target="_blank"
                rel="noreferrer"
              >
                LibreOffice
              </a>{" "}
              (<code className="text-xs">soffice</code> on PATH). macOS:{" "}
              <code className="text-xs">brew install --cask libreoffice</code>.
            </p>
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">OKF source</h2>
        <p className="text-sm text-(--muted)">
          ZipWiki hosted OKF uses prepaid credits. Without credits, pack uses
          host-LLM only.
        </p>
        <Select
          label="Where OKF enrichment comes from (CLI / optional MCP useZipcodexOkf)"
          value={form.okfCredential}
          onChange={(v) => {
            const okfCredential = v as AccountSettingsBody["okfCredential"];
            if (isFreePlan && okfCredential === "zipwiki") return;
            setForm((f) => ({
              ...f,
              okfCredential,
              okf: {
                ...f.okf,
                useAi: okfCredential !== "local",
                provider:
                  okfCredential === "anthropic" ? "anthropic" : f.okf.provider,
              },
            }));
          }}
          options={[
            ...(isFreePlan
              ? []
              : [{ value: "zipwiki", label: "ZipWiki hosted API" }]),
            { value: "local", label: "Skip AI OKF (host LLM / MCP)" },
            ...(form.byo?.anthropic
              ? [{ value: "anthropic", label: "Anthropic (your key)" }]
              : []),
          ]}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Pack defaults</h2>
        <Select
          label="Compression"
          value={form.pack.compression ?? "zstd"}
          onChange={(v) =>
            setForm((f) => ({
              ...f,
              pack: {
                ...f.pack,
                compression: v as "zstd" | "deflate" | "store",
              },
            }))
          }
          options={[
            { value: "zstd", label: "zstd (recommended)" },
            { value: "deflate", label: "deflate" },
            { value: "store", label: "store (no compression)" },
          ]}
        />
        <label className="block text-sm">
          <span className="font-medium">Compression level (0–9)</span>
          <input
            type="number"
            min={0}
            max={9}
            value={form.pack.level ?? 7}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                pack: { ...f.pack, level: Number(e.target.value) },
              }))
            }
            className="mt-1 w-full rounded-md border border-(--border) px-3 py-2"
          />
        </label>
        <Checkbox
          label="Omit original documents from .nzip when parsed (extract only)"
          checked={form.pack.omitOriginalDocuments !== false}
          onChange={(checked) =>
            setForm((f) => ({
              ...f,
              pack: { ...f.pack, omitOriginalDocuments: checked },
            }))
          }
        />
        <Checkbox
          label="Recurse into subdirectories when packing a folder"
          checked={form.pack.recurse === true}
          onChange={(checked) =>
            setForm((f) => ({
              ...f,
              pack: { ...f.pack, recurse: checked },
            }))
          }
        />
      </section>

      <div>
        <button
          type="button"
          className="text-sm text-(--accent) underline"
          onClick={() => setAdvanced((a) => !a)}
        >
          {advanced ? "Hide" : "Show"} advanced settings
        </button>
      </div>

      {advanced && (
        <section className="space-y-4 rounded-lg border border-(--border) p-4">
          <div className="space-y-3">
            <h2 className="font-display text-lg font-semibold">
              Bring your own keys
            </h2>
            <p className="text-sm text-(--muted)">
              Keys stay on this machine. Turn one on here, then it can be
              selected under Parse source or OKF source.
            </p>
            <Checkbox
              label="LlamaParse key on this machine"
              checked={form.byo?.llama === true}
              onChange={(checked) =>
                setForm((f) => ({
                  ...f,
                  byo: { ...f.byo, llama: checked },
                  ...(checked || f.parseCredential !== "llama"
                    ? {}
                    : {
                        parseCredential: "local" as const,
                        parser: {
                          ...f.parser,
                          engine: "liteparse" as const,
                          mode: "fixed" as const,
                        },
                      }),
                }))
              }
            />
            {form.byo?.llama && (
              <ByoHint
                env="LLAMA_CLOUD_API_KEY"
                cmd="zipwiki config api-key llama <key>"
              />
            )}
            <Checkbox
              label="Anthropic key on this machine"
              checked={form.byo?.anthropic === true}
              onChange={(checked) =>
                setForm((f) => ({
                  ...f,
                  byo: { ...f.byo, anthropic: checked },
                  ...(checked || f.okfCredential !== "anthropic"
                    ? {}
                    : {
                        okfCredential: "local" as const,
                        okf: { ...f.okf, useAi: false },
                      }),
                }))
              }
            />
            {form.byo?.anthropic && (
              <ByoHint
                env="ANTHROPIC_API_KEY"
                cmd="zipwiki config api-key anthropic <key>"
              />
            )}
          </div>
          <label className="block text-sm">
            <span className="font-medium">LiteParse max pages</span>
            <input
              type="number"
              min={1}
              value={form.parser.liteparse?.maxPages ?? 1000}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  parser: {
                    ...f.parser,
                    liteparse: {
                      ...f.parser.liteparse,
                      maxPages: Number(e.target.value),
                    },
                  },
                }))
              }
              className="mt-1 w-full rounded-md border border-(--border) px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">LiteParse DPI</span>
            <input
              type="number"
              min={72}
              value={form.parser.liteparse?.dpi ?? 150}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  parser: {
                    ...f.parser,
                    liteparse: {
                      ...f.parser.liteparse,
                      dpi: Number(e.target.value),
                    },
                  },
                }))
              }
              className="mt-1 w-full rounded-md border border-(--border) px-3 py-2"
            />
          </label>
          <Checkbox
            label="OCR enabled (LiteParse)"
            checked={form.parser.liteparse?.ocrEnabled !== false}
            onChange={(checked) =>
              setForm((f) => ({
                ...f,
                parser: {
                  ...f.parser,
                  liteparse: { ...f.parser.liteparse, ocrEnabled: checked },
                },
              }))
            }
          />
        </section>
      )}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-(--accent) px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-(--accent-bright) disabled:opacity-50 disabled:hover:bg-(--accent)"
      >
        {saving
          ? "Saving…"
          : onboarding
            ? "Save and continue"
            : "Save settings"}
      </button>
      {data?.setupComplete && !onboarding && (
        <p className="text-xs text-(--muted)">
          Last updated:{" "}
          {data.updatedAt ? new Date(data.updatedAt).toLocaleString() : "—"}
        </p>
      )}
    </form>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-(--border) bg-white px-3 py-2"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function ByoHint({ env, cmd }: { env: string; cmd: string }) {
  return (
    <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
      After linking the CLI, set <code>{env}</code> on this machine:
      <br />
      <code className="mt-1 block break-all">{cmd}</code>
    </p>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Settings</h1>
        <p className="mt-1 text-(--muted)">
          Pack and parse preferences for zipwiki (synced to your account).
        </p>
      </div>
      <div className="rounded-xl border border-(--border) bg-white shadow-soft p-6">
        <AccountSettingsForm />
      </div>
    </div>
  );
}
