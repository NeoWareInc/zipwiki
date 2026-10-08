import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  compareVersions,
  maybeCheckForUpdate,
  updateCheckSkipped,
} from "./update-check.js";

const dir = mkdtempSync(join(tmpdir(), "zipwiki-update-"));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("update check", () => {
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("compares dotted versions", () => {
    assert.ok(compareVersions("0.1.0", "0.2.0") > 0);
    assert.equal(compareVersions("0.1.0", "0.1.0"), 0);
    assert.ok(compareVersions("0.2.0", "0.1.0") < 0);
    assert.ok(compareVersions("0.1.0", "v0.1.1") > 0);
  });

  it("skips CI, the opt-out, and quiet commands", () => {
    assert.equal(updateCheckSkipped({ CI: "1" }, []), true);
    assert.equal(updateCheckSkipped({ ZIPWIKI_NO_UPDATE_CHECK: "1" }, []), true);
    assert.equal(updateCheckSkipped({}, ["zipwiki", "--quiet"]), true);
    assert.equal(updateCheckSkipped({}, ["zipwiki", "-q"]), true);
    assert.equal(updateCheckSkipped({}, ["zipwiki", "open"]), false);
  });

  it("prints one line when the manifest is newer and then stays quiet for a day", async () => {
    const home = join(dir, "home");
    const lines: string[] = [];
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return jsonResponse({
        version: "0.2.0",
        url: "https://zipwiki.ai/install",
      });
    };
    await maybeCheckForUpdate({
      homeDir: home,
      currentVersion: "0.1.0",
      env: {},
      argv: ["zipwiki"],
      now: () => 1_000,
      fetchImpl,
      log: (line) => lines.push(line),
    });
    assert.deepEqual(lines, [
      "[zipwiki] 0.2.0 is available (you have 0.1.0). https://zipwiki.ai/install",
    ]);
    await maybeCheckForUpdate({
      homeDir: home,
      currentVersion: "0.1.0",
      env: {},
      argv: ["zipwiki"],
      now: () => 1_000 + 60_000,
      fetchImpl,
      log: (line) => lines.push(line),
    });
    assert.equal(calls, 1);
    const cached = JSON.parse(readFileSync(join(home, "update-check.json"), "utf8")) as {
      checkedAt: number;
    };
    assert.equal(cached.checkedAt, 1_000);
  });

  it("stays silent when the manifest is missing", async () => {
    const lines: string[] = [];
    await maybeCheckForUpdate({
      homeDir: join(dir, "offline"),
      currentVersion: "0.1.0",
      env: {},
      argv: ["zipwiki"],
      now: () => 5_000,
      fetchImpl: async () => {
        throw new Error("offline");
      },
      log: (line) => lines.push(line),
    });
    assert.deepEqual(lines, []);
  });
});
