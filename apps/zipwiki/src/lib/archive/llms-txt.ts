/**
 * Generate META-INF/codex/llms.txt for a multi-file package from descriptor facts.
 * Grammar aligned with https://llmstxt.org (relative zip entry links).
 */

export type LlmsTxtMember = {
  path: string;
  category?: string;
  digest?: string;
};

export type BuildLlmsTxtInput = {
  title: string;
  digest?: string;
  members: LlmsTxtMember[];
};

/** Build curated agent map Markdown for a zipwiki-collection package. */
export function buildCollectionLlmsTxt(input: BuildLlmsTxtInput): string {
  const lines: string[] = [];
  lines.push(`# ${input.title}`);
  lines.push("");
  if (input.digest) {
    lines.push(`> ${input.digest}`);
    lines.push("");
  }
  lines.push(
    "ZipWiki multi-file package: each member has whole-document structured markdown in `META-INF/codex/structured.pack`. Machine offsets live in `descriptor.json`.",
  );
  lines.push("");
  lines.push("## Members");
  lines.push("");
  for (const m of input.members) {
    // Relative from META-INF/codex/llms.txt to content at zip root or content/
    const href = m.path.startsWith("../") ? m.path : `../../${m.path}`;
    const noteParts = [m.category, m.digest].filter(Boolean);
    const note = noteParts.length > 0 ? `: ${noteParts.join(" — ")}` : "";
    lines.push(`- [${m.path}](${href})${note}`);
  }
  lines.push("");
  lines.push("## Structured (AI markdown)");
  lines.push("");
  input.members.forEach((m, i) => {
    lines.push(
      `- [${m.path} structured](structured.pack): open via descriptor members[${i}].structured offset/length`,
    );
  });
  lines.push("");
  lines.push("## Optional");
  lines.push("");
  lines.push(
    "- [descriptor.json](descriptor.json): machine member index and pack offsets",
  );
  lines.push("");
  return `${lines.join("\n")}`;
}
