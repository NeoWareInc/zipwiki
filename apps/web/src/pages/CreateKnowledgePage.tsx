import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import type { AccountSettingsBody } from "@zipwiki/api-client";
import { api } from "@convex/_generated/api";
import { CopyButton } from "../components/ZipWikiPrompts";
import { InfoTip } from "../components/InfoTip";
import {
  CLI_PREFIXES,
  OKF_PROFILES,
  applyAccountSettingsToPackBuilder,
  buildCliPackCommand,
  buildMcpPackPrompt,
  defaultPackBuilderState,
  type CliPrefix,
  type CompressionAlg,
  type OkfProfile,
  type PackBuilderState,
} from "../lib/pack-command";

export default function CreateKnowledgePage() {
  const settingsData = useQuery(api.settings.mine);
  const [state, setState] = useState<PackBuilderState>(defaultPackBuilderState);
  const [defaultsMsg, setDefaultsMsg] = useState("");

  const mcpPrompt = useMemo(() => buildMcpPackPrompt(state), [state]);
  const cliCommand = useMemo(() => buildCliPackCommand(state), [state]);

  function patch(partial: Partial<PackBuilderState>) {
    setState((s) => ({ ...s, ...partial }));
    setDefaultsMsg("");
  }

  function setSourceAt(index: number, value: string) {
    setState((s) => {
      const sourcePaths = [...s.sourcePaths];
      sourcePaths[index] = value;
      return { ...s, sourcePaths };
    });
    setDefaultsMsg("");
  }

  function addSourcePath() {
    setState((s) => ({ ...s, sourcePaths: [...s.sourcePaths, ""] }));
    setDefaultsMsg("");
  }

  function removeSourcePath(index: number) {
    setState((s) => {
      if (s.sourcePaths.length <= 1) return s;
      return {
        ...s,
        sourcePaths: s.sourcePaths.filter((_, i) => i !== index),
      };
    });
    setDefaultsMsg("");
  }

  function loadDefaults() {
    const settings = settingsData?.settings as AccountSettingsBody | undefined;
    setState((s) => applyAccountSettingsToPackBuilder(s, settings));
    setDefaultsMsg("Loaded from your Knowledge Archive settings");
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Create ZipWiki</h1>
        <p className="mt-1 max-w-2xl text-sm text-(--muted)">
          Build a pack command for this machine — MCP or CLI. Paths are resolved
          where the agent or{" "}
          <code className="text-xs">zipwiki</code> runs, not in the browser.
          Then open the{" "}
          <code className="text-xs">.zipwiki</code> on{" "}
          <Link
            to="/dashboard/knowledge"
            className="text-(--accent) hover:underline"
          >
            Query ZipWiki
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={loadDefaults}
          className="rounded-md border border-(--border) bg-white px-3 py-1.5 text-sm font-semibold text-(--ink) hover:bg-(--paper)"
        >
          Use default settings
        </button>
        <Link
          to="/dashboard/settings#packing"
          className="text-sm text-(--accent) hover:underline"
        >
          Edit defaults
        </Link>
        {defaultsMsg ? (
          <span className="text-xs text-(--muted)">{defaultsMsg}</span>
        ) : null}
      </div>

      <section className="space-y-5">
        <div className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Paths</h2>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
              Source path(s)
              <InfoTip label="About source paths">
                Local file or folder paths on the machine where{" "}
                <code className="text-[11px]">zipwiki</code> or MCP runs. Put
                documents under a <code className="text-[11px]">knowledge/</code>{" "}
                directory, or point at any path you can read.
              </InfoTip>
            </span>
            {state.sourcePaths.map((path, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  value={path}
                  onChange={(e) => setSourceAt(i, e.target.value)}
                  placeholder={
                    i === 0 ? "./knowledge" : "./knowledge/other"
                  }
                  className="min-w-0 flex-1 rounded-md border border-(--border) bg-white px-3 py-2 font-mono text-sm"
                />
                {state.sourcePaths.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeSourcePath(i)}
                    className="shrink-0 rounded-md border border-(--border) px-2 text-xs text-(--muted) hover:bg-(--paper)"
                    aria-label="Remove path"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              onClick={addSourcePath}
              className="text-sm text-(--accent) hover:underline"
            >
              + another path
            </button>
            {state.sourcePaths.filter((p) => p.trim()).length > 1 ? (
              <p className="text-xs text-(--muted)">
                MCP pack uses the first source; extra paths appear in the CLI
                command and as a note in the MCP prompt.
              </p>
            ) : null}
          </div>

          <label className="block space-y-1">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
              Output path
              <InfoTip label="About output path">
                Where to write the{" "}
                <code className="text-[11px]">.zipwiki</code> package. Use a
                path under <code className="text-[11px]">knowledge/</code> so
                archives stay with your source docs.
              </InfoTip>
            </span>
            <input
              type="text"
              value={state.output}
              onChange={(e) => patch({ output: e.target.value })}
              placeholder="./knowledge/my-docs.zipwiki"
              className="w-full rounded-md border border-(--border) bg-white px-3 py-2 font-mono text-sm"
            />
          </label>
        </div>

        <div className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Options</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <Checkbox
              label="Recurse directories"
              infoLabel="About recurse directories"
              info={
                <>
                  When the source is a folder, include files in subfolders. Off
                  means only files in the top-level directory.
                </>
              }
              checked={state.recurse}
              onChange={(checked) => patch({ recurse: checked })}
            />
            <Checkbox
              label="Omit original documents"
              infoLabel="About omitting originals"
              info={
                <>
                  Keeps parsed text and OKF in the package; leaves out the
                  original PDF/Office bytes to save space. For each omitted
                  file, add an origin link (Extra Field{" "}
                  <code className="text-[11px]">0x014F</code>) so agents can
                  still find or fetch the source — use the Origin link fields
                  below, or CLI{" "}
                  <code className="text-[11px]">--origin-url-template</code> /{" "}
                  <code className="text-[11px]">--origin-pattern</code> /{" "}
                  <code className="text-[11px]">--origin-file</code>. Later:{" "}
                  <code className="text-[11px]">zipwiki origin … --fetch</code>.
                </>
              }
              checked={state.omitOriginal}
              onChange={(checked) => patch({ omitOriginal: checked })}
            />
            <Checkbox
              label="Skip AI OKF — not recommended"
              infoLabel="About skipping AI OKF"
              info={
                <>
                  Skips AI concept cards during pack (
                  <code className="text-[11px]">--no-ai-okf</code>). OKF is much
                  more accurate with AI — leave this off unless you will call{" "}
                  <code className="text-[11px]">okf_enrich</code> yourself after
                  pack.
                </>
              }
              checked={state.noAiOkf}
              disabled={state.noOkf}
              onChange={(checked) => patch({ noAiOkf: checked })}
            />
            <Checkbox
              label="Skip OKF entirely"
              infoLabel="About skipping OKF"
              info={
                <>
                  Writes no OKF tree (
                  <code className="text-[11px]">--no-okf</code>). Search and
                  concept browse will have little or nothing to work with. Prefer
                  AI OKF on during pack.
                </>
              }
              checked={state.noOkf}
              onChange={(checked) => patch({ noOkf: checked })}
            />
            <Checkbox
              label="No OCR"
              infoLabel="About No OCR"
              info={
                <>
                  Disables OCR for scanned pages and images (
                  <code className="text-[11px]">--no-ocr</code>). Use when
                  sources are already digital text and you want a faster pack.
                </>
              }
              checked={state.noOcr}
              onChange={(checked) => patch({ noOcr: checked })}
            />
          </div>

          {state.omitOriginal ? (
            <div className="space-y-3 rounded-lg border border-(--border) bg-(--paper) p-4">
              <div className="flex items-start gap-1.5">
                <h3 className="font-display text-base font-semibold">
                  Origin links for omitted originals
                </h3>
                <InfoTip label="About origin links">
                  When originals are omitted, store a locator on each document
                  (ZIP Extra Field <code className="text-[11px]">0x014F</code>
                  ). Agents use it with{" "}
                  <code className="text-[11px]">origin</code> /{" "}
                  <code className="text-[11px]">--fetch</code> to open or
                  download the real file. Use a URL template (with optional
                  filename pattern), a local{" "}
                  <code className="text-[11px]">file:</code> URI, or both.
                </InfoTip>
              </div>
              <p className="text-xs text-(--muted)">
                Optional but recommended whenever you omit originals — otherwise
                the package has no link back to the source file.
              </p>
              <label className="block space-y-1 text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  Origin URL template
                  <InfoTip label="About origin URL template">
                    URI template for omitted originals, e.g.{" "}
                    <code className="text-[11px]">
                      https://laws.example.org/{"{year}"}/{"{chapter}"}
                    </code>
                    . Named groups from the pattern fill the braces. CLI:{" "}
                    <code className="text-[11px]">--origin-url-template</code>.
                  </InfoTip>
                </span>
                <input
                  type="text"
                  value={state.originUrlTemplate}
                  onChange={(e) =>
                    patch({ originUrlTemplate: e.target.value })
                  }
                  placeholder="https://host/{year}/{chapter}"
                  className="w-full rounded-md border border-(--border) bg-white px-3 py-2 font-mono text-sm"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  Origin filename pattern
                  <InfoTip label="About origin filename pattern">
                    Regex matched against each filename; named groups fill the
                    URL template. Example:{" "}
                    <code className="text-[11px]">
                      {"Ch_(?<year>\\d{4})-(?<chapter>\\d+)"}
                    </code>
                    . CLI:{" "}
                    <code className="text-[11px]">--origin-pattern</code>.
                  </InfoTip>
                </span>
                <input
                  type="text"
                  value={state.originPattern}
                  onChange={(e) => patch({ originPattern: e.target.value })}
                  placeholder={"Ch_(?<year>\\d{4})-(?<chapter>\\d+)"}
                  className="w-full rounded-md border border-(--border) bg-white px-3 py-2 font-mono text-sm"
                />
              </label>
              <Checkbox
                label="Store local file: URI (--origin-file)"
                infoLabel="About origin-file"
                info={
                  <>
                    Writes a <code className="text-[11px]">file:</code> URI for
                    each original’s path on this machine into Extra Field{" "}
                    <code className="text-[11px]">0x014F</code>. Useful when
                    files stay on disk and you do not have a public URL.
                  </>
                }
                checked={state.originFile}
                onChange={(checked) => patch({ originFile: checked })}
              />
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium">
                Compression (CLI)
                <InfoTip label="About compression">
                  ZIP method for members:{" "}
                  <code className="text-[11px]">zstd</code> (default,
                  recommended), <code className="text-[11px]">deflate</code>{" "}
                  (wide compatibility), or{" "}
                  <code className="text-[11px]">store</code> (no compression).
                  Appears in the CLI string; MCP inherits portal pack settings
                  after <code className="text-[11px]">settings pull</code>.
                </InfoTip>
              </span>
              <select
                value={state.compression}
                onChange={(e) =>
                  patch({ compression: e.target.value as CompressionAlg })
                }
                className="w-full rounded-md border border-(--border) bg-white px-3 py-2"
              >
                <option value="zstd">zstd</option>
                <option value="deflate">deflate</option>
                <option value="store">store</option>
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium">
                Level (CLI)
                <InfoTip label="About compression level">
                  Compression effort 0–9 (default 7). Higher is smaller and
                  slower. Level 0 is store-like. CLI-only; MCP uses portal
                  defaults.
                </InfoTip>
              </span>
              <input
                type="number"
                min={0}
                max={9}
                value={state.level}
                onChange={(e) =>
                  patch({
                    level: Math.min(
                      9,
                      Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                    ),
                  })
                }
                className="w-full rounded-md border border-(--border) bg-white px-3 py-2"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium">
                OKF profile
                <InfoTip label="About OKF profile">
                  Hints for AI OKF key facts:{" "}
                  <code className="text-[11px]">auto</code> (default; EPUB →
                  book), <code className="text-[11px]">book</code>,{" "}
                  <code className="text-[11px]">legislation</code>, or{" "}
                  <code className="text-[11px]">invoice</code>. Stored on each
                  document for pack and{" "}
                  <code className="text-[11px]">okf_enrich</code>.
                </InfoTip>
              </span>
              <select
                value={state.okfProfile}
                onChange={(e) =>
                  patch({ okfProfile: e.target.value as OkfProfile })
                }
                className="w-full rounded-md border border-(--border) bg-white px-3 py-2"
              >
                {OKF_PROFILES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Generated commands</h2>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-(--muted)">
              MCP prompt
              <InfoTip label="About MCP prompt">
                Paste into an agent with ZipWiki MCP. It names the pack paths
                and only options that differ from the defaults above.
              </InfoTip>
            </span>
            <CopyButton value={mcpPrompt} label="Copy prompt" />
          </div>
          <pre className="overflow-auto rounded-lg border border-(--border) bg-(--paper) p-3 text-xs leading-relaxed whitespace-pre-wrap text-(--ink)">
            {mcpPrompt}
          </pre>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-(--muted)">
              CLI command
              <InfoTip label="About CLI command">
                Run in a shell where <code className="text-[11px]">zipwiki</code>{" "}
                is installed. Use Prefix{" "}
                <code className="text-[11px]">pnpm zipwiki --</code> only inside
                this monorepo.
              </InfoTip>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-(--muted)">
                Prefix
                <select
                  value={state.cliPrefix}
                  onChange={(e) =>
                    patch({ cliPrefix: e.target.value as CliPrefix })
                  }
                  className="rounded-md border border-(--border) bg-white px-2 py-1 text-xs text-(--ink)"
                >
                  {CLI_PREFIXES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <CopyButton value={cliCommand} label="Copy command" />
            </div>
          </div>
          <pre className="overflow-auto rounded-lg border border-dashed border-(--border) bg-(--paper) p-3 text-xs leading-relaxed whitespace-pre-wrap text-(--muted)">
            {cliCommand}
          </pre>
        </div>
      </section>

      <section className="space-y-3 border-t border-(--border) pt-6">
        <h2 className="font-display text-lg font-semibold">How to run</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-(--ink)">
          <li>
            Install the <code className="text-xs">zipwiki</code> CLI (or enable
            ZipWiki MCP / <code className="text-xs">zipwiki-mcp</code>).
          </li>
          <li>
            Put source documents under a local{" "}
            <code className="text-xs">knowledge/</code> folder (or edit the
            paths above).
          </li>
          <li>Copy the MCP prompt or CLI command into your agent or shell.</li>
          <li>Approve the tool call when asked (MCP).</li>
        </ol>
        <p className="text-xs text-(--muted)">
          AI OKF runs during pack by default so concepts stay accurate. Original
          document bytes are omitted by default — add origin links so omitted
          files stay reachable. CLI{" "}
          <code className="text-xs">zipwiki pack</code> also uses portal
          Settings after <code className="text-xs">settings pull</code>.
        </p>
      </section>
    </div>
  );
}

function Checkbox({
  label,
  info,
  infoLabel,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  info: ReactNode;
  infoLabel: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-2 text-sm ${disabled ? "opacity-50" : ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span className="inline-flex items-start gap-1.5">
        <span>{label}</span>
        <InfoTip label={infoLabel}>{info}</InfoTip>
      </span>
    </label>
  );
}
