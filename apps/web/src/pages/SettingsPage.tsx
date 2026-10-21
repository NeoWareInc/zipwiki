import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  DEFAULT_ACCOUNT_SETTINGS,
  llamaParseTierSelectOptions,
  resolveLlamaParseTier,
  type AccountSettingsBody,
} from "@zipwiki/api-client";
import { api } from "@convex/_generated/api";
import { FormError } from "../components/AuthChrome";
import {
  OKF_SPEC_LINK_LABEL,
  OKF_SPEC_URL,
  SETTINGS_LLM_SECTION,
  SETTINGS_ONBOARDING_BANNER,
  SETTINGS_PACK_SECTION,
  SETTINGS_PAGE,
  SETTINGS_PARSE_SECTION,
  SETTINGS_WHY_LLM,
  SETTINGS_WHY_PARSE,
} from "../lib/settings-onboarding-copy";

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
        parser: {
          ...DEFAULT_ACCOUNT_SETTINGS.parser,
          ...saved.parser,
        },
        okf: {
          ...DEFAULT_ACCOUNT_SETTINGS.okf,
          ...saved.okf,
        },
        pack: {
          ...DEFAULT_ACCOUNT_SETTINGS.pack,
          ...saved.pack,
          compression: saved.pack?.compression ?? "zstd",
          level: saved.pack?.level ?? 7,
        },
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
      if (embedded) {
        // CliSetupPage (and other embeds) own post-save UI via onSaved.
      } else if (onboarding) {
        navigate("/dashboard");
      } else {
        // Leave Settings: prefer the page that opened it, else dashboard.
        const idx = (window.history.state as { idx?: number } | null)?.idx;
        if (typeof idx === "number" && idx > 0) {
          navigate(-1);
        } else {
          navigate("/dashboard");
        }
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
    <form onSubmit={onSubmit} className="space-y-10">
      {onboarding && (
        <div className="rounded-lg border border-(--border) bg-(--paper) p-4 text-sm text-(--muted) space-y-2">
          <p>{SETTINGS_ONBOARDING_BANNER.body}</p>
          {!embedded && (
            <p>
              <a
                className="text-(--accent) hover:underline"
                href={SETTINGS_ONBOARDING_BANNER.howItWorksHref}
              >
                {SETTINGS_ONBOARDING_BANNER.howItWorksLabel}
              </a>
              {" · "}
              Keys of your own stay on this machine and are turned on under
              Advanced settings.
            </p>
          )}
        </div>
      )}
      {saveError && <FormError message={saveError} />}

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">
          {SETTINGS_WHY_PARSE.title}
        </h2>
        <p className="text-sm leading-relaxed text-(--muted)">
          {SETTINGS_WHY_PARSE.body}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">
          {SETTINGS_PARSE_SECTION.title}
        </h2>
        <p className="text-sm text-(--muted)">{SETTINGS_PARSE_SECTION.intro}</p>
        <p className="text-sm text-(--muted)">
          {SETTINGS_PARSE_SECTION.billingNote}
        </p>
        {isFreePlan && (
          <p className="rounded-lg border border-(--border) bg-(--paper) p-3 text-sm text-(--muted)">
            A free account parses with local LiteParse.{" "}
            <a className="text-(--accent) hover:underline" href="/dashboard/billing">
              Buy credits
            </a>{" "}
            to use LlamaParse on the ZipWiki account.
          </p>
        )}
        <Select
          label="Parser for new Knowledge Archives"
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
              : [{ value: "zipwiki", label: "ZipWiki account · LlamaParse" }]),
            { value: "local", label: "Local LiteParse" },
            ...(form.byo?.llama
              ? [{ value: "llama", label: "LlamaParse (your key)" }]
              : []),
          ]}
        />
        {(form.parseCredential === "zipwiki" ||
          form.parseCredential === "llama") && (
          <Select
            label="LlamaParse tier"
            value={resolveLlamaParseTier(form.parser.llamaparse?.tier)}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                parser: {
                  ...f.parser,
                  llamaparse: {
                    ...f.parser.llamaparse,
                    tier: resolveLlamaParseTier(v),
                  },
                },
              }))
            }
            options={llamaParseTierSelectOptions()}
          />
        )}
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
        <h2 className="font-display text-xl font-semibold">
          {SETTINGS_WHY_LLM.title}
        </h2>
        <p className="text-sm leading-relaxed text-(--muted)">
          {SETTINGS_WHY_LLM.body}
        </p>
        <p className="text-sm">
          <a
            className="text-(--accent) hover:underline"
            href={OKF_SPEC_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {OKF_SPEC_LINK_LABEL}
          </a>
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">
          {SETTINGS_LLM_SECTION.title}
        </h2>
        <p className="text-sm text-(--muted)">{SETTINGS_LLM_SECTION.intro}</p>
        <Select
          label="OKF writer (CLI / website pack)"
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
                  okfCredential === "anthropic" || okfCredential === "zipwiki"
                    ? "anthropic"
                    : f.okf.provider,
                model:
                  okfCredential === "zipwiki"
                    ? hostedOkfModel(f.okf.model)
                    : f.okf.model,
              },
            }));
          }}
          options={[
            ...(isFreePlan
              ? []
              : [
                  {
                    value: "zipwiki",
                    label: `ZipWiki account · ${hostedOkfModelLabel(form.okf.model)}`,
                  },
                ]),
            {
              value: "local",
              label: "Skip ZipWiki AI OKF on CLI (deterministic / no hosted LLM)",
            },
            ...(form.byo?.anthropic
              ? [{ value: "anthropic", label: "Anthropic (your machine key)" }]
              : []),
          ]}
        />
        {form.okfCredential === "zipwiki" && !isFreePlan && (
          <Select
            label="Claude model (CLI & website only — not MCP)"
            value={hostedOkfModel(form.okf.model)}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                okf: { ...f.okf, provider: "anthropic", model: v },
              }))
            }
            options={[
              { value: "claude-haiku-5-5", label: "Haiku 5.5 (cheapest)" },
              { value: "claude-sonnet-4-5", label: "Sonnet 4.5" },
              { value: "claude-opus-4-5", label: "Opus 4.5" },
            ]}
          />
        )}
      </section>

      <section id="packing" className="scroll-mt-24 space-y-3">
        <h2 className="font-display text-xl font-semibold">
          {SETTINGS_PACK_SECTION.title}
        </h2>
        <p className="text-sm text-(--muted)">{SETTINGS_PACK_SECTION.intro}</p>
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
              selected when you create a Knowledge Archive.
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
        className="mt-1 w-full rounded-md border border-(--border) bg-(--surface) px-3 py-2"
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

function hostedOkfModel(model: string | undefined): string {
  const value = model?.trim();
  if (
    value === "claude-haiku-5-5" ||
    value === "claude-sonnet-4-5" ||
    value === "claude-opus-4-5"
  ) {
    return value;
  }
  return "claude-haiku-5-5";
}

function hostedOkfModelLabel(model: string | undefined): string {
  const id = hostedOkfModel(model);
  if (id === "claude-sonnet-4-5") return "Sonnet 4.5";
  if (id === "claude-opus-4-5") return "Opus 4.5";
  return "Haiku 5.5";
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">
          {SETTINGS_PAGE.title}
        </h1>
        <p className="mt-2 max-w-2xl text-(--muted)">{SETTINGS_PAGE.lead}</p>
      </div>
      <div className="rounded-xl border border-(--border) bg-(--surface) shadow-soft p-6 md:p-8">
        <AccountSettingsForm />
      </div>
      <p className="text-sm text-(--muted)">
        Need a machine key for scripts or older clients?{" "}
        <Link
          to="/dashboard/keys"
          className="text-(--accent) hover:underline"
        >
          Manage API keys
        </Link>
      </p>
    </div>
  );
}
