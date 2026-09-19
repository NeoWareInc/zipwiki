import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  openNzip,
  zipMethodLabel,
  type NzipOpenSummary,
} from "../lib/nzip";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function primaryLabel(p: {
  path?: string;
  name?: string;
  originUri?: unknown;
}): string {
  const base =
    (typeof p.path === "string" && p.path) ||
    (typeof p.name === "string" && p.name) ||
    "(unnamed)";
  if (typeof p.originUri === "string" && p.originUri) {
    return `${base} → ${p.originUri}`;
  }
  return base;
}

export default function KnowledgePage() {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<NzipOpenSummary | null>(null);
  const [showAll, setShowAll] = useState(false);

  const loadFile = useCallback(async (file: File) => {
    setError("");
    setLoading(true);
    setSummary(null);
    setShowAll(false);
    try {
      const buf = await file.arrayBuffer();
      const opened = await openNzip(buf, file.name);
      setSummary(opened);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    void loadFile(file);
  }

  function clear() {
    setSummary(null);
    setError("");
    setShowAll(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Knowledge</h1>
        <p className="mt-1 text-(--muted)">
          Open a local <code className="text-xs">.nzip</code> to inspect the
          package and contents. AI query comes next.{" "}
          <Link
            to="/dashboard/knowledge/create"
            className="text-(--accent) hover:underline"
          >
            Don&apos;t have a package yet? Create ZipWiki
          </Link>
        </p>
      </div>

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? "border-[var(--accent)] bg-[var(--paper-deep)]"
            : "border-[var(--border)] bg-white"
        }`}
      >
        <p className="text-sm text-[var(--ink)]">
          Drop a <strong>.nzip</strong> here, or
        </p>
        <label
          htmlFor={inputId}
          className="mt-3 inline-block cursor-pointer rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
        >
          {loading ? "Opening…" : "Choose file"}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".nzip,.zip,application/zip"
          className="sr-only"
          disabled={loading}
          onChange={(e) => onFiles(e.target.files)}
        />
        <p className="mt-3 text-xs text-[var(--muted)]">
          Stays in your browser — nothing is uploaded for this preview.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {summary && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">
                Package overview
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {summary.filename} · {formatBytes(summary.byteLength)}
              </p>
            </div>
            <button
              type="button"
              onClick={clear}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--paper)]"
            >
              Clear
            </button>
          </div>

          <dl className="grid gap-3 rounded-xl border border-[var(--border)] bg-white p-5 text-sm sm:grid-cols-2">
            <OverviewRow
              label="Spec"
              value={
                summary.specVersion != null
                  ? String(summary.specVersion)
                  : "—"
              }
            />
            <OverviewRow
              label="Format"
              value={summary.format != null ? String(summary.format) : "—"}
            />
            <OverviewRow label="AI root" value={summary.aiRoot} />
            <OverviewRow
              label="Primaries"
              value={String(summary.primaryCount)}
            />
            <OverviewRow
              label="OKF"
              value={
                summary.okf.present
                  ? `yes (${summary.okf.concepts.length} concepts)`
                  : "no"
              }
            />
            <OverviewRow
              label="Parsed files"
              value={String(summary.parsed.length)}
            />
            <OverviewRow
              label="Entries"
              value={String(summary.entryCount)}
            />
            <OverviewRow
              label="Compression"
              value={summary.methods.join(", ") || "—"}
            />
          </dl>

          <ContentsSection title="Primaries">
            {summary.primaries.length === 0 ? (
              <Empty>No primaries listed in the manifest.</Empty>
            ) : (
              <ul className="space-y-1 text-sm">
                {summary.primaries.map((p, i) => (
                  <li key={`${primaryLabel(p)}-${i}`} className="font-mono text-xs">
                    {primaryLabel(p)}
                  </li>
                ))}
              </ul>
            )}
          </ContentsSection>

          {summary.origins.length > 0 && (
            <ContentsSection title="Original locators (0x014F)">
              <ul className="space-y-1 text-sm">
                {summary.origins.map((o) => {
                  const bits: string[] = [];
                  if (o.originCrc32 !== undefined) {
                    bits.push(`crc ${o.originCrc32}`);
                  }
                  if (o.originSize !== undefined) {
                    bits.push(`${o.originSize} bytes`);
                  }
                  if (o.originMtime !== undefined) {
                    bits.push(
                      `mtime ${o.originMtime}${
                        o.originMtimeUtc ? ` (${o.originMtimeUtc})` : ""
                      }`,
                    );
                  }
                  if (o.originSha256) {
                    bits.push(`sha256 ${o.originSha256}`);
                  }
                  return (
                    <li key={o.parsedPath} className="font-mono text-xs">
                      {o.primaryPath ?? o.parsedPath}
                      {o.originUri ? `: ${o.originUri}` : ""}
                      {bits.length > 0 ? (
                        <span className="text-[var(--muted)]">
                          {" "}
                          ({bits.join(", ")})
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </ContentsSection>
          )}

          <ContentsSection title="OKF concepts">
            {summary.okf.concepts.length === 0 ? (
              <Empty>No OKF concept files under wiki/okf/.</Empty>
            ) : (
              <ul className="space-y-1 text-sm">
                {summary.okf.concepts.map((c) => (
                  <li key={c} className="font-mono text-xs">
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </ContentsSection>

          <ContentsSection title="Parsed wiki">
            {summary.parsed.length === 0 ? (
              <Empty>No files under wiki/parsed/.</Empty>
            ) : (
              <ul className="space-y-1 text-sm">
                {summary.parsed.map((c) => (
                  <li key={c} className="font-mono text-xs">
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </ContentsSection>

          <div>
            <button
              type="button"
              className="text-sm text-[var(--accent)] underline"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? "Hide" : "Show"} all entries
            </button>
            {showAll && (
              <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
                <table className="w-full min-w-[36rem] text-left text-xs">
                  <thead className="border-b border-[var(--border)] bg-[var(--paper)] text-[var(--muted)]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Path</th>
                      <th className="px-3 py-2 font-medium">Method</th>
                      <th className="px-3 py-2 font-medium">Size</th>
                      <th className="px-3 py-2 font-medium">Stored</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.entries.map((e) => (
                      <tr
                        key={e.name}
                        className="border-b border-[var(--border)] last:border-0"
                      >
                        <td className="max-w-md truncate px-3 py-1.5 font-mono">
                          {e.name}
                        </td>
                        <td className="px-3 py-1.5">
                          {zipMethodLabel(e.method)}
                        </td>
                        <td className="px-3 py-1.5 tabular-nums">
                          {e.uncompressedSize}
                        </td>
                        <td className="px-3 py-1.5 tabular-nums">
                          {e.compressedSize}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--paper)] p-5 opacity-80">
        <h2 className="font-display text-lg font-semibold text-[var(--ink)]">
          Ask (coming soon)
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          AI query over this package will land here — search OKF and parsed
          wiki without unpacking the whole archive.
        </p>
        <input
          type="text"
          disabled
          placeholder="Ask a question about this knowledge base…"
          className="mt-4 w-full cursor-not-allowed rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--muted)]"
        />
      </section>
    </div>
  );
}

function OverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="mt-0.5 font-medium text-[var(--ink)]">{value}</dd>
    </div>
  );
}

function ContentsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="mt-3 rounded-xl border border-[var(--border)] bg-white p-4">
        {children}
      </div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-[var(--muted)]">{children}</p>;
}
