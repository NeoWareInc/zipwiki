export const SKILL_KINDS = ["enrichment", "query"] as const;
export type SkillKind = (typeof SKILL_KINDS)[number];

export type SkillDoc = {
  name: string;
  description: string;
  kind: SkillKind;
  version?: string;
  /** Absolute or package path the skill was loaded from. */
  path: string;
  /** Full markdown including frontmatter. */
  markdown: string;
  /** Body after frontmatter (injected into prompts). */
  body: string;
};

/** Default cap for concatenated skill text in prompts / open payloads. */
export const DEFAULT_SKILL_TEXT_CAP = 32_000;

export const PACKAGE_SKILLS_DIR = "skills";
