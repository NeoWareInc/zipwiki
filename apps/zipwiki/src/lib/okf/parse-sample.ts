/**
 * Characters of parse text sent to OKF enrichment.
 * Matches `MAX_PARSE_CHARS` in the hosted enricher (`apps/server` anthropic gateway).
 * The hosted API only reads this prefix; posting the full parse can exceed Fastify's 1 MB body limit.
 */
export const OKF_PARSE_SAMPLE_CHARS = 12_000;

export function okfParseSample(text: string | undefined): string {
  if (!text) return "";
  if (text.length <= OKF_PARSE_SAMPLE_CHARS) return text;
  return `${text.slice(0, OKF_PARSE_SAMPLE_CHARS)}\n\n[…truncated for OKF generation…]`;
}
