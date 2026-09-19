import { basename } from "node:path";
import { DOCUMENT_TYPES, type DocumentType } from "../archive/index.js";

/** Only the head of a document is scored — categories declare themselves early. */
const CONTENT_WINDOW = 120_000;

/** Below this score the evidence is too thin to claim anything but Generic. */
const MIN_SCORE = 4;

/** Score at which the "how much evidence" half of confidence saturates. */
const SCORE_SATURATION = 24;

/** A single term may only earn its weight this many times. */
const MAX_HITS_PER_TERM = 3;

type Categorized = Exclude<DocumentType, "Generic">;

type Term = { pattern: RegExp; weight: number };

/** Terms scored against the extracted document text. */
const CONTENT_TERMS: Record<Categorized, Term[]> = {
  Financial_Report: [
    { pattern: /\bbalance sheets?\b/gi, weight: 5 },
    { pattern: /\bincome statements?\b/gi, weight: 5 },
    { pattern: /\bcash flows?\b/gi, weight: 4 },
    { pattern: /\bform 10-?[kq]\b/gi, weight: 6 },
    { pattern: /\bearnings per share\b/gi, weight: 5 },
    { pattern: /\bnet (?:income|revenue|loss)\b/gi, weight: 4 },
    { pattern: /\bfiscal (?:year|quarter)\b/gi, weight: 3 },
    { pattern: /\bconsolidated\b/gi, weight: 3 },
    { pattern: /\bgross (?:margin|profit)\b/gi, weight: 3 },
    { pattern: /\bshareholders?'? equity\b/gi, weight: 4 },
    { pattern: /\b(?:ebitda|gaap)\b/gi, weight: 3 },
    { pattern: /\binvoice (?:no|number|date|#)\b/gi, weight: 5 },
    { pattern: /\baccounts (?:payable|receivable)\b/gi, weight: 3 },
  ],
  Legal_Contract: [
    { pattern: /\bthis agreement\b/gi, weight: 6 },
    { pattern: /\bwhereas\b/gi, weight: 4 },
    { pattern: /\bhereinafter\b/gi, weight: 5 },
    { pattern: /\bin witness whereof\b/gi, weight: 6 },
    { pattern: /\bgoverning law\b/gi, weight: 5 },
    { pattern: /\bindemnif\w*/gi, weight: 4 },
    { pattern: /\bconfidential information\b/gi, weight: 4 },
    { pattern: /\brepresentations and warranties\b/gi, weight: 5 },
    { pattern: /\barbitration\b/gi, weight: 3 },
    { pattern: /\bthe parties\b/gi, weight: 3 },
    { pattern: /\beffective date\b/gi, weight: 2 },
    { pattern: /\b(?:shall|may) not be (?:construed|deemed)\b/gi, weight: 4 },
    { pattern: /\bnon-?disclosure\b/gi, weight: 4 },
  ],
  Receipt_Scan: [
    { pattern: /\breceipts?\b/gi, weight: 5 },
    { pattern: /\bsubtotal\b/gi, weight: 4 },
    { pattern: /\b(?:change|amount|total) due\b/gi, weight: 4 },
    { pattern: /\bcard ending\b/gi, weight: 5 },
    { pattern: /\bauth(?:orization)? code\b/gi, weight: 5 },
    { pattern: /\btransaction (?:id|#)\b/gi, weight: 4 },
    { pattern: /\bcashier\b/gi, weight: 4 },
    { pattern: /\bmerchant\b/gi, weight: 3 },
    { pattern: /\bthank you for (?:your|shopping)\b/gi, weight: 4 },
    { pattern: /\bsales tax\b/gi, weight: 3 },
    { pattern: /\bstore\s*#/gi, weight: 4 },
  ],
  Technical_Doc: [
    { pattern: /```/g, weight: 4 },
    { pattern: /\bapi (?:reference|endpoint|key|docs?)\b/gi, weight: 5 },
    { pattern: /\b(?:GET|POST|PUT|PATCH|DELETE)\s+\//g, weight: 5 },
    { pattern: /\b(?:npm|pnpm|yarn|pip) (?:install|add)\b/gi, weight: 5 },
    { pattern: /\binstallation\b/gi, weight: 3 },
    { pattern: /\bconfiguration\b/gi, weight: 3 },
    { pattern: /\bparameters?\b/gi, weight: 2 },
    { pattern: /\breturns?\b/gi, weight: 1 },
    { pattern: /\bspecification\b/gi, weight: 3 },
    { pattern: /\barchitecture\b/gi, weight: 3 },
    { pattern: /\bschema\b/gi, weight: 3 },
    { pattern: /\bchangelog\b/gi, weight: 4 },
    { pattern: /\bdeprecat\w*/gi, weight: 3 },
  ],
};

/** Filename terms — cheap, high-precision signals worth more per hit. */
const NAME_TERMS: Record<Categorized, Term[]> = {
  Financial_Report: [
    { pattern: /10-?k|10-?q|financial|invoice|balance|earnings|budget/gi, weight: 8 },
  ],
  Legal_Contract: [
    { pattern: /contract|agreement|nda|terms|licen[cs]e|addendum/gi, weight: 8 },
  ],
  Receipt_Scan: [{ pattern: /receipt|scan/gi, weight: 8 }],
  Technical_Doc: [
    { pattern: /readme|spec|api|technical|manual|changelog|architecture/gi, weight: 8 },
  ],
};

export type ClassifyInput = {
  /** Raw path or filename; only the basename is scored. */
  fileName: string;
  /** Extracted markdown or plain text. Empty is allowed (filename-only scoring). */
  text: string;
  /**
   * Fraction of pages LiteParse flagged as needing OCR, when known. Combined
   * with a short text body this is what separates a phone-photo receipt from a
   * born-digital document that merely mentions receipts.
   */
  scannedRatio?: number;
};

export type CategoryScore = {
  documentType: DocumentType;
  score: number;
  /** Terms that fired, strongest first, for explaining the verdict. */
  matched: string[];
};

export type Classification = {
  documentType: DocumentType;
  /** 0–1, blending evidence strength with the margin over the runner-up. */
  confidence: number;
  scores: CategoryScore[];
};

function scoreTerms(haystack: string, terms: Term[], matched: string[]): number {
  let score = 0;
  for (const term of terms) {
    const hits = haystack.match(term.pattern)?.length ?? 0;
    if (hits === 0) continue;
    score += term.weight * Math.min(hits, MAX_HITS_PER_TERM);
    matched.push(term.pattern.source);
  }
  return score;
}

/**
 * Assign one category to a whole document from its filename and extracted text.
 * Deterministic and offline — no model call. Ties and thin evidence resolve to
 * "Generic" rather than guessing.
 */
export function classifyDocument(input: ClassifyInput): Classification {
  const name = basename(input.fileName);
  const body = input.text.slice(0, CONTENT_WINDOW);

  const scores: CategoryScore[] = [];
  for (const documentType of Object.keys(CONTENT_TERMS) as Categorized[]) {
    const matched: string[] = [];
    let score = scoreTerms(name, NAME_TERMS[documentType], matched);
    score += scoreTerms(body, CONTENT_TERMS[documentType], matched);
    if (documentType === "Receipt_Scan" && isLikelyScan(input)) score += 6;
    scores.push({ documentType, score, matched });
  }
  scores.sort((a, b) => b.score - a.score);

  const top = scores[0];
  const runnerUp = scores[1];
  if (!top || top.score < MIN_SCORE || top.score === runnerUp?.score) {
    return { documentType: "Generic", confidence: 0, scores };
  }

  const strength = Math.min(1, top.score / SCORE_SATURATION);
  const margin = (top.score - (runnerUp?.score ?? 0)) / top.score;
  return {
    documentType: top.documentType,
    confidence: Math.round((strength * 0.5 + margin * 0.5) * 100) / 100,
    scores,
  };
}

/** A mostly-image document with little recovered text reads as a scan. */
function isLikelyScan(input: ClassifyInput): boolean {
  return (input.scannedRatio ?? 0) >= 0.5 && input.text.trim().length < 2_000;
}

/**
 * Filename-only category, for callers that have not parsed the document yet.
 * Prefer {@link classifyDocument} once text is available.
 */
export function guessDocumentTypeFromName(path: string): DocumentType {
  return classifyDocument({ fileName: path, text: "" }).documentType;
}
