import { yamlEscape } from "./yaml.js";

export type OkfSourceEntry = {
  id?: string;
  resource: string;
  description?: string;
};

export type OkfGeneratedEvent = {
  by: string;
  at?: string;
};

export type OkfFrontmatterFields = {
  type?: string;
  title?: string;
  description?: string;
  resource?: string;
  tags?: string[];
  status?: string;
  stale_after?: string;
  generated?: OkfGeneratedEvent;
  sources?: OkfSourceEntry[];
  okf_version?: string;
  [key: string]: unknown;
};

export type OkfValidationIssue = {
  code: string;
  message: string;
};

export type SplitFrontmatter = {
  frontmatter: string | null;
  body: string;
  raw: string;
};

/** Split leading `---` YAML frontmatter from markdown body. */
export function splitFrontmatter(markdown: string): SplitFrontmatter {
  const normalized = markdown.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---\n") && !normalized.startsWith("---\r\n")) {
    return { frontmatter: null, body: normalized, raw: markdown };
  }
  const start = normalized.startsWith("---\r\n") ? 5 : 4;
  const end = normalized.indexOf("\n---", start);
  if (end < 0) {
    return { frontmatter: null, body: normalized, raw: markdown };
  }
  const afterClose = end + 4; // past \n---
  let bodyStart = afterClose;
  if (normalized[bodyStart] === "\r") bodyStart += 1;
  if (normalized[bodyStart] === "\n") bodyStart += 1;
  return {
    frontmatter: normalized.slice(start, end),
    body: normalized.slice(bodyStart),
    raw: markdown,
  };
}

function unquote(v: string): string {
  const t = v.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

/** Lightweight parse of OKF concept frontmatter (flat + sources list). */
export function parseFrontmatterFields(
  block: string,
): OkfFrontmatterFields {
  const fields: OkfFrontmatterFields = {};
  const lines = block.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const sourcesMatch = /^sources:\s*$/.exec(line);
    if (sourcesMatch) {
      const sources: OkfSourceEntry[] = [];
      i += 1;
      let current: OkfSourceEntry | undefined;
      while (i < lines.length) {
        const s = lines[i]!;
        if (/^\S/.test(s) && !/^\s/.test(s)) break;
        const itemRes = /^\s+-\s+resource:\s*(.+)$/.exec(s);
        if (itemRes) {
          if (current) sources.push(current);
          current = { resource: unquote(itemRes[1]!) };
          i += 1;
          continue;
        }
        const itemId = /^\s+-\s+id:\s*(.+)$/.exec(s);
        if (itemId) {
          if (current) sources.push(current);
          current = { id: unquote(itemId[1]!), resource: "" };
          i += 1;
          continue;
        }
        if (current) {
          const res = /^\s+resource:\s*(.+)$/.exec(s);
          if (res) {
            current.resource = unquote(res[1]!);
            i += 1;
            continue;
          }
          const desc = /^\s+description:\s*(.+)$/.exec(s);
          if (desc) {
            current.description = unquote(desc[1]!);
            i += 1;
            continue;
          }
          const id = /^\s+id:\s*(.+)$/.exec(s);
          if (id) {
            current.id = unquote(id[1]!);
            i += 1;
            continue;
          }
        }
        if (/^\s*$/.test(s)) {
          i += 1;
          continue;
        }
        break;
      }
      if (current) sources.push(current);
      fields.sources = sources;
      continue;
    }

    const gen = /^generated:\s*\{\s*by:\s*([^,}]+?)(?:,\s*at:\s*([^}]+))?\s*\}\s*$/.exec(
      line,
    );
    if (gen) {
      fields.generated = {
        by: unquote(gen[1]!),
        ...(gen[2] ? { at: unquote(gen[2]!) } : {}),
      };
      i += 1;
      continue;
    }

    const kv = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (kv) {
      const key = kv[1]!;
      const raw = kv[2]!.trim();
      if (key === "tags" && raw.startsWith("[") && raw.endsWith("]")) {
        const inner = raw.slice(1, -1).trim();
        fields.tags = inner
          ? inner.split(",").map((t) => unquote(t.trim())).filter(Boolean)
          : [];
      } else if (raw) {
        fields[key] = unquote(raw);
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  return fields;
}

export function validateOkfFrontmatter(
  fields: OkfFrontmatterFields,
): OkfValidationIssue[] {
  const issues: OkfValidationIssue[] = [];
  if (!fields.type || String(fields.type).trim() === "") {
    issues.push({ code: "missing_type", message: "type is required" });
  }
  if (fields.status !== undefined) {
    const s = String(fields.status);
    if (!["draft", "stable", "deprecated"].includes(s)) {
      issues.push({
        code: "invalid_status",
        message: `status must be draft|stable|deprecated, got ${s}`,
      });
    }
  }
  if (fields.generated) {
    if (!fields.generated.by?.trim()) {
      issues.push({
        code: "invalid_generated",
        message: "generated.by is required when generated is present",
      });
    }
  }
  if (fields.sources) {
    for (const [idx, s] of fields.sources.entries()) {
      if (!s.resource?.trim()) {
        issues.push({
          code: "invalid_source",
          message: `sources[${idx}].resource is required`,
        });
      }
    }
  }
  return issues;
}

function renderSources(sources: OkfSourceEntry[]): string[] {
  const lines = ["sources:"];
  for (const s of sources) {
    if (s.id) lines.push(`  - id: ${yamlEscape(s.id)}`);
    lines.push(
      s.id
        ? `    resource: ${yamlEscape(s.resource)}`
        : `  - resource: ${yamlEscape(s.resource)}`,
    );
    if (s.description) {
      lines.push(`    description: ${yamlEscape(s.description)}`);
    }
  }
  return lines;
}

/** Rebuild a concept page with the given fields + body (full re-render). */
export function renderConceptMarkdown(
  fields: OkfFrontmatterFields,
  body: string,
): string {
  const lines = ["---"];
  if (fields.okf_version) {
    lines.push(`okf_version: ${yamlEscape(String(fields.okf_version))}`);
  }
  if (fields.type) lines.push(`type: ${yamlEscape(String(fields.type))}`);
  if (fields.title) lines.push(`title: ${yamlEscape(String(fields.title))}`);
  if (fields.description) {
    lines.push(`description: ${yamlEscape(String(fields.description))}`);
  }
  if (fields.tags && fields.tags.length > 0) {
    lines.push(
      `tags: [${fields.tags.map((t) => yamlEscape(t)).join(", ")}]`,
    );
  }
  if (fields.generated?.by) {
    const at = fields.generated.at
      ? `, at: ${yamlEscape(fields.generated.at)}`
      : "";
    lines.push(
      `generated: { by: ${yamlEscape(fields.generated.by)}${at} }`,
    );
  }
  if (fields.sources && fields.sources.length > 0) {
    lines.push(...renderSources(fields.sources));
  }
  lines.push("---", "");
  const bodyText = body.replace(/^\n+/, "").replace(/\s*$/, "\n");
  return lines.join("\n") + bodyText;
}

/**
 * Repair non-conformant frontmatter. Valid pages are returned unchanged.
 * Missing `type` becomes `Document`.
 */
export function repairOkfFrontmatter(
  markdown: string,
  defaults?: { type?: string },
): { markdown: string; repaired: boolean; issues: OkfValidationIssue[] } {
  const split = splitFrontmatter(markdown);
  if (!split.frontmatter) {
    const fields: OkfFrontmatterFields = {
      type: defaults?.type ?? "Document",
      title: "Untitled",
      description: "Repaired OKF concept with missing frontmatter.",
    };
    return {
      markdown: renderConceptMarkdown(fields, split.body),
      repaired: true,
      issues: [{ code: "missing_frontmatter", message: "no frontmatter block" }],
    };
  }

  const fields = parseFrontmatterFields(split.frontmatter);
  const issues = validateOkfFrontmatter(fields);
  if (issues.length === 0) {
    return { markdown, repaired: false, issues: [] };
  }

  const next: OkfFrontmatterFields = { ...fields };
  // ZipWiki archives omit top-level resource / status / stale_after (sources cover paths).
  delete next.resource;
  delete next.status;
  delete next.stale_after;
  if (!next.type?.trim()) {
    next.type = defaults?.type ?? "Document";
  }
  if (next.generated && !next.generated.by?.trim()) {
    delete next.generated;
  }
  if (next.sources) {
    next.sources = next.sources.filter((s) => s.resource?.trim());
    if (next.sources.length === 0) delete next.sources;
  }

  return {
    markdown: renderConceptMarkdown(next, split.body),
    repaired: true,
    issues,
  };
}
