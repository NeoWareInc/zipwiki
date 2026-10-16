import { okfParseSample, OKF_PARSE_SAMPLE_CHARS } from "./parse-sample.js";
import {
  loadOkfRules,
  okfProfileFlagIds,
  okfTypeById,
  typeMatchesFile,
} from "./rules/load.js";

/** Built-in data types. Additional types are files in `rules/types/`. */
export const OKF_PROFILES = ["book", "legislation", "invoice", "generic"] as const;

export type OkfProfile = string;

export type OkfProfileFlag = OkfProfile | "auto";

const BOOK_EDGE_CHARS = 6_000;

export function isOkfProfile(value: string): value is OkfProfile {
  return loadOkfRules().types.some((type) => type.id === value);
}

/**
 * Parse `--okf-profile`. Omitted means auto.
 * `generic` is the default type file, not a flag.
 */
export function parseOkfProfileFlag(value: unknown): OkfProfileFlag | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const v = String(value).trim().toLowerCase();
  const ids = okfProfileFlagIds();
  if (v === "auto" || ids.includes(v)) return v;
  throw new Error(
    `Unknown OKF profile "${value}". Use auto, ${ids.join(", ")}.`,
  );
}

/**
 * `auto` (and an omitted flag) keeps the generic card, except a filename
 * that matches a type file (`*.epub` → book). An explicit profile applies
 * to that file.
 */
export function resolveOkfProfile(input: {
  explicit?: string | null;
  fileName?: string;
}): OkfProfile {
  const explicit = input.explicit?.trim().toLowerCase();
  if (explicit && explicit !== "auto" && okfTypeById(explicit)) return explicit;
  const name = input.fileName ?? "";
  for (const type of loadOkfRules().types) {
    if (type.id === "generic") continue;
    if (typeMatchesFile(type, name)) return type.id;
  }
  return "generic";
}

export function okfProfileType(profile: OkfProfile): string {
  return okfTypeById(profile)?.okfType ?? "Document";
}

/** Instruction paragraph for one model call. Empty for the generic card. */
export function okfProfileInstruction(profile: OkfProfile): string {
  const type = okfTypeById(profile);
  if (!type || type.body.startsWith("TYPE MAPPING")) return "";
  return type.body;
}

/**
 * Slice of the parse sent with the OKF call.
 * Books longer than the usual prefix send the opening and the ending so a
 * late line can land on the card. Other profiles keep the opening prefix.
 */
export function sampleFor(profile: OkfProfile, text: string | undefined): string {
  if (!text) return "";
  const type = okfTypeById(profile);
  if (!type || type.sample !== "edges" || text.length <= OKF_PARSE_SAMPLE_CHARS) {
    return okfParseSample(text);
  }
  const head = text.slice(0, BOOK_EDGE_CHARS);
  const tail = text.slice(-BOOK_EDGE_CHARS);
  return `${head}\n\n[…later in the document…]\n\n${tail}`;
}
