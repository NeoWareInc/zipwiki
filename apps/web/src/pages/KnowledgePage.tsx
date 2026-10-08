import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { IntegrityDialog } from "../components/IntegrityDialog";
import { MarkdownViewDialog } from "../components/MarkdownViewDialog";
import { PromptSection } from "../components/ZipWikiPrompts";
import { QUERY_PROMPTS } from "../lib/create-kb-prompts";
import {
  openNzip,
  formatFollowWindow,
  formatPhraseHits,
  originLink,
  queryPackage,
  readPackageFollow,
  searchPackagePhrase,
  readZipEntryPayload,
  testArchiveIntegrity,
  zipMethodLabel,
  type IntegrityLine,
  type NzipOpenSummary,
  type PackageQuery,
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

function isMarkdownPath(path: string): boolean {
  return path.replace(/\\/g, "/").toLowerCase().endsWith(".md");
}

/** Markdown and the package manifest — openable in the extraction viewer. */
function isViewablePackagePath(path: string): boolean {
  const name = path.replace(/\\/g, "/").toLowerCase();
  return name.endsWith(".md") || name === "meta-inf/manifest.json";
}

type AnswerPiece = { kind: "text"; text: string } | { kind: "path"; path: string };

/** Turn archive paths in an answer into pieces, including **path** and `path`. */
function splitAnswerLinks(text: string, paths: string[]): AnswerPiece[] {
  const known = [...new Set(paths.filter((path) => path.length > 0))].sort(
    (a, b) => b.length - a.length,
  );
  if (known.length === 0) return [{ kind: "text", text }];
  const pieces: AnswerPiece[] = [];
  let rest = text;
  while (rest.length > 0) {
    let best: { index: number; path: string; raw: string } | null = null;
    for (const path of known) {
      for (const raw of [`**${path}**`, `\`${path}\``, path]) {
        const index = rest.indexOf(raw);
        if (index < 0) continue;
        if (
          !best ||
          index < best.index ||
          (index === best.index && raw.length > best.raw.length)
        ) {
          best = { index, path, raw };
        }
      }
    }
    if (!best) {
      pieces.push({ kind: "text", text: rest });
      break;
    }
    if (best.index > 0) pieces.push({ kind: "text", text: rest.slice(0, best.index) });
    pieces.push({ kind: "path", path: best.path });
    rest = rest.slice(best.index + best.raw.length);
  }
  return pieces;
}

function AnswerText({
  text,
  paths,
  onOpen,
}: {
  text: string;
  paths: string[];
  onOpen: (path: string) => void;
}) {
  const pieces = splitAnswerLinks(text, paths);
  return (
    <p className="whitespace-pre-wrap text-sm text-(--ink)">
      {pieces.map((piece, index) =>
        piece.kind === "path" ? (
          <button
            key={`${piece.path}-${index}`}
            type="button"
            onClick={() => onOpen(piece.path)}
            className="link-package font-mono"
          >
            {piece.path}
          </button>
        ) : (
          <AnswerInline key={index} text={piece.text} />
        ),
      )}
    </p>
  );
}

function AnswerInline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) => {
        const bold = part.startsWith("**") && part.endsWith("**") && part.length > 4;
        return (
          <AnswerUrls key={index} text={bold ? part.slice(2, -2) : part} bold={bold} />
        );
      })}
    </>
  );
}

function AnswerUrls({ text, bold }: { text: string; bold: boolean }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (!part.startsWith("http://") && !part.startsWith("https://")) {
          return bold ? <strong key={index}>{part}</strong> : <span key={index}>{part}</span>;
        }
        const href = part.replace(/[),.;]+$/, "");
        const tail = part.slice(href.length);
        return (
          <span key={index}>
            <a href={href} target="_blank" rel="noreferrer" className="link-origin">
              {href}
            </a>
            {tail}
          </span>
        );
      })}
    </>
  );
}

type AskSource = { path: string; kind: "parsed" | "okf" | "original" };

function sourceKind(path: string): AskSource["kind"] {
  if (path.startsWith("wiki/okf/")) return "okf";
  if (path.startsWith("wiki/parsed/")) return "parsed";
  return "original";
}

function collapsePriorReads(
  transcript: Array<
    | { role: "assistant"; content: unknown[] }
    | {
        role: "user";
        results: Array<{ id: string; path: string; text?: string; error?: string }>;
      }
  >,
): void {
  for (const turn of transcript) {
    if (turn.role !== "user") continue;
    for (const result of turn.results) {
      if (!result.text) continue;
      const lines = result.text.split("\n");
      if (
        lines[0]?.startsWith("offset ") &&
        lines[1]?.startsWith("next ") &&
        lines[2]?.startsWith("total ")
      ) {
        result.text = lines.slice(0, 3).join("\n");
      }
    }
  }
}

function rememberSource(current: AskSource[], path: string): AskSource[] {
  if (!path || current.some((item) => item.path === path)) return current;
  return [...current, { path, kind: sourceKind(path) }];
}

function primaryFromParsed(path: string): string | null {
  const prefix = "wiki/parsed/";
  if (!path.startsWith(prefix) || !path.endsWith(".md") || path.includes(".assets/")) {
    return null;
  }
  return path.slice(prefix.length, -".md".length);
}

function primaryPath(p: NzipOpenSummary["primaries"][number]): string {
  return (
    (typeof p.path === "string" && p.path) ||
    (typeof p.name === "string" && p.name) ||
    "(unnamed)"
  );
}

/**
 * Size / mtime for an input document. Manifest `origin.size` / `origin.mtime`
 * win. Otherwise the original bytes stored in the archive, then Extra Field
 * 0x014F on the parse.
 */
function documentOrigin(
  summary: NzipOpenSummary,
  p: NzipOpenSummary["primaries"][number],
) {
  const key = primaryPath(p);
  const matched = summary.origins.find((o) => o.primaryPath === key);
  const uri =
    (typeof p.originUri === "string" && p.originUri) || matched?.originUri;
  const stored = listedEntry(summary, key);
  const manifestSize =
    typeof p.originSize === "number" ? p.originSize : matched?.originSize;
  const manifestMtime =
    typeof p.originMtime === "number" ? p.originMtime : matched?.originMtime;

  const size =
    manifestSize ??
    (stored ? stored.uncompressedSize : undefined);
  const mtime =
    manifestMtime ??
    (stored
      ? typeof stored.originMtime === "number"
        ? stored.originMtime
        : stored.mtimeSeconds > 0
          ? stored.mtimeSeconds
          : undefined
      : undefined);

  const bits: string[] = [];
  if (size !== undefined) bits.push(formatBytes(size));
  if (mtime !== undefined) bits.push(`modified ${formatOriginMtime(mtime)}`);
  return { uri, size, mtime, bits, storedInArchive: Boolean(stored) };
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
    if (typeof size !== "number") continue;
    bytes += size;
    sized += 1;
  }
  const files = `${count} file${count === 1 ? "" : "s"}`;
  if (sized === 0) return files;
  return `${files} · ${formatBytes(bytes)}`;
}

function compressionSaved(compressed: number, uncompressed: number): string {
  if (uncompressed <= 0) return "0%";
  const saved = Math.max(0, (1 - compressed / uncompressed) * 100);
  if (saved > 90) {
    const tenths = Math.round(saved * 10) / 10;
    return `${tenths.toFixed(1)}%`;
  }
  return `${Math.round(saved)}%`;
}

function listedEntry(summary: NzipOpenSummary, path: string) {
  const key = path.replace(/\\/g, "/").replace(/^\/+/, "");
  return summary.entries.find((entry) => entry.name === key) ?? null;
}

function archiveSizeLine(summary: NzipOpenSummary): string {
  let compressed = 0;
  let uncompressed = 0;
  for (const entry of summary.entries) {
    compressed += entry.compressedSize;
    uncompressed += entry.uncompressedSize;
  }
  return `${formatBytes(compressed)} compressed / ${formatBytes(uncompressed)} · ${compressionSaved(compressed, uncompressed)}`;
}

function originalByteTotal(summary: NzipOpenSummary): number | null {
  if (typeof summary.originalBytes === "number") return summary.originalBytes;
  let bytes = 0;
  let sized = 0;
  for (const primary of summary.primaries) {
    const { size } = documentOrigin(summary, primary);
    if (typeof size !== "number") continue;
    bytes += size;
    sized += 1;
  }
  return sized > 0 ? bytes : null;
}

type OriginalPlacement = "included" | "linked" | "omitted";

function originalPlacement(
  summary: NzipOpenSummary,
  primary: NzipOpenSummary["primaries"][number],
): OriginalPlacement {
  const { uri, storedInArchive } = documentOrigin(summary, primary);
  if (storedInArchive) return "included";
  if (uri) return "linked";
  return "omitted";
}

function originalPlacementPhrase(summary: NzipOpenSummary): string {
  let included = 0;
  let linked = 0;
  let omitted = 0;
  for (const primary of summary.primaries) {
    const placement = originalPlacement(summary, primary);
    if (placement === "included") included += 1;
    else if (placement === "linked") linked += 1;
    else omitted += 1;
  }
  const total = included + linked + omitted;
  if (total === 0) return "not included";
  if (included === total) return "included in archive";
  if (linked === total) return "linked to originals";
  if (omitted === total) return "not included";
  const parts: string[] = [];
  if (included > 0) parts.push(`${included} included in archive`);
  if (linked > 0) parts.push(`${linked} linked to originals`);
  if (omitted > 0) parts.push(`${omitted} not included`);
  return parts.join(", ");
}

function inputDocumentsLine(summary: NzipOpenSummary): string {
  const count = summary.primaryCount || summary.primaries.length;
  const files = `${count} input document${count === 1 ? "" : "s"}`;
  const placement = originalPlacementPhrase(summary);
  const total = originalByteTotal(summary);
  if (total == null) return `${files} · ${placement}`;
  const size = formatBytes(total);
  if (summary.byteLength < total) {
    return `${files} · ${size} · ${placement} · ${compressionSaved(summary.byteLength, total)} compressed`;
  }
  return `${files} · ${size} · ${placement}`;
}

function documentSizeLine(summary: NzipOpenSummary): string {
  const original = originalByteTotal(summary) ?? 0;

  let parsedCompressed = 0;
  for (const path of summary.parsed) {
    const entry = listedEntry(summary, path);
    if (!entry) continue;
    parsedCompressed += entry.compressedSize;
  }

  return `${formatBytes(original)} originals / ${formatBytes(parsedCompressed)} extracted compressed text · ${compressionSaved(parsedCompressed, original)}`;
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
  const [integrityOpen, setIntegrityOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState<"searching" | "answering" | "reading" | null>(null);
  const [askError, setAskError] = useState("");
  const [packageQuery, setPackageQuery] = useState<PackageQuery | null>(null);
  const [answer, setAnswer] = useState<{
    text: string;
    reads: string[];
    creditsCharged: number;
    creditsRemaining: number;
    creditsUnlimited: boolean;
  } | null>(null);
  const [followPath, setFollowPath] = useState("");
  const [followKind, setFollowKind] = useState<"read" | "search" | "origin" | null>(null);
  const [askSources, setAskSources] = useState<AskSource[]>([]);
  const archiveRef = useRef<ArrayBuffer | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const reportActivity = useMutation(api.usage.reportActivity);
  const reportQueryAnomaly = useMutation(api.usage.reportQueryAnomaly);
  const ask = useAction(api.queryAnswer.ask);
  const usage = useQuery(api.usage.myUsage);
  const creditsLocked = usage?.creditsLocked === true;
  const outOfCredits =
    usage != null &&
    !creditsLocked &&
    usage.creditsUnlimited !== true &&
    usage.creditsRemaining < 1;

  const loadFile = useCallback(
    async (file: File) => {
      setError("");
      setLoading(true);
      setSummary(null);
      setOpened([]);
      setIntegrity(null);
      setIntegrityOpen(false);
      setQuestion("");
      setAsking(null);
      setAskError("");
      setPackageQuery(null);
      setAnswer(null);
      setFollowPath("");
      setFollowKind(null);
      setAskSources([]);
      setViewing(null);
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
    setIntegrityOpen(false);
    setTesting(false);
    setQuestion("");
    setAsking(null);
    setAskError("");
    setPackageQuery(null);
    setAnswer(null);
    setFollowPath("");
    setFollowKind(null);
    setAskSources([]);
    setViewing(null);
    archiveRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
  }

  async function testIntegrity() {
    const buf = archiveRef.current;
    if (!buf || !summary || testing) return;
    setTesting(true);
    setIntegrityOpen(true);
    setIntegrity([]);
    try {
      await testArchiveIntegrity(buf, summary.entries, (line) => {
        setIntegrity((current) => [...(current ?? []), line]);
      });
    } finally {
      setTesting(false);
    }
  }

  function entryNamed(path: string) {
    const key = path.replace(/\\/g, "/").replace(/^\/+/, "");
    return summary?.entries.find((entry) => entry.name === key) ?? null;
  }

  async function downloadEntry(entryName: string) {
    const buf = archiveRef.current;
    const entry = entryNamed(entryName);
    if (!buf || !entry) return;
    try {
      const data = await readZipEntryPayload(buf, entry);
      const bytes = new Uint8Array(data.byteLength);
      bytes.set(data);
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = entryName.split("/").pop() || entryName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function clearAsk() {
    if (asking) return;
    setQuestion("");
    setAskError("");
    setPackageQuery(null);
    setAnswer(null);
    setFollowPath("");
    setFollowKind(null);
    setAskSources([]);
  }

  async function askPackage() {
    const buf = archiveRef.current;
    const q = question.trim();
    if (!buf || !summary || !q || asking || outOfCredits || creditsLocked) return;
    setAskError("");
    setAnswer(null);
    setPackageQuery(null);
    setFollowPath("");
    setFollowKind(null);
    setAskSources([]);
    setAsking("searching");
    try {
      const found = await queryPackage(buf, summary.entries, q);
      setPackageQuery(found);
      let sources: AskSource[] = [];
      for (const passage of found.passages) {
        sources = rememberSource(sources, passage.path);
      }
      setAskSources(sources);
      if (found.excerpts.length === 0 && found.passages.length === 0) {
        const askId = crypto.randomUUID();
        void reportQueryAnomaly({
          engine: "query_no_excerpts",
          createId: askId,
          filename: summary.filename,
          pages: found.hits.length,
        });
        setAskError("No matching text was found in this package for that question.");
        return;
      }
      // Deep parsed windows first so section hits (e.g. Termination) are not
      // buried behind OKF intro cards that only cover early sections.
      const excerpts: Array<{
        path: string;
        title?: string;
        kind: "okf" | "parsed" | "gap";
        text: string;
        documents?: string[];
      }> = [];
      for (const passage of found.passages) {
        if (excerpts.length >= 9) break;
        excerpts.push({
          path: passage.path,
          kind: "parsed",
          text: passage.text,
        });
      }
      for (const excerpt of found.excerpts) {
        if (excerpts.length >= 9) break;
        excerpts.push({
          path: excerpt.path,
          title: excerpt.title,
          kind: excerpt.kind,
          text: excerpt.text,
          ...(excerpt.documents?.length ? { documents: excerpt.documents } : {}),
        });
      }
      for (const gap of found.gaps) {
        if (excerpts.length >= 9) break;
        excerpts.push({
          path: gap.path,
          kind: "gap",
          text: gap.originUri
            ? `${gap.reason} Original: ${gap.originUri}`
            : gap.reason,
        });
      }
      const askId = crypto.randomUUID();
      let answered = false;
      let transcript: Array<
        | { role: "assistant"; content: unknown[] }
        | {
            role: "user";
            results: Array<{ id: string; path: string; text?: string; error?: string }>;
          }
      > = [];
      let charged = 0;
      let remaining = 0;
      let unlimited = false;
      const followReads: string[] = [];
      try {
        for (let round = 0; round < 5; round += 1) {
          const finish = round === 4;
          setFollowKind(null);
          setAsking(finish || round === 0 ? "answering" : "reading");
          const result = await ask({
            question: q,
            filename: summary.filename,
            excerpts,
            askId,
            round,
            ...(transcript.length > 0
              ? { transcript: JSON.stringify(transcript) }
              : {}),
            ...(finish ? { finish: true } : {}),
          });
          charged += result.creditsCharged;
          remaining = result.creditsRemaining;
          unlimited = result.creditsUnlimited;
          const reads = Array.isArray(result.reads) ? result.reads : [];
          const read = reads[0];
          const phrase = result.search;
          if (!finish && result.status === "search" && phrase) {
            setFollowKind("search");
            setFollowPath(phrase.phrase);
            setAsking("reading");
            const hits = await searchPackagePhrase(buf, summary.entries, phrase.phrase);
            if (hits.length === 0) {
              void reportQueryAnomaly({
                engine: "query_no_phrase_hits",
                createId: askId,
                filename: summary.filename,
              });
            }
            for (const hit of hits) sources = rememberSource(sources, hit.path);
            setAskSources(sources);
            const assistant = JSON.parse(result.assistant || "[]") as unknown[];
            collapsePriorReads(transcript);
            transcript = [
              ...transcript,
              { role: "assistant", content: assistant },
              {
                role: "user",
                results: [
                  {
                    id: phrase.id,
                    path: "search",
                    text: formatPhraseHits(phrase.phrase, hits),
                  },
                ],
              },
            ];
            continue;
          }
          const origin = result.origin;
          if (!finish && result.status === "origin" && origin) {
            setFollowKind("origin");
            setFollowPath(origin.path);
            setAsking("reading");
            const link = originLink(summary.entries, origin.path);
            sources = rememberSource(sources, origin.path);
            setAskSources(sources);
            const assistant = JSON.parse(result.assistant || "[]") as unknown[];
            collapsePriorReads(transcript);
            transcript = [
              ...transcript,
              { role: "assistant", content: assistant },
              {
                role: "user",
                results: [
                  {
                    id: origin.id,
                    path: origin.path,
                    text: link ?? `No origin link for ${origin.path}`,
                  },
                ],
              },
            ];
            continue;
          }
          if (!finish && result.status === "read" && read) {
            const offset =
              typeof read.offset === "number" && read.offset > 0
                ? Math.floor(read.offset)
                : 0;
            setFollowKind("read");
            setFollowPath(offset > 0 ? `${read.path} at ${offset}` : read.path);
            setAsking("reading");
            const loaded = await readPackageFollow(
              buf,
              summary.entries,
              read.path,
              offset,
            );
            if ("error" in loaded) {
              void reportQueryAnomaly({
                engine: "query_follow_fail",
                createId: askId,
                filename: summary.filename,
              });
            }
            followReads.push(read.path);
            sources = rememberSource(sources, read.path);
            setAskSources(sources);
            const assistant = JSON.parse(result.assistant || "[]") as unknown[];
            collapsePriorReads(transcript);
            transcript = [
              ...transcript,
              { role: "assistant", content: assistant },
              {
                role: "user",
                results: [
                  {
                    id: read.id,
                    path: read.path,
                    ...("error" in loaded
                      ? { error: loaded.error }
                      : { text: formatFollowWindow(loaded) }),
                  },
                ],
              },
            ];
            continue;
          }
          const answerText = (result.answer ?? "").trim();
          // Safety net: never show "Let me search…" as the final answer.
          if (
            /^(let me|i('ll| will)|trying)\b/i.test(answerText) ||
            (answerText.length < 280 && /[:…]\s*$/.test(answerText))
          ) {
            void reportQueryAnomaly({
              engine: "query_client_reject",
              createId: askId,
              filename: summary.filename,
              pages: round,
            });
            throw new Error("incomplete answer");
          }
          setAnswer({
            text: answerText,
            reads: followReads,
            creditsCharged: charged,
            creditsRemaining: remaining,
            creditsUnlimited: unlimited,
          });
          answered = true;
          return;
        }
      } finally {
        if (!answered) {
          void reportQueryAnomaly({
            engine: "query_session_no_answer",
            createId: askId,
            filename: summary.filename,
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/credits_locked/.test(message)) {
        setAskError("ZipWiki credits are locked for this account.");
      } else if (/account_disabled/.test(message)) {
        setAskError("This account is disabled.");
      } else if (/credits_exhausted/.test(message)) {
        setAskError("Credits are required to ask a question.");
      } else if (/anthropic_not_configured/.test(message)) {
        setAskError("Hosted answers are not configured on this deployment.");
      } else if (/incomplete answer|without calling a tool/i.test(message)) {
        setAskError(
          "The answer stopped mid-search. Try asking again with a shorter phrase from the document (for example “termination”).",
        );
      } else {
        setAskError(message);
      }
    } finally {
      setAsking(null);
    }
  }

  const sectionLinks: { id: PackageSection; label: string }[] = summary
    ? [
        { id: "documents", label: "Input documents" },
        { id: "okf", label: "Open Knowledge Format (OKF) concepts" },
        { id: "parsed", label: "Extracted text" },
        { id: "entries", label: "All entries" },
      ]
    : [];

  const viewingEntry = viewing ? entryNamed(viewing) : null;
  const openArchive = archiveRef.current;

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
            <p className="mt-3 text-sm text-(--muted)">
              Open Knowledge Format (OKF) is the short, structured index inside
              the archive — one concept card per document (title, type, tags,
              summary) plus topic pages — so agents can search and skim before
              opening full extracted text.
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
                ? "border-(--accent) bg-(--paper-deep)"
                : "border-(--border) bg-white"
            }`}
          >
            <p className="text-sm text-(--ink)">
              Drop a <strong>.zipwiki</strong> or <strong>.nzip</strong> here, or
            </p>
            <label
              htmlFor={inputId}
              className="mt-3 inline-block cursor-pointer rounded-md bg-(--accent) px-4 py-2 text-sm font-semibold text-white"
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
            <p className="mt-3 text-xs text-(--muted)">
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
              <p className="mt-1 text-sm text-(--muted)">
                {summary.filename} · {formatBytes(summary.byteLength)}
              </p>
              <p className="text-sm text-(--muted)">
                {inputDocumentsLine(summary)}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void testIntegrity()}
                disabled={testing}
                className="rounded-md bg-(--accent) px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {testing ? "Testing…" : "Test Integrity"}
              </button>
              <button
                type="button"
                onClick={clear}
                className="rounded-md border border-(--border) px-3 py-1.5 text-sm hover:bg-(--paper)"
              >
                Close
              </button>
            </div>
          </div>

          <dl className="grid gap-3 rounded-xl border border-(--border) bg-white p-5 text-sm sm:grid-cols-2">
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
              label="Original documents"
              value={`${summary.primaryCount} · ${originalPlacementPhrase(summary)}`}
            />
            <OverviewRow
              label="Open Knowledge Format (OKF)"
              value={
                summary.okf.present
                  ? okfOverview(summary.okf.concepts)
                  : "no"
              }
            />
            <OverviewRow
              label="Extracted text files"
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

          <section>
            <h2 className="font-display text-xl font-semibold">Ask this package</h2>
            <p className="mt-1 text-sm text-(--muted)">
              The archive stays in your browser. Matching concepts are read
              locally, including cited text, then sent to answer the question.
              A file with no extract stored at pack time cannot be read.
            </p>
            <form
              className="mt-3 flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                void askPackage();
              }}
            >
              <input
                type="text"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask about the concepts in this package"
                className="min-w-0 flex-1 rounded-md border border-(--border) bg-white px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={
                  asking !== null || !question.trim() || outOfCredits || creditsLocked
                }
                className="rounded-md bg-(--accent) px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {asking === "searching" || (asking === "reading" && followKind === "search")
                  ? "Searching…"
                  : asking === "reading" && followKind === "origin"
                    ? "Origin…"
                    : asking === "reading"
                      ? "Reading…"
                      : asking === "answering"
                        ? "Answering…"
                        : "Ask"}
              </button>
              <button
                type="button"
                onClick={clearAsk}
                disabled={
                  asking !== null ||
                  (!question && !answer && !packageQuery && !askError)
                }
                className="rounded-md border border-(--border) bg-white px-4 py-2 text-sm font-semibold text-(--ink) disabled:opacity-60"
              >
                Clear
              </button>
            </form>
            {creditsLocked && (
              <p className="mt-2 text-sm text-(--ink)">
                ZipWiki credits are locked for this account.
              </p>
            )}
            {outOfCredits && (
              <p className="mt-2 text-sm text-(--ink)">
                Credits are required to ask a question.{" "}
                <Link to="/dashboard/billing" className="text-(--accent) hover:underline">
                  Buy credits
                </Link>
              </p>
            )}
            {asking && (
              <p className="mt-2 text-sm text-(--muted)">
                {asking === "searching"
                  ? "Searching the package…"
                  : asking === "reading" && followKind === "search"
                    ? `Searching for ${followPath}…`
                    : asking === "reading" && followKind === "origin"
                      ? `Origin of ${followPath}…`
                      : asking === "reading"
                        ? `Reading ${followPath}…`
                        : "Answering from the package…"}
              </p>
            )}
            {askError && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {askError}
              </p>
            )}
            {packageQuery && packageQuery.hits.length === 0 && !asking && (
              <p className="mt-3 text-sm text-(--ink)">
                No concept matched this question.
              </p>
            )}
            {answer && (
              <div className="mt-4 rounded-xl border border-(--border) bg-white p-4">
                <AnswerText
                  text={answer.text}
                  paths={(summary?.entries ?? [])
                    .map((entry) => entry.name)
                    .filter(isMarkdownPath)}
                  onOpen={setViewing}
                />
                <p className="mt-3 text-sm font-medium text-(--ink)">
                  {answer.creditsUnlimited
                    ? "Unlimited · no charge"
                    : `Charged ${answer.creditsCharged} credit${answer.creditsCharged === 1 ? "" : "s"} · ${answer.creditsRemaining.toLocaleString()} remaining`}
                </p>
                {answer.reads.length > 0 && (
                  <p className="mt-2 text-sm text-(--muted)">
                    Also read{" "}
                    {answer.reads.map((path, index) => (
                      <span key={path}>
                        {index > 0 ? ", " : null}
                        {entryNamed(path) && isMarkdownPath(path) ? (
                          <PackageFileLink path={path} onOpen={() => setViewing(path)} />
                        ) : (
                          <span className="font-mono">{path}</span>
                        )}
                      </span>
                    ))}
                  </p>
                )}
                {summary && askSources.length > 0 && (
                  <ul className="mt-3 space-y-2 text-sm">
                    {askSources.map((source) => (
                      <AskSourceRow
                        key={source.path}
                        source={source}
                        summary={summary}
                        stored={entryNamed(source.path) != null}
                        primaryStored={(name) => entryNamed(name) != null}
                        onView={setViewing}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
            {packageQuery && packageQuery.passages.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-(--muted)">
                {packageQuery.passages.map((passage) => (
                  <li key={passage.path}>
                    Passage from{" "}
                    {entryNamed(passage.path) && isMarkdownPath(passage.path) ? (
                      <PackageFileLink
                        path={passage.path}
                        onOpen={() => setViewing(passage.path)}
                      />
                    ) : (
                      <span className="font-mono">{passage.path}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {packageQuery && packageQuery.gaps.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-(--ink)">
                {packageQuery.gaps.map((gap) => (
                  <li key={gap.path}>
                    {entryNamed(gap.path) && isMarkdownPath(gap.path) ? (
                      <PackageFileLink path={gap.path} onOpen={() => setViewing(gap.path)} />
                    ) : (
                      <span className="font-mono">{gap.path}</span>
                    )}
                    {": "}
                    {gap.reason}
                    {gap.originUri && /^https?:\/\//i.test(gap.originUri) ? (
                      <>
                        {" "}
                        Original: <OriginLink href={gap.originUri} />
                      </>
                    ) : gap.originUri ? (
                      ` Original: ${gap.originUri}`
                    ) : (
                      ""
                    )}
                  </li>
                ))}
              </ul>
            )}
            {packageQuery && packageQuery.hits.length > 0 && (
              <ul className="mt-3 space-y-2 text-sm">
                {packageQuery.hits.map((hit) => {
                  const excerpt = packageQuery.excerpts.find(
                    (item) => item.path === hit.path,
                  );
                  const documents =
                    hit.kind === "parsed"
                      ? [hit.path]
                      : (hit.documents ?? []);
                  return (
                    <li key={hit.path} className="space-y-1">
                      <div className="flex items-center gap-2">
                        {entryNamed(hit.path) && isMarkdownPath(hit.path) ? (
                          <PackageFileLink
                            path={hit.path}
                            onOpen={() => setViewing(hit.path)}
                          />
                        ) : (
                          <span className="mr-2 font-mono">{hit.path}</span>
                        )}
                        <span className="text-(--muted)">
                          · {hit.kind === "okf" ? "OKF" : "parsed"}
                          {excerpt?.truncated ? " · truncated" : ""}
                        </span>
                      </div>
                      {hit.kind === "okf"
                        ? documents.map((doc) => (
                            <div key={doc} className="flex items-center gap-2">
                              {entryNamed(doc) && isMarkdownPath(doc) ? (
                                <PackageFileLink path={doc} onOpen={() => setViewing(doc)} />
                              ) : (
                                <span className="mr-2 font-mono">{doc}</span>
                              )}
                            </div>
                          ))
                        : null}
                      {hit.snippet && (
                        <p className="text-(--muted)">{hit.snippet}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {packageQuery && packageQuery.skipped.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-red-800">
                {packageQuery.skipped.map((item) => (
                  <li key={item.path}>
                    {item.path}: {item.reason}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {opened.map((id) => (
            <SectionBody
              key={id}
              summary={summary}
              section={id}
              entryNamed={entryNamed}
              onDownload={(name) => void downloadEntry(name)}
              onView={setViewing}
            />
          ))}

          {sectionLinks.some((link) => !opened.includes(link.id)) && (
            <>
              <p className="text-sm text-(--muted)">
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
                      className="text-left text-sm font-medium text-(--accent) hover:underline"
                    >
                      {link.label}
                    </button>
                  ))}
              </nav>
            </>
          )}
        </>
      )}
      {integrityOpen && integrity ? (
        <IntegrityDialog
          lines={integrity}
          testing={testing}
          onClose={() => setIntegrityOpen(false)}
        />
      ) : null}
      {viewingEntry && openArchive ? (
        <MarkdownViewDialog
          archive={openArchive}
          entry={viewingEntry}
          onClose={() => setViewing(null)}
          onDownload={() => void downloadEntry(viewingEntry.name)}
        />
      ) : null}
    </div>
  );
}

function SectionBody({
  summary,
  section,
  entryNamed,
  onDownload,
  onView,
}: {
  summary: NzipOpenSummary;
  section: PackageSection;
  entryNamed: (path: string) => NzipOpenSummary["entries"][number] | null;
  onDownload: (entryName: string) => void;
  onView: (entryName: string) => void;
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
              const stored = entryNamed(path);
              return (
                <li
                  key={`${path}-${i}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
                >
                  <span className="mr-2">
                    {stored && isMarkdownPath(stored.name) ? (
                      <PackageFileLink
                        path={stored.name}
                        label={path}
                        onOpen={() => onView(stored.name)}
                      />
                    ) : stored ? (
                      <PackageFileLink
                        path={stored.name}
                        label={path}
                        onOpen={() => onDownload(stored.name)}
                      />
                    ) : (
                      <span className="font-mono">{path}</span>
                    )}
                    {origin.uri && /^https?:\/\//i.test(origin.uri) ? (
                      <>
                        {": "}
                        <OriginLink href={origin.uri} />
                      </>
                    ) : origin.uri ? (
                      `: ${origin.uri}`
                    ) : null}
                    {origin.bits.length > 0 ? (
                      <span className="text-(--muted)">
                        {" "}
                        ({origin.bits.join(", ")})
                      </span>
                    ) : null}
                  </span>
                  {stored && isMarkdownPath(stored.name) ? (
                    <ViewButton
                      path={stored.name}
                      onView={() => onView(stored.name)}
                    />
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
        title="Open Knowledge Format (OKF) concepts"
        subtitle={okfConceptSummary(summary.okf.concepts)}
      >
        <p className="mb-3 text-sm text-(--muted)">
          Short concept cards under <code className="text-xs">wiki/okf/</code>{" "}
          (one per input document) and topic aggregations. Prefer these before
          opening full extracted text.
        </p>
        {summary.okf.concepts.length === 0 ? (
          <Empty>No Open Knowledge Format (OKF) concept files under wiki/okf/.</Empty>
        ) : (
          <ul className="space-y-3 text-sm">
            {summary.okf.concepts.map((c) => {
              const stored = entryNamed(c);
              return (
                <li key={c} className="flex items-center gap-2">
                  {stored && isMarkdownPath(stored.name) ? (
                    <PackageFileLink path={c} onOpen={() => onView(stored.name)} />
                  ) : (
                    <span className="mr-2 font-mono">{c}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ContentsSection>
    );
  }
  if (section === "parsed") {
    return (
      <ContentsSection
        title="Extracted text"
        subtitle={[
          extractedMarkdownSummary(summary),
          documentSizeLine(summary),
        ]}
      >
        {summary.parsed.length === 0 ? (
          <Empty>No extracted text in this package.</Empty>
        ) : (
          <ul className="space-y-3 text-sm">
            {summary.parsed.map((c) => {
              const markdown = c.toLowerCase().endsWith(".md");
              const stored = markdown ? entryNamed(c) : null;
              return (
                <li key={c} className="flex items-center gap-2">
                  {stored ? (
                    <PackageFileLink path={c} onOpen={() => onView(stored.name)} />
                  ) : (
                    <span className="mr-2 font-mono">{c}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ContentsSection>
    );
  }
  return (
    <ContentsSection
      title="All entries"
      subtitle={archiveSizeLine(summary)}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-xl text-left text-xs">
          <thead className="border-b border-(--border) text-(--muted)">
            <tr>
              <th className="px-3 py-2 font-medium">Path</th>
              <th className="px-3 py-2 font-medium">Method</th>
              <th className="px-3 py-2 font-medium">Size</th>
              <th className="px-3 py-2 font-medium">Stored</th>
            </tr>
          </thead>
          <tbody>
            {summary.entries.map((e) => (
              <tr key={e.name} className="border-b border-(--border) last:border-0">
                <td className="max-w-md truncate px-3 py-1.5 font-mono">
                  {isViewablePackagePath(e.name) ? (
                    <PackageFileLink path={e.name} onOpen={() => onView(e.name)} />
                  ) : (
                    e.name
                  )}
                </td>
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

function AskSourceRow({
  source,
  summary,
  stored,
  primaryStored,
  onView,
}: {
  source: AskSource;
  summary: NzipOpenSummary;
  stored: boolean;
  primaryStored: (path: string) => boolean;
  onView: (path: string) => void;
}) {
  const primaryName = source.kind === "parsed" ? primaryFromParsed(source.path) : null;
  const primary = primaryName
    ? summary.primaries.find((item) => primaryPath(item) === primaryName)
    : null;
  const origin = primary ? documentOrigin(summary, primary) : null;
  const originHttp = Boolean(origin?.uri && /^https?:\/\//i.test(origin.uri));
  const originalInZip = primaryName != null && primaryStored(primaryName);
  const fileLabel =
    source.kind === "okf" ? "concept" : source.kind === "parsed" ? "parsed" : "original";
  return (
    <li className="flex flex-wrap items-center gap-2">
      {stored && isMarkdownPath(source.path) ? (
        <PackageFileLink path={source.path} onOpen={() => onView(source.path)} />
      ) : (
        <span className="font-mono">{source.path}</span>
      )}
      {stored ? <span className="text-(--muted)">{fileLabel}</span> : null}
      {primaryName && originalInZip && isMarkdownPath(primaryName) ? (
        <span className="inline-flex items-center gap-1">
          <ViewButton path={primaryName} onView={() => onView(primaryName)} />
          <span className="text-(--muted)">original</span>
        </span>
      ) : null}
      {primaryName && originalInZip && !isMarkdownPath(primaryName) ? (
        <span className="text-(--muted)">original</span>
      ) : null}
      {primaryName && !originalInZip && origin?.uri ? (
        originHttp ? (
          <OriginLink href={origin.uri}>Original</OriginLink>
        ) : (
          <span className="text-(--muted)">{origin.uri}</span>
        )
      ) : null}
    </li>
  );
}

function PackageFileLink({
  path,
  onOpen,
  label,
}: {
  path: string;
  onOpen: () => void;
  label?: string;
}) {
  return (
    <button type="button" onClick={onOpen} className="link-package font-mono">
      {label ?? path}
    </button>
  );
}

function OriginLink({ href, children }: { href: string; children?: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="link-origin">
      {children ?? href}
    </a>
  );
}

function ViewButton({
  path,
  onView,
}: {
  path: string;
  onView: () => void;
}) {
  const name = path.split("/").pop() ?? path;
  return (
    <button
      type="button"
      onClick={onView}
      aria-label={`View ${name}`}
      title="View"
      className="shrink-0 text-(--accent) hover:opacity-80"
    >
      <ViewIcon />
    </button>
  );
}

function ViewIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function OverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-(--muted)">{label}</dt>
      <dd className="mt-0.5 font-medium text-(--ink)">{value}</dd>
    </div>
  );
}

function ContentsSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string | readonly string[];
  children: ReactNode;
}) {
  const lines = subtitle == null ? [] : Array.isArray(subtitle) ? subtitle : [subtitle];
  return (
    <section>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {lines.map((line, index) => (
        <p key={`${index}:${line}`} className="mt-1 text-sm text-(--muted)">
          {line}
        </p>
      ))}
      <div className="mt-3 rounded-xl border border-(--border) bg-white p-4">
        {children}
      </div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-(--muted)">{children}</p>;
}
