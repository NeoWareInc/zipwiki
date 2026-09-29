import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { PromptSection } from "../components/ZipWikiPrompts";
import { QUERY_PROMPTS } from "../lib/create-kb-prompts";
import {
  integritySummary,
  openNzip,
  testArchiveIntegrity,
  zipMethodLabel,
  type IntegrityLine,
  type NzipOpenSummary,
} from "../lib/nzip";

function formatOriginMtime(seconds: number): string {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return String(seconds);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function primaryPath(p: NzipOpenSummary["primaries"][number]): string {
  return (
    (typeof p.path === "string" && p.path) ||
    (typeof p.name === "string" && p.name) ||
    "(unnamed)"
  );
}

function documentOrigin(
  summary: NzipOpenSummary,
  p: NzipOpenSummary["primaries"][number],
) {
  const key = primaryPath(p);
  const matched = summary.origins.find((o) => o.primaryPath === key);
  const uri =
    (typeof p.originUri === "string" && p.originUri) || matched?.originUri;
  const size =
    typeof p.originSize === "number" ? p.originSize : matched?.originSize;
  const mtime =
    typeof p.originMtime === "number" ? p.originMtime : matched?.originMtime;
  const bits: string[] = [];
  if (size !== undefined) bits.push(formatBytes(size));
  if (mtime !== undefined) bits.push(`modified ${formatOriginMtime(mtime)}`);
  return { uri, size, bits };
}

function isOkfTopic(path: string): boolean {
  return /(?:^|\/)topics\//i.test(path);
}

function extractedMarkdownSummary(summary: NzipOpenSummary): string {
  const markdown = summary.parsed.filter((path) =>
    path.toLowerCase().endsWith(".md"),
  ).length;
  const originals = summary.primaries.length;
  return `${markdown} text file${markdown === 1 ? "" : "s"} · ${originals} original${originals === 1 ? "" : "s"}`;
}

function okfCounts(paths: string[]): { concepts: number; topics: number } {
  let concepts = 0;
  let topics = 0;
  for (const path of paths) {
    if (isOkfTopic(path)) topics += 1;
    else concepts += 1;
  }
  return { concepts, topics };
}

function okfConceptSummary(paths: string[]): string {
  const { concepts, topics } = okfCounts(paths);
  return `${concepts} concept${concepts === 1 ? "" : "s"} · ${topics} topic${topics === 1 ? "" : "s"}`;
}

function okfOverview(paths: string[]): string {
  const { concepts, topics } = okfCounts(paths);
  return `yes (${concepts} concept${concepts === 1 ? "" : "s"}/${topics} topic${topics === 1 ? "" : "s"})`;
}

function inputDocumentSummary(summary: NzipOpenSummary): string {
  const count = summary.primaries.length;
  let bytes = 0;
  let sized = 0;
  for (const primary of summary.primaries) {
    const { size } = documentOrigin(summary, primary);
    if (size === undefined) continue;
    bytes += size;
    sized += 1;
  }
  const files = `${count} file${count === 1 ? "" : "s"}`;
  if (sized === 0) return files;
  return `${files} · ${formatBytes(bytes)}`;
}

type PackageSection = "documents" | "okf" | "parsed" | "entries";

export default function KnowledgePage() {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<NzipOpenSummary | null>(null);
  const [opened, setOpened] = useState<PackageSection[]>([]);
  const [integrity, setIntegrity] = useState<IntegrityLine[] | null>(null);
  const [testing, setTesting] = useState(false);
  const archiveRef = useRef<ArrayBuffer | null>(null);
  const reportActivity = useMutation(api.usage.reportActivity);

  const loadFile = useCallback(
    async (file: File) => {
      setError("");
      setLoading(true);
      setSummary(null);
      setOpened([]);
      setIntegrity(null);
      archiveRef.current = null;
      try {
        const buf = await file.arrayBuffer();
        archiveRef.current = buf;
        const opened = await openNzip(buf, file.name);
        setSummary(opened);
        void reportActivity({
          type: "query",
          engine: "web_open",
          filename: file.name,
          bytes: file.size,
          status: "success",
        }).catch(() => {
          /* soft-fail telemetry */
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [reportActivity],
  );

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".zipwiki") && !lower.endsWith(".nzip")) {
      setError("Choose a .zipwiki or .nzip file.");
      return;
    }
    void loadFile(file);
  }

  function clear() {
    setSummary(null);
    setError("");
    setOpened([]);
    setIntegrity(null);
    setTesting(false);
    archiveRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
  }

  async function testIntegrity() {
    const buf = archiveRef.current;
    if (!buf || !summary || testing) return;
    setTesting(true);
    setIntegrity([]);
    try {
      await testArchiveIntegrity(buf, summary.entries, (line) => {
        setIntegrity((current) => [...(current ?? []), line]);
      });
    } finally {
      setTesting(false);
    }
  }

  const sectionLinks: { id: PackageSection; label: string }[] = summary
    ? [
        { id: "documents", label: "Input documents" },
        { id: "okf", label: "OKF concepts" },
        { id: "parsed", label: "Extracted text" },
        { id: "entries", label: "All entries" },
      ]
    : [];

  return (
    <div className="space-y-8">
      {!summary && (
        <>
          <div>
            <h1 className="font-display text-3xl font-semibold">Query ZipWiki</h1>
            <p className="mt-1 text-(--muted)">
              Open a local <code className="text-xs">.zipwiki</code> to inspect the
              package, or copy a query prompt for an agent with ZipWiki MCP.{" "}
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
              Drop a <strong>.zipwiki</strong> or <strong>.nzip</strong> here, or
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
              accept=".zipwiki,.nzip,application/zip"
              className="sr-only"
              disabled={loading}
              onChange={(e) => onFiles(e.target.files)}
            />
            <p className="mt-3 text-xs text-[var(--muted)]">
              Stays in your browser — nothing is uploaded for this preview.
            </p>
          </div>

          <PromptSection title="Query examples" prompts={QUERY_PROMPTS} />
        </>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {summary && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-semibold">
                Package overview
              </h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {summary.filename} · {formatBytes(summary.byteLength)}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void testIntegrity()}
                disabled={testing}
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {testing ? "Testing…" : "Test Integrity"}
              </button>
              <button
                type="button"
                onClick={clear}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--paper)]"
              >
                Close
              </button>
            </div>
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
              label="Documents"
              value={String(summary.primaryCount)}
            />
            <OverviewRow
              label="OKF"
              value={
                summary.okf.present
                  ? okfOverview(summary.okf.concepts)
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

          {integrity && (
            <section>
              <h2 className="font-display text-xl font-semibold">
                Integrity
              </h2>
              <div className="mt-3 rounded-xl border border-[var(--border)] bg-white p-4">
                <ul className="space-y-1 font-mono text-xs">
                  {integrity.map((line) => (
                    <li key={line.name}>
                      testing: {line.name} ...{" "}
                      <span
                        className={
                          line.ok ? "text-green-700" : "text-red-700"
                        }
                      >
                        {line.status}
                      </span>
                    </li>
                  ))}
                </ul>
                {!testing && (
                  <p className="mt-3 text-sm font-medium text-[var(--ink)]">
                    {integritySummary(integrity)}
                  </p>
                )}
              </div>
            </section>
          )}

          {opened.map((id) => (
            <SectionBody key={id} summary={summary} section={id} />
          ))}

          {sectionLinks.some((link) => !opened.includes(link.id)) && (
            <>
              <p className="text-sm text-[var(--muted)]">
                To show more details click a link below.
              </p>
              <nav aria-label="Package sections" className="flex flex-col gap-2">
                {sectionLinks
                  .filter((link) => !opened.includes(link.id))
                  .map((link) => (
                    <button
                      key={link.id}
                      type="button"
                      onClick={() =>
                        setOpened((current) =>
                          current.includes(link.id) ? current : [...current, link.id],
                        )
                      }
                      className="text-left text-sm font-medium text-[var(--accent)] hover:underline"
                    >
                      {link.label}
                    </button>
                  ))}
              </nav>
            </>
          )}
        </>
      )}
    </div>
  );
}

function SectionBody({
  summary,
  section,
}: {
  summary: NzipOpenSummary;
  section: PackageSection;
}) {
  if (section === "documents") {
    return (
      <ContentsSection
        title="Input documents"
        subtitle={inputDocumentSummary(summary)}
      >
        {summary.primaries.length === 0 ? (
          <Empty>No input documents listed in the manifest.</Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {summary.primaries.map((p, i) => {
              const path = primaryPath(p);
              const origin = documentOrigin(summary, p);
              return (
                <li key={`${path}-${i}`} className="font-mono text-xs">
                  {path}
                  {origin.uri ? `: ${origin.uri}` : ""}
                  {origin.bits.length > 0 ? (
                    <span className="text-[var(--muted)]">
                      {" "}
                      ({origin.bits.join(", ")})
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </ContentsSection>
    );
  }
  if (section === "okf") {
    return (
      <ContentsSection
        title="OKF concepts"
        subtitle={okfConceptSummary(summary.okf.concepts)}
      >
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
    );
  }
  if (section === "parsed") {
    return (
      <ContentsSection
        title="Extracted text"
        subtitle={extractedMarkdownSummary(summary)}
      >
        {summary.parsed.length === 0 ? (
          <Empty>No extracted text in this package.</Empty>
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
    );
  }
  return (
    <ContentsSection title="All entries">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-xs">
          <thead className="border-b border-[var(--border)] text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Path</th>
              <th className="px-3 py-2 font-medium">Method</th>
              <th className="px-3 py-2 font-medium">Size</th>
              <th className="px-3 py-2 font-medium">Stored</th>
            </tr>
          </thead>
          <tbody>
            {summary.entries.map((e) => (
              <tr key={e.name} className="border-b border-[var(--border)] last:border-0">
                <td className="max-w-md truncate px-3 py-1.5 font-mono">{e.name}</td>
                <td className="px-3 py-1.5">{zipMethodLabel(e.method)}</td>
                <td className="px-3 py-1.5 tabular-nums">{e.uncompressedSize}</td>
                <td className="px-3 py-1.5 tabular-nums">{e.compressedSize}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ContentsSection>
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
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {subtitle ? (
        <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
      ) : null}
      <div className="mt-3 rounded-xl border border-[var(--border)] bg-white p-4">
        {children}
      </div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-[var(--muted)]">{children}</p>;
}
