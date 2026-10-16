import { loadOkfRules, okfTypeById } from "./load.js";

/** Model prompt for one concept card. The wording lives in `rules/`. */
export function composeOkfPrompt(input: {
  profile: string;
  documentType?: string;
  title?: string;
  digest?: string;
  primaryList: string;
  parseSample: string;
}): string {
  const rules = loadOkfRules();
  const type = okfTypeById(input.profile) ?? okfTypeById("generic");
  if (!type) throw new Error(`OKF type "${input.profile}" is not in rules/types`);
  const lines = [rules.prompt, ""];
  if (type.body) lines.push(type.body, "");
  lines.push("Rules:");
  for (const line of rules.ruleLines) {
    if (line.trim() === "{{invent}}") {
      if (type.citeSample) lines.push(rules.inventLine);
      continue;
    }
    lines.push(
      line.split("{{type}}").join(type.typeRule).split("{{keyFacts}}").join(type.keyFacts),
    );
  }
  lines.push(
    "",
    `Suggested classifier category: ${input.documentType ?? "Generic"}`,
    `Package title hint: ${input.title ?? "(none)"}`,
    `Existing digest hint: ${input.digest ?? "(none)"}`,
    "Documents:",
    input.primaryList || "(none)",
    "",
    "Parsed text sample:",
    input.parseSample || "(no parse text — filename/type only)",
  );
  return lines.join("\n");
}
