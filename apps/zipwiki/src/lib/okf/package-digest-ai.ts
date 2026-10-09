/**
 * One model call for `ai.digest` after the concept cards exist.
 * Sends titles and descriptions, not parsed documents.
 * `--no-ai-okf` and a failed call keep the local joined line.
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
import type { OkfIndexEntry } from "./render.js";

/** Prompt catalog cap. Every card still gets a line; long descriptions shrink to fit. */
export const PACKAGE_DIGEST_CATALOG_CHARS = 60_000;

const summarySchema = z.object({
  summary: z.string(),
});

export type PackageDigestGenerator = (input: {
  count: number;
  catalog: string;
  bodyBudget: number;
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

export function packageDigestCatalog(
  entries: OkfIndexEntry[],
  budget = PACKAGE_DIGEST_CATALOG_CHARS,
): string {
  const rows = digestRows(entries);
  if (rows.length === 0) return "";
  const full = rows.map((row) => `- ${row.title}: ${row.text}`);
  if (full.join("\n").length <= budget) return full.join("\n");
  const per = Math.max(32, Math.floor(budget / rows.length) - 1);
  return rows
    .map((row) => {
      const line = `- ${row.title}: ${row.text}`;
      if (line.length <= per) return line;
      return `${line.slice(0, Math.max(1, per - 1)).trimEnd()}…`;
    })
    .join("\n");
}

export function packageDigestPrompt(
  count: number,
  catalog: string,
  bodyBudget: number,
): string {
  return [
    "You write one package summary for a ZipWiki archive.",
    "Each line is a concept card: a title and a description. Those cards already summarize the files.",
    `Write one plain-text summary of the collection, at most ${bodyBudget} characters.`,
    "Cover the subjects and document kinds that matter across the set, including cards later in the list.",
    "Do not list every file. Do not start with a count of documents. No markdown.",
    "",
    `${count} concept cards:`,
    catalog,
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

async function defaultPackageDigestModel(
  input: { count: number; catalog: string; bodyBudget: number },
): Promise<string> {
  if (isRemoteOkfMode()) {
    const remote = new RemoteOkfAdapter();
    return remote.digest(input);
  }
  const handle = createOkfLanguageModel();
  const { object } = await generateObject({
    model: handle.model,
    schema: summarySchema,
    prompt: packageDigestPrompt(input.count, input.catalog, input.bodyBudget),
    ...(handle.modelId === "claude-haiku-5-5"
      ? { providerOptions: { anthropic: { effort: "low" as const } } }
      : {}),
  });
  return object.summary;
}

/**
 * Model summary when `useAi` is set. Otherwise, and when the call fails,
 * the local join of concept descriptions.
 */
export async function resolvePackageDigest(input: {
  entries: OkfIndexEntry[];
  useAi?: boolean;
  generate?: PackageDigestGenerator;
}): Promise<string | undefined> {
  const local = synthesizePackageDigestFromEntries(
    input.entries,
    PACKAGE_DIGEST_MAX_CHARS,
  );
  const rows = digestRows(input.entries);
  if (!input.useAi || rows.length === 0) return local;
  const catalog = packageDigestCatalog(input.entries);
  const prefix = `${rows.length} document${rows.length === 1 ? "" : "s"}: `;
  const bodyBudget = Math.max(32, PACKAGE_DIGEST_MAX_CHARS - prefix.length);
  const generate = input.generate ?? defaultPackageDigestModel;
  try {
    const summary = await withOkfCommRetry("package digest", () =>
      generate({ count: rows.length, catalog, bodyBudget }),
    );
    const clamped = clampPackageDigest(summary, rows.length);
    if (!clamped.slice(prefix.length).trim()) return local;
    return clamped;
  } catch (err) {
    logOkfError("package digest", err, false);
    return local;
  }
}
