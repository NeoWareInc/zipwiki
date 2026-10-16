import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildNeoZipManifest } from "./nzip.js";
import {
  indexWithNotice,
  PACK_NOTICE_FILENAME,
  readPackNotice,
} from "./pack-notice.js";

describe("pack notice", () => {
  it("reads .zipwiki-notice.md from a pack folder", () => {
    const dir = mkdtempSync(join(tmpdir(), "zipwiki-notice-"));
    writeFileSync(
      join(dir, PACK_NOTICE_FILENAME),
      "These are not real patients. All names, results, and symptoms are made up.\n",
    );
    assert.equal(
      readPackNotice([dir]),
      "These are not real patients. All names, results, and symptoms are made up.",
    );
    assert.equal(readPackNotice([join(dir, "missing")]), undefined);
  });

  it("stores the notice on the manifest and ahead of the OKF file list", () => {
    const notice = "These are not real patients.";
    const manifest = buildNeoZipManifest({
      primaries: [],
      notice,
    });
    assert.equal(manifest.ai?.notice, notice);
    const index = indexWithNotice(
      "---\nokf_version: \"0.2\"\n---\n\n# Files\n\n* [A](a.md)\n",
      notice,
    );
    assert.match(index, /not real patients\.\n\n# Files/);
  });
});
