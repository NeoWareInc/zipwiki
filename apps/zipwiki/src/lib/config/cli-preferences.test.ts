import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  isLibreOfficeMissingIgnored,
  loadCliPreferences,
  setIgnoreLibreOfficeMissing,
  zipwikiCliPreferencesPath,
} from "./cli-preferences.js";

describe("cli-preferences", () => {
  const dir = mkdtempSync(join(tmpdir(), "zipwiki-prefs-"));
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("defaults to empty and persists ignoreLibreOfficeMissing", () => {
    assert.deepEqual(loadCliPreferences(dir), {});
    assert.equal(isLibreOfficeMissingIgnored(dir), false);
    setIgnoreLibreOfficeMissing(true, dir);
    assert.equal(isLibreOfficeMissingIgnored(dir), true);
    assert.equal(
      zipwikiCliPreferencesPath(dir),
      join(dir, "cli-preferences.json"),
    );
    assert.deepEqual(loadCliPreferences(dir), {
      ignoreLibreOfficeMissing: true,
    });
  });
});
