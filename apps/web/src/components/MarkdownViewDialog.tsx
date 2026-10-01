import { useEffect, useId, useState, type MouseEvent } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { readZipEntryPayload, type ZipListEntry } from "../lib/nzip";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; frontmatter: string | null; html: string }
  | { kind: "error"; message: string };

export function MarkdownViewDialog({
  archive,
  entry,
  onClose,
  onDownload,
}: {
  archive: ArrayBuffer;
  entry: ZipListEntry;
  onClose: () => void;
  onDownload: () => void;
}) {
  const titleId = useId();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void (async () => {
      try {
        const data = await readZipEntryPayload(archive, entry);
        const text = new TextDecoder("utf-8").decode(data);
        const { frontmatter, body } = splitFrontmatter(text);
        const parsed = marked.parse(body, { async: false });
        if (typeof parsed !== "string") {
          throw new Error("Markdown renderer did not return HTML.");
        }
        if (!cancelled) {
          setState({
            kind: "ready",
            frontmatter,
            html: DOMPurify.sanitize(parsed),
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [archive, entry]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#15202b]/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(85vh,900px)] w-full max-w-3xl flex-col rounded-xl border border-(--border) bg-white shadow-soft"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-(--border) px-4 py-3">
          <h2
            id={titleId}
            className="min-w-0 font-mono text-sm font-medium break-all text-(--ink)"
          >
            {entry.name}
          </h2>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={onDownload}
              className="text-xs font-medium text-(--accent) hover:underline"
            >
              Download
            </button>
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className="text-xs font-medium text-(--ink) hover:underline"
            >
              Close
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {state.kind === "loading" ? (
            <p className="text-sm text-(--muted)">Reading…</p>
          ) : null}
          {state.kind === "error" ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {state.message}
            </p>
          ) : null}
          {state.kind === "ready" ? (
            <>
              {state.frontmatter != null ? (
                <pre className="mb-4 overflow-x-auto rounded-lg bg-(--paper) p-3 font-mono text-xs whitespace-pre-wrap text-(--ink)">
                  {state.frontmatter}
                </pre>
              ) : null}
              <div
                className="markdown-view"
                onClick={onMarkdownClick}
                dangerouslySetInnerHTML={{ __html: state.html }}
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function splitFrontmatter(source: string): {
  frontmatter: string | null;
  body: string;
} {
  const text = source.replace(/^\uFEFF/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { frontmatter: null, body: source };
  return { frontmatter: match[1] ?? "", body: text.slice(match[0].length) };
}

function onMarkdownClick(event: MouseEvent<HTMLElement>) {
  const anchor = (event.target as HTMLElement).closest("a");
  if (!anchor || !event.currentTarget.contains(anchor)) return;
  const href = anchor.getAttribute("href") ?? "";
  const external = /^https?:\/\//i.test(href);
  const protocolRelative = href.startsWith("//");
  if (external || protocolRelative) {
    event.preventDefault();
    window.open(protocolRelative ? `https:${href}` : href, "_blank", "noopener,noreferrer");
    return;
  }
  event.preventDefault();
}
