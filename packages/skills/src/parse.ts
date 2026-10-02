import type { SkillDoc, SkillKind } from "./types.js";

function stripQuotes(value: string): string {
  const t = value.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

/** Minimal YAML frontmatter parser for skill docs (flat string keys only). */
export function parseSkillFrontmatter(markdown: string): {
  fields: Record<string, string>;
  body: string;
} {
  const normalized = markdown.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---")) {
    return { fields: {}, body: normalized.trim() };
  }
  const end = normalized.indexOf("\n---", 3);
  if (end < 0) {
    return { fields: {}, body: normalized.trim() };
  }
  const raw = normalized.slice(3, end).replace(/^\r?\n/, "");
  const body = normalized.slice(end + 4).replace(/^\r?\n/, "");
  const fields: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    fields[m[1]] = stripQuotes(m[2] ?? "");
  }
  return { fields, body: body.trim() };
}

function inferKind(
  fields: Record<string, string>,
  filePath: string,
): SkillKind | null {
  const raw = (fields.kind ?? "").trim().toLowerCase();
  if (raw === "enrichment" || raw === "query") return raw;
  const base = filePath.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
  if (base.includes("enrich")) return "enrichment";
  if (base.includes("query")) return "query";
  return null;
}

export function skillDocFromMarkdown(
  markdown: string,
  filePath: string,
  preferKind?: SkillKind,
): SkillDoc | null {
  const { fields, body } = parseSkillFrontmatter(markdown);
  const kind = inferKind(fields, filePath) ?? preferKind ?? null;
  if (!kind) return null;
  if (preferKind && kind !== preferKind) return null;
  const name =
    fields.name?.trim() ||
    filePath
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      ?.replace(/\.md$/i, "") ||
    kind;
  return {
    name,
    description: fields.description?.trim() ?? "",
    kind,
    ...(fields.version ? { version: fields.version } : {}),
    path: filePath,
    markdown: markdown.replace(/^\uFEFF/, ""),
    body: body || markdown.trim(),
  };
}

export function skillBodiesText(
  skills: SkillDoc[],
  cap = 32_000,
): string {
  const parts: string[] = [];
  let used = 0;
  for (const skill of skills) {
    const block = `## Skill: ${skill.name}\n\n${skill.body}`.trim();
    if (used + block.length + 2 > cap) {
      const remain = Math.max(0, cap - used - 20);
      if (remain > 40) {
        parts.push(`${block.slice(0, remain)}\n…`);
      }
      break;
    }
    parts.push(block);
    used += block.length + 2;
  }
  return parts.join("\n\n");
}
