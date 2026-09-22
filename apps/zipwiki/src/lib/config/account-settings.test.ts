import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { DEFAULT_ACCOUNT_SETTINGS } from "@zipwiki/api-client";
import { accountSettingsToConfigInput } from "./account-settings-overlay.js";
import { loadZipwikiConfig } from "./load.js";
import { onboardingToAccountPatch } from "./migrate-onboarding.js";

describe("account settings merge", () => {
  it("accountSettingsToConfigInput maps pack/parser/okf", () => {
    const overlay = accountSettingsToConfigInput({
      ...DEFAULT_ACCOUNT_SETTINGS,
      pack: {
        ...DEFAULT_ACCOUNT_SETTINGS.pack,
        compression: "store",
        level: 0,
      },
      parser: {
        ...DEFAULT_ACCOUNT_SETTINGS.parser,
        engine: "llamaparse",
        mode: "fixed",
      },
    });
    assert.equal(overlay.pack?.compression, "store");
    assert.equal(overlay.parser?.engine, "llamaparse");
  });

  it("project file wins over account; CLI wins over project", () => {
    const dir = mkdtempSync(join(tmpdir(), "zipwiki-cfg-"));
    writeFileSync(
      join(dir, "zipwiki.config.json"),
      JSON.stringify({
        pack: { compression: "deflate", omitOriginalDocuments: true },
      }),
    );
    const account = accountSettingsToConfigInput({
      ...DEFAULT_ACCOUNT_SETTINGS,
      pack: {
        ...DEFAULT_ACCOUNT_SETTINGS.pack,
        compression: "store",
        level: 1,
        omitOriginalDocuments: false,
      },
    });
    const { config } = loadZipwikiConfig(
      {
        configPath: join(dir, "zipwiki.config.json"),
        accountOverlay: account,
        omitOriginalDocuments: false,
      },
      dir,
    );
    assert.equal(config.pack.compression, "deflate");
    assert.equal(config.pack.omitOriginalDocuments, false);
  });

  it("account LlamaParse wins over a project file that pins LiteParse", () => {
    const dir = mkdtempSync(join(tmpdir(), "zipwiki-cfg-parser-"));
    writeFileSync(
      join(dir, "zipwiki.config.json"),
      JSON.stringify({ parser: { engine: "liteparse", mode: "fixed" } }),
    );
    const account = accountSettingsToConfigInput({
      ...DEFAULT_ACCOUNT_SETTINGS,
      parseCredential: "llama",
      parser: {
        ...DEFAULT_ACCOUNT_SETTINGS.parser,
        engine: "llamaparse",
        mode: "fixed",
      },
    });
    const fromAccount = loadZipwikiConfig(
      {
        configPath: join(dir, "zipwiki.config.json"),
        accountOverlay: account,
      },
      dir,
    );
    assert.equal(fromAccount.config.parser.engine, "llamaparse");

    const fromFlag = loadZipwikiConfig(
      {
        configPath: join(dir, "zipwiki.config.json"),
        accountOverlay: account,
        parserEngine: "liteparse",
      },
      dir,
    );
    assert.equal(fromFlag.config.parser.engine, "liteparse");
  });

  it("onboardingToAccountPatch maps local defaults", () => {
    const patch = onboardingToAccountPatch({
      compression: "deflate",
      level: 5,
      recurse: true,
      omitOriginalDocuments: false,
      useAi: false,
      parseCredential: "local",
      okfCredential: "local",
    });
    assert.equal(patch.pack?.compression, "deflate");
    assert.equal(patch.pack?.recurse, true);
    assert.equal(patch.okf?.useAi, false);
    assert.equal(patch.parseCredential, "local");
  });
});
