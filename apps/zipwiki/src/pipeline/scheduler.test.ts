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

  it("aborts the pipeline on PackAbortedError", async () => {
    const err = new Error("Pack aborted.");
    err.name = "PackAbortedError";
    await assert.rejects(
      () =>
        runParseOkfPipeline(["a.docx"], 1, {
          parse: async () => {
            throw err;
          },
          okf: async () => undefined,
        }),
      (e: unknown) =>
        e instanceof Error && e.name === "PackAbortedError",
    );
  });

  it("waitForQuiet after async parse work does not deadlock (exit 13)", async () => {
    const { getPipelineQuietGate } = await import("./pipeline-gate.js");
    const events: string[] = [];

    const result = await runParseOkfPipeline(["lo", "other"], 2, {
      parse: async (item) => {
        events.push(`parse-start:${item}`);
        // Yield so waitForQuiet runs outside pumpParse (real LibreOffice path).
        await delay(10);
        if (item === "lo") {
          const gate = getPipelineQuietGate();
          assert.ok(gate);
          events.push("quiet-wait");
          await gate.waitForQuiet();
          events.push("quiet-ready");
          gate.resume();
          throw new Error("soft-fail");
        }
        await delay(40);
        events.push(`parse-end:${item}`);
        return item;
      },
      okf: async (item, _i, parsed) => {
        events.push(`okf-end:${item}`);
        return parsed;
      },
    });

    assert.ok(events.includes("quiet-ready"), `deadlocked: ${events.join(",")}`);
    assert.ok(
      events.indexOf("okf-end:other") < events.indexOf("quiet-ready"),
      `prompt before other finished: ${events.join(",")}`,
    );
    assert.ok(result.parsed[0]?.error);
    assert.equal(result.okf[1]?.value, "other");
  });

  it("waitForQuiet pauses new parses until other work finishes, then resume", async () => {
    const { getPipelineQuietGate } = await import("./pipeline-gate.js");
    const events: string[] = [];
    let promptReleased!: () => void;
    const promptHold = new Promise<void>((r) => {
      promptReleased = r;
    });

    const resultP = runParseOkfPipeline(["lo", "other", "after"], 2, {
      parse: async (item) => {
        events.push(`parse-start:${item}`);
        if (item === "lo") {
          const gate = getPipelineQuietGate();
          assert.ok(gate);
          events.push("quiet-wait");
          await gate.waitForQuiet();
          events.push("quiet-ready");
          await promptHold;
          events.push("prompt-done");
          gate.resume();
          throw new Error("soft-fail after continue");
        }
        await delay(50);
        events.push(`parse-end:${item}`);
        return item;
      },
      okf: async (item, _i, parsed) => {
        events.push(`okf-start:${item}`);
        await delay(40);
        events.push(`okf-end:${item}`);
        return parsed;
      },
    });

    // Wait until LibreOffice path is blocked on quiet and other work can finish.
    for (let i = 0; i < 40; i++) {
      if (events.includes("quiet-wait")) break;
      await delay(10);
    }
    assert.ok(events.includes("quiet-wait"));

    // "after" must not start while paused.
    await delay(80);
    assert.equal(
      events.includes("parse-start:after"),
      false,
      `after started too early: ${events.join(",")}`,
    );

    // Quiet should resolve only after other parse+okf finish.
    for (let i = 0; i < 40; i++) {
      if (events.includes("quiet-ready")) break;
      await delay(15);
    }
    assert.ok(
      events.includes("okf-end:other"),
      `expected other OKF before prompt; events=${events.join(",")}`,
    );
    assert.ok(events.includes("quiet-ready"));
    const quietReady = events.indexOf("quiet-ready");
    const okfOtherEnd = events.indexOf("okf-end:other");
    assert.ok(
      okfOtherEnd < quietReady,
      `prompt before other OKF finished: ${events.join(",")}`,
    );

    promptReleased();
    const result = await resultP;
    assert.ok(events.includes("parse-start:after"), "resume should start after");
    assert.ok(result.parsed[0]?.error);
    assert.equal(result.okf[1]?.value, "other");
  });
});
