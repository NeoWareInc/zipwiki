import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { isOkfCommError, logOkfError, withOkfCommRetry } from "./comm-error.js";

const previousHome = process.env.ZIPWIKI_HOME;

afterEach(() => {
  if (previousHome === undefined) delete process.env.ZIPWIKI_HOME;
  else process.env.ZIPWIKI_HOME = previousHome;
});

describe("isOkfCommError", () => {
  it("treats connection failures and retryable statuses as communication errors", () => {
    assert.equal(isOkfCommError(new Error("fetch failed")), true);
    assert.equal(isOkfCommError(new Error("ZipWiki OKF API 502: overloaded")), true);
    assert.equal(isOkfCommError(Object.assign(new Error("no"), { statusCode: 429 })), true);
    assert.equal(isOkfCommError(new Error("Claude omitted title or description")), false);
    const quota = new Error("ZipWiki OKF unavailable");
    (quota as Error & { code?: string }).code = "okf_fallback_host_llm";
    assert.equal(isOkfCommError(quota), false);
  });
});

describe("withOkfCommRetry", () => {
  it("retries a communication error once and logs the retry", async () => {
    const home = mkdtempSync(join(tmpdir(), "okf-err-"));
    process.env.ZIPWIKI_HOME = home;
    const lines: string[] = [];
    const original = console.error;
    console.error = (line?: unknown) => {
      lines.push(String(line));
    };
    let calls = 0;
    try {
      await assert.rejects(
        () =>
          withOkfCommRetry(
            "Ch_2025-007.pdf",
            async () => {
              calls += 1;
              throw new Error("ZipWiki OKF API 502: overloaded");
            },
            async () => {},
          ),
        /502: overloaded/,
      );
    } finally {
      console.error = original;
    }
    assert.equal(calls, 2);
    assert.match(lines[0] ?? "", /error OKF Ch_2025-007\.pdf: ZipWiki OKF API 502: overloaded — retrying/);
    const log = readFileSync(join(home, "okf-errors.log"), "utf8");
    assert.match(log, /error OKF Ch_2025-007\.pdf: ZipWiki OKF API 502: overloaded — retrying/);
  });

  it("does not retry a model error", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withOkfCommRetry("note.pdf", async () => {
          calls += 1;
          throw new Error("Claude omitted title or description");
        }),
      /omitted title/,
    );
    assert.equal(calls, 1);
  });

  it("logs the final failure when the caller gives up", () => {
    const home = mkdtempSync(join(tmpdir(), "okf-final-"));
    process.env.ZIPWIKI_HOME = home;
    logOkfError("Ch_2025-007.pdf", new Error("ZipWiki OKF API 502: overloaded"), false);
    const log = readFileSync(join(home, "okf-errors.log"), "utf8");
    assert.match(log, /error OKF Ch_2025-007\.pdf: ZipWiki OKF API 502: overloaded$/m);
    assert.doesNotMatch(log, /retrying/);
  });
});
