/**
 * One model call for `ai.digest` after the concept cards exist.
 * Sends `wiki/okf/index.md`, not the parsed documents.
 * `--no-ai-okf` keeps the local joined line. A failed call does too, unless
 * that line would be cut off, in which case every group is still named.
 */
import { generateObject } from "ai";
import { z } from "zod";
import { isRemoteOkfMode } from "../config/index.js";
import { RemoteOkfAdapter } from "./adapters/remote.js";
import { logOkfError, withOkfCommRetry } from "./comm-error.js";
import {
  PACKAGE_DIGEST_MAX_CHARS,
  synthesizePackageDigestFromEntries,
} from "./package-digest.js";
import { createOkfLanguageModel } from "./providers.js";
import { renderOkfIndex, type OkfIndexEntry } from "./render.js";

/** Prompt cap for `wiki/okf/index.md`. Bullets shrink together so the tail stays. */
export const PACKAGE_DIGEST_INDEX_CHARS = 60_000;

const summarySchema = z.object({
  summary: z.string(),
});

export type PackageDigestGroup = {
  name: string;
  count: number;
};

export type PackageDigestGenerator = (input: {
  count: number;
  /** `wiki/okf/index.md` contents. */
  index: string;
  bodyBudget: number;
  /** Subject names missing from a previous draft. */
  missing?: string[];
}) => Promise<string>;

type DigestRow = { title: string; text: string };

function digestRows(entries: OkfIndexEntry[]): DigestRow[] {
  const rows: DigestRow[] = [];
  for (const entry of entries) {
    const text = (entry.description?.trim() || entry.title?.trim() || "").replace(
      /\s+/g,
      " ",
    );
    if (!text || text === "*(none)*") continue;
    const title = (entry.title?.trim() || text).replace(/\s+/g, " ");
    rows.push({ title, text });
  }
  return rows;
}

/** First word of the concept title. Medical packages group by patient name. */
export function packageDigestGroupName(title: string): string {
  const token = title.trim().split(/\s+/)[0] ?? "";
  return token || title.trim() || "Documents";
}

function repeatedTitleGroups(rows: DigestRow[]): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = packageDigestGroupName(row.title);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count >= 2).map(([name]) => name);
}

/**
 * Title prefix when several cards share it. A one-off title joins that
 * group when its text names exactly one of those prefixes (a CT report
 * for Ostrander stays with the Ostrander cards).
 */
function rowGroup(row: DigestRow, repeated: string[]): string {
  const first = packageDigestGroupName(row.title);
  if (repeated.includes(first)) return first;
  const hay = `${row.title} ${row.text}`.toLowerCase();
  const hits = repeated.filter((name) => hay.includes(name.toLowerCase()));
  return hits.length === 1 ? hits[0]! : first;
}

/** Every distinct title group, largest first. */
export function packageDigestGroups(entries: OkfIndexEntry[]): PackageDigestGroup[] {
  const rows = digestRows(entries);
  const repeated = repeatedTitleGroups(rows);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = rowGroup(row, repeated);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function isIndexBullet(line: string): boolean {
  return /^\*\s+\[/.test(line);
}

function shrinkBullet(line: string, max: number): string {
  if (line.length <= max) return line;
  const sep = line.indexOf(" - ");
  const head = sep >= 0 ? line.slice(0, sep + 3) : line;
  const room = max - head.length - 1;
  if (sep < 0 || room < 1) {
    return `${line.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
  }
  return `${head}${line.slice(sep + 3, sep + 3 + room).trimEnd()}…`;
}

function fitIndex(raw: string, budget: number): string {
  if (raw.length <= budget) return raw;
  const lines = raw.split("\n");
  const bullets = lines.filter(isIndexBullet).length;
  let per = Math.max(32, Math.floor(budget / Math.max(1, bullets)));
  const render = () =>
    lines
      .map((line) => (isIndexBullet(line) ? shrinkBullet(line, per) : line))
      .join("\n");
  let text = render();
  while (text.length > budget && per > 16) {
    per -= 1;
    text = render();
  }
  return text.length <= budget ? text : text.slice(0, budget);
}

/**
 * The `wiki/okf/index.md` text the model reads. Uses the file when it
 * exists, otherwise renders the same `# Files` list from the concept cards.
 * A long index shrinks each bullet so later records stay in the prompt.
 */
export function packageDigestIndexText(
  entries: OkfIndexEntry[],
  indexMarkdown?: string,
  budget = PACKAGE_DIGEST_INDEX_CHARS,
): string {
  const provided = indexMarkdown?.replace(/\r\n/g, "\n").trim();
  const raw = provided || renderOkfIndex(entries).trim();
  if (!raw) return "";
  return fitIndex(raw, budget);
}

/** Group names that do not appear in the summary. */
export function packageDigestOmitsGroups(
  summary: string,
  groups: PackageDigestGroup[],
): string[] {
  const lower = summary.toLowerCase();
  return groups
    .filter((group) => !lower.includes(group.name.toLowerCase()))
    .map((group) => group.name);
}

/**
 * Local summary that names every group. Uses the joined descriptions when
 * they already fit inside the cap.
 */
export function balancedPackageDigest(
  entries: OkfIndexEntry[],
  maxChars = PACKAGE_DIGEST_MAX_CHARS,
): string {
  const rows = digestRows(entries);
  if (rows.length === 0) return "";
  const groups = packageDigestGroups(entries);
  const local = synthesizePackageDigestFromEntries(entries, maxChars);
  if (local && !local.endsWith("…")) return local;
  const per = Math.max(
    20,
    Math.floor((maxChars - 24) / Math.max(1, groups.length)) - 2,
  );
  const parts = groups.map((group) => {
    const repeated = repeatedTitleGroups(rows);
    const sample = rows.find((row) => rowGroup(row, repeated) === group.name);
    const label = `${group.name} (${group.count})`;
    const room = per - label.length - 2;
    if (!sample || room < 12) return label;
    const hint = sample.text.replace(/\s+/g, " ").trim();
    return room >= hint.length
      ? `${label}: ${hint}`
      : `${label}: ${hint.slice(0, room - 1).trimEnd()}…`;
  });
  return clampPackageDigest(parts.join("; "), rows.length, maxChars);
}

export function packageDigestPrompt(input: {
  count: number;
  index: string;
  bodyBudget: number;
  missing?: string[];
}): string {
  const retry =
    input.missing && input.missing.length > 0
      ? `A previous draft omitted ${input.missing.join(", ")}. Name every omitted subject this time.`
      : "Cover the whole # Files list. Do not stop after the first bullets.";
  return [
    "You write one package summary for a ZipWiki archive.",
    "The document below is wiki/okf/index.md. Each bullet under # Files is one record: a title and a description.",
    "Read every # Files bullet before you write.",
    `Write one plain-text summary of at most ${input.bodyBudget} characters.`,
    retry,
    "Do not list every file. Do not start with a count of documents. No markdown.",
    "",
    input.index,
  ].join("\n");
}

/** Prefix the document count and keep the stored field inside the cap. */
export function clampPackageDigest(
  summary: string,
  count: number,
  maxChars = PACKAGE_DIGEST_MAX_CHARS,
): string {
  const prefix = `${count} document${count === 1 ? "" : "s"}: `;
  let body = summary.replace(/\s+/g, " ").trim();
  body = body.replace(/^\d+\s+documents?:\s*/i, "");
  const out = prefix + body;
  if (out.length <= maxChars) return out;
  const room = maxChars - prefix.length - 1;
  if (room < 8) return `${out.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
  return `${prefix}${body.slice(0, room).trimEnd()}…`;
}

async function defaultPackageDigestModel(input: {
  count: number;
  index: string;
  bodyBudget: number;
  missing?: string[];
}): Promise<string> {
  if (isRemoteOkfMode()) {
    const remote = new RemoteOkfAdapter();
    return remote.digest({
      count: input.count,
      index: input.index,
      bodyBudget: input.bodyBudget,
      ...(input.missing ? { missing: input.missing } : {}),
    });
  }
  const handle = createOkfLanguageModel();
  const { object } = await generateObject({
    model: handle.model,
    schema: summarySchema,
    prompt: packageDigestPrompt(input),
    maxOutputTokens: 8192,
    ...(handle.modelId === "claude-haiku-5-5"
      ? { providerOptions: { anthropic: { effort: "low" as const } } }
      : {}),
  });
  return object.summary;
}

/**
 * Model summary when `useAi` is set. The model reads `wiki/okf/index.md`.
 * A draft that skips a repeated subject is rewritten once. A failed call
 * keeps a local line that still names every group.
 */
export async function resolvePackageDigest(input: {
  entries: OkfIndexEntry[];
  /** On-disk `wiki/okf/index.md`. Omitted renders the same list from `entries`. */
  indexMarkdown?: string;
  useAi?: boolean;
  generate?: PackageDigestGenerator;
}): Promise<string | undefined> {
  const local = balancedPackageDigest(input.entries);
  const rows = digestRows(input.entries);
  if (!input.useAi || rows.length === 0) {
    return synthesizePackageDigestFromEntries(
      input.entries,
      PACKAGE_DIGEST_MAX_CHARS,
    );
  }
  const groups = packageDigestGroups(input.entries);
  const required = groups.filter((group) => group.count >= 2);
  const index = packageDigestIndexText(input.entries, input.indexMarkdown);
  const prefix = `${rows.length} document${rows.length === 1 ? "" : "s"}: `;
  const bodyBudget = Math.max(32, PACKAGE_DIGEST_MAX_CHARS - prefix.length);
  const generate = input.generate ?? defaultPackageDigestModel;
  try {
    const summary = await withOkfCommRetry("package digest", () =>
      generate({ count: rows.length, index, bodyBudget }),
    );
    let clamped = clampPackageDigest(summary, rows.length);
    const missing = packageDigestOmitsGroups(clamped, required);
    if (missing.length > 0) {
      const rewritten = await withOkfCommRetry("package digest", () =>
        generate({
          count: rows.length,
          index,
          bodyBudget,
          missing,
        }),
      );
      clamped = clampPackageDigest(rewritten, rows.length);
    }
    if (!clamped.slice(prefix.length).trim()) return local;
    if (
      required.length > 0 &&
      required.length <= 12 &&
      packageDigestOmitsGroups(clamped, required).length > 0
    ) {
      return local;
    }
    return clamped;
  } catch (err) {
    logOkfError("package digest", err, false);
    return local;
  }
}
