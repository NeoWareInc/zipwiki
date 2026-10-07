import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  anomalyFromErrorMessage,
  QUERY_ANOMALY,
} from "./queryAnomaly.js";

describe("query anomaly codes", () => {
  it("maps preamble and incomplete messages", () => {
    assert.equal(
      anomalyFromErrorMessage("Claude narrated a search without calling a tool"),
      QUERY_ANOMALY.preamble,
    );
    assert.equal(
      anomalyFromErrorMessage("Claude returned an incomplete answer"),
      QUERY_ANOMALY.incomplete,
    );
    assert.equal(
      anomalyFromErrorMessage("Claude returned an empty answer"),
      QUERY_ANOMALY.incomplete,
    );
    assert.equal(
      anomalyFromErrorMessage("Anthropic failed (500)"),
      QUERY_ANOMALY.apiError,
    );
    assert.equal(
      anomalyFromErrorMessage("invalid_request"),
      QUERY_ANOMALY.noExcerpts,
    );
  });
});
