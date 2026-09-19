import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AccountSettingsBodySchema,
  DEFAULT_ACCOUNT_SETTINGS,
  mergeAccountSettings,
} from "./account-settings.js";

describe("AccountSettings", () => {
  it("parses defaults", () => {
    const s = AccountSettingsBodySchema.parse({});
    assert.equal(s.version, 1);
    assert.equal(s.parseCredential, "local");
    assert.equal(s.okfCredential, "local");
    assert.equal(s.pack.compression, undefined);
  });

  it("mergeAccountSettings deep-merges nested prefs", () => {
    const merged = mergeAccountSettings(DEFAULT_ACCOUNT_SETTINGS, {
      parseCredential: "local",
      pack: { compression: "deflate", level: 3 },
      parser: { liteparse: { maxPages: 42 } },
    });
    assert.equal(merged.parseCredential, "local");
    assert.equal(merged.pack.compression, "deflate");
    assert.equal(merged.pack.level, 3);
    assert.equal(merged.pack.omitOriginalDocuments, true);
    assert.equal(merged.parser.liteparse?.maxPages, 42);
    assert.equal(merged.parser.engine, "liteparse");
  });
});
