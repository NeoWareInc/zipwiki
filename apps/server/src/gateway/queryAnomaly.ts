/**
 * Deterministic Ask failure codes for usageEvents.engine (status: fail).
 * Do not put question/answer text in these events.
 */
export const QUERY_ANOMALY = {
  noExcerpts: "query_no_excerpts",
  noPhraseHits: "query_no_phrase_hits",
  followFail: "query_follow_fail",
  preamble: "query_preamble",
  incomplete: "query_incomplete",
  apiError: "query_api_error",
  clientReject: "query_client_reject",
  sessionNoAnswer: "query_session_no_answer",
} as const;

export type QueryAnomalyCode =
  (typeof QUERY_ANOMALY)[keyof typeof QUERY_ANOMALY];

/** Map gateway / model error messages to anomaly codes. */
export function anomalyFromErrorMessage(message: string): QueryAnomalyCode {
  const m = message.trim();
  if (/narrated a search without calling a tool/i.test(m)) {
    return QUERY_ANOMALY.preamble;
  }
  if (/incomplete answer/i.test(m) || /empty answer/i.test(m)) {
    return QUERY_ANOMALY.incomplete;
  }
  if (/anthropic_not_configured/i.test(m) || /Anthropic failed/i.test(m)) {
    return QUERY_ANOMALY.apiError;
  }
  if (/invalid_request|no_excerpts/i.test(m)) {
    return QUERY_ANOMALY.noExcerpts;
  }
  return QUERY_ANOMALY.apiError;
}
