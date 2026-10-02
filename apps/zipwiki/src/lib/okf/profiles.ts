import { okfParseSample, OKF_PARSE_SAMPLE_CHARS } from "./parse-sample.js";

/** Enrichment profiles. These do not replace compression categories. */
export const OKF_PROFILES = ["book", "legislation", "invoice", "generic"] as const;

export type OkfProfile = (typeof OKF_PROFILES)[number];

export type OkfProfileFlag = OkfProfile | "auto";

const BOOK_EDGE_CHARS = 6_000;

export function isOkfProfile(value: string): value is OkfProfile {
  return (OKF_PROFILES as readonly string[]).includes(value);
}

/**
 * Parse `--okf-profile`. Omitted means auto.
 * `generic` is a resolved profile, not a flag.
 */
export function parseOkfProfileFlag(value: unknown): OkfProfileFlag | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const v = String(value).trim().toLowerCase();
  if (v === "auto" || v === "book" || v === "legislation" || v === "invoice") {
    return v;
  }
  throw new Error(
    `Unknown OKF profile "${value}". Use auto, book, legislation, or invoice.`,
  );
}

/**
 * `auto` (and an omitted flag) keeps the generic card, except `.epub` → book.
 * An explicit profile applies to that file.
 */
export function resolveOkfProfile(input: {
  explicit?: string | null;
  fileName?: string;
}): OkfProfile {
  const explicit = input.explicit?.trim().toLowerCase();
  if (
    explicit === "book" ||
    explicit === "legislation" ||
    explicit === "invoice" ||
    explicit === "generic"
  ) {
    return explicit;
  }
  const name = (input.fileName ?? "").replace(/\\/g, "/").toLowerCase();
  if (name.endsWith(".epub")) return "book";
  return "generic";
}

export function okfProfileType(profile: OkfProfile): string {
  switch (profile) {
    case "book":
      return "Book";
    case "legislation":
      return "Legislation";
    case "invoice":
      return "Invoice";
    default:
      return "Document";
  }
}

/** Instruction paragraph for one model call. Empty for the generic card. */
export function okfProfileInstruction(profile: OkfProfile): string {
  switch (profile) {
    case "book":
      return "This file is a book. type is Book. keyFacts are the author, the title, the date or setting, and one distinctive line or scene from the sample. Do not invent amounts, dates, names, or citations that are not in the sample.";
    case "legislation":
      return "This file is legislation. type is Legislation. keyFacts are the jurisdiction, the citation or chapter, and what the section regulates. Do not invent amounts, dates, names, or citations that are not in the sample.";
    case "invoice":
      return "This file is an invoice. type is Invoice. keyFacts are the vendor, the invoice number, the date, and the total, and only when those strings are in the sample. Do not invent amounts, dates, names, or citations that are not in the sample.";
    default:
      return "";
  }
}

/**
 * Slice of the parse sent with the OKF call.
 * Books longer than the usual prefix send the opening and the ending so a
 * late line can land on the card. Other profiles keep the opening prefix.
 */
export function sampleFor(profile: OkfProfile, text: string | undefined): string {
  if (!text) return "";
  if (profile !== "book" || text.length <= OKF_PARSE_SAMPLE_CHARS) {
    return okfParseSample(text);
  }
  const head = text.slice(0, BOOK_EDGE_CHARS);
  const tail = text.slice(-BOOK_EDGE_CHARS);
  return `${head}\n\n[…later in the document…]\n\n${tail}`;
}
