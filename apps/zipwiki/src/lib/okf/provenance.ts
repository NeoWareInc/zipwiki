import { createHash } from "node:crypto";
import {
  parseFrontmatterFields,
  renderConceptMarkdown,
  splitFrontmatter,
  type OkfGeneratedEvent,
  type OkfSourceEntry,
} from "./frontmatter.js";

/** SHA-256 hex of the markdown body excluding frontmatter. */
export function hashOkfBody(markdown: string): string {
  const { body } = splitFrontmatter(markdown);
  return createHash("sha256").update(body).digest("hex");
}

export function dateHeadingFromIso(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m?.[1] ?? iso.slice(0, 10);
}

/**
 * Stamp or refresh `generated` when the body hash differs from `priorBodyHash`.
 * Also sets code-owned `sources` when provided (replaces any AI-authored sources).
 */
export function applyCodeOwnedProvenance(
  markdown: string,
  opts: {
    generatedBy: string;
    generatedAt: string;
    sources: OkfSourceEntry[];
    /** Prior body hash; if equal to current body, keep existing generated.at when present. */
    priorBodyHash?: string;
    priorGenerated?: OkfGeneratedEvent;
  },
): string {
  const split = splitFrontmatter(markdown);
  const fields = split.frontmatter
    ? parseFrontmatterFields(split.frontmatter)
    : {};
  const bodyHash = createHash("sha256").update(split.body).digest("hex");
  const unchanged =
    opts.priorBodyHash !== undefined && opts.priorBodyHash === bodyHash;

  if (unchanged && opts.priorGenerated?.by) {
    fields.generated = { ...opts.priorGenerated };
  } else {
    fields.generated = {
      by: opts.generatedBy,
      at: opts.generatedAt,
    };
  }

  // Code owns sources — never leave LLM-invented sources.
  fields.sources = opts.sources.map((s) => ({ ...s }));

  return renderConceptMarkdown(fields, split.body);
}
