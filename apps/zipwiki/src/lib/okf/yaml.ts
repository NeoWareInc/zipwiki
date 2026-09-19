/** Minimal YAML emitters for OKF frontmatter. */

import { resolve } from "node:path";

export function yamlEscape(value: string): string {
  if (
    value === "" ||
    /[:#{}[\],&*!|>'"%@`]|^\s|\s$|\n/.test(value) ||
    value === "true" ||
    value === "false" ||
    value === "null"
  ) {
    return JSON.stringify(value);
  }
  return value;
}

export function buildDocumentFrontmatter(input: {
  type: string;
  title: string;
  description: string;
  tags?: string[];
  generatedBy: string;
  generatedAt: string;
  sources: Array<{ id?: string; resource: string; description?: string }>;
}): string {
  const lines = [
    "---",
    `type: ${yamlEscape(input.type)}`,
    `title: ${yamlEscape(input.title)}`,
    `description: ${yamlEscape(input.description)}`,
  ];
  if (input.tags && input.tags.length > 0) {
    lines.push(`tags: [${input.tags.map((t) => yamlEscape(t)).join(", ")}]`);
  }
  lines.push(
    `generated: { by: ${yamlEscape(input.generatedBy)}, at: ${yamlEscape(input.generatedAt)} }`,
  );
  if (input.sources.length > 0) {
    lines.push("sources:");
    for (const s of input.sources) {
      if (s.id) {
        lines.push(`  - id: ${yamlEscape(s.id)}`);
        lines.push(`    resource: ${yamlEscape(s.resource)}`);
      } else {
        lines.push(`  - resource: ${yamlEscape(s.resource)}`);
      }
      if (s.description) {
        lines.push(`    description: ${yamlEscape(s.description)}`);
      }
    }
  }
  lines.push("---");
  return lines.join("\n");
}

/**
 * Relative path from `{aiRoot}/okf/` directory to a zip-root path.
 * e.g. primary `report.pdf` → `../../report.pdf`.
 */
export function relativeFromOkfRoot(zipPath: string): string {
  const p = zipPath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `../../${p}`;
}

/** Relative path from okf/ to parse entry for primary P. */
export function relativeParseFromOkf(
  primaryPath: string,
  parsedDir = "parsed",
): string {
  const p = primaryPath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `../${parsedDir.replace(/\/+$/, "")}/${p}.md`;
}

/**
 * Package-aware OKF `sources` for ZipWiki.
 * Omits `id` (optional in OKF; descriptions distinguish entries).
 * When the primary is not stored in the `.nzip`, cite the absolute host path
 * and note that it is outside the package.
 */
export function buildZipWikiOkfSources(input: {
  originalName: string;
  absolutePath: string;
  parseAvailable: boolean;
  /** True when primary bytes are (or will be) stored in the `.nzip`. */
  primaryInPackage: boolean;
}): Array<{ resource: string; description: string }> {
  const zipPrimary = input.originalName.replace(/\\/g, "/");
  const abs = resolve(input.absolutePath);
  const sources: Array<{ resource: string; description: string }> = [];

  if (input.primaryInPackage) {
    sources.push({
      resource: relativeFromOkfRoot(zipPrimary),
      description: `Primary content in this package (${input.originalName})`,
    });
  } else {
    sources.push({
      resource: abs,
      description: `Primary not included in this package; source on disk (${input.originalName})`,
    });
  }

  if (input.parseAvailable) {
    sources.push({
      resource: relativeParseFromOkf(zipPrimary),
      description: `Parsed markdown in this package (${input.originalName})`,
    });
  }

  return sources;
}
