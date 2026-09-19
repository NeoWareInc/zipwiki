import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runParseOkfPipeline } from "./scheduler.js";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("runParseOkfPipeline", () => {
  it("overlaps OKF of file i with parse of file i+1", async () => {
    const events: string[] = [];
    const result = await runParseOkfPipeline(["a", "b", "c"], 1, {
      parse: async (item) => {
        events.push(`parse-start:${item}`);
        await delay(40);
        events.push(`parse-end:${item}`);
        return `parsed:${item}`;
      },
      okf: async (item, _i, parsed) => {
        events.push(`okf-start:${item}:${parsed}`);
        await delay(40);
        events.push(`okf-end:${item}`);
        return `okf:${item}`;
      },
    });

    assert.equal(result.errors, 0);
    assert.equal(result.okf[0]?.value, "okf:a");
    assert.equal(result.okf[2]?.value, "okf:c");

    // With concurrency 1: after parse(a) ends, okf(a) and parse(b) may overlap.
    const okfAStart = events.indexOf("okf-start:a:parsed:a");
    const parseBStart = events.indexOf("parse-start:b");
    const okfAEnd = events.indexOf("okf-end:a");
    assert.ok(okfAStart >= 0 && parseBStart >= 0 && okfAEnd >= 0);
    assert.ok(
      parseBStart < okfAEnd,
      `expected parse(b) to start before okf(a) ends; events=${events.join(",")}`,
    );
  });

  it("respects concurrency > 1 for parallel parses", async () => {
    let maxActive = 0;
    let active = 0;
    await runParseOkfPipeline(["1", "2", "3", "4"], 2, {
      parse: async (item) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await delay(30);
        active -= 1;
        return item;
      },
      okf: async (_item, _i, parsed) => parsed,
    });
    assert.ok(maxActive >= 2, `expected >=2 concurrent parses, got ${maxActive}`);
  });

  it("continues after parse failure unless failFast", async () => {
    const result = await runParseOkfPipeline(["ok", "bad", "ok2"], 2, {
      parse: async (item) => {
        if (item === "bad") throw new Error("boom");
        return item;
      },
      okf: async (_item, _i, parsed) => `okf:${parsed}`,
    });
    assert.equal(result.errors, 1);
    assert.equal(result.okf[0]?.value, "okf:ok");
    assert.ok(result.parsed[1]?.error);
    assert.equal(result.okf[2]?.value, "okf:ok2");
  });
});
