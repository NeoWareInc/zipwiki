import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  DEFAULT_ZIPWIKI_CONFIG,
  loadZipwikiConfig,
  parseZipwikiConfigFile,
} from "./index.js";

describe("zipwiki config", () => {
  it("applies defaults when file is empty", () => {
    const cfg = parseZipwikiConfigFile({});
    assert.equal(cfg.parser, undefined);
    assert.equal(cfg.okf, undefined);
  });

  it("does not load a zipwiki.config.json unless --config points at it", () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-cfg-skip-"));
    writeFileSync(
      join(dir, "zipwiki.config.json"),
      JSON.stringify({ pack: { compression: "store", level: 0 } }),
    );
    const { config, configPath } = loadZipwikiConfig({}, dir);
    assert.equal(configPath, undefined);
    assert.equal(config.pack.compression, DEFAULT_ZIPWIKI_CONFIG.pack.compression);
  });

  it("merges an explicit config file over defaults", () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-cfg-"));
    writeFileSync(
      join(dir, "zipwiki.config.json"),
      JSON.stringify({
        parser: { engine: "llamaparse", mode: "auto" },
        okf: { useAi: false },
      }),
    );
    const { config, configPath } = loadZipwikiConfig(
      { configPath: join(dir, "zipwiki.config.json") },
      dir,
    );
    assert.ok(configPath?.endsWith("zipwiki.config.json"));
    assert.equal(config.parser.engine, "llamaparse");
    assert.equal(config.parser.mode, "auto");
    assert.equal(config.parser.escalate.enabled, true);
    assert.equal(config.okf.useAi, false);
    assert.equal(config.parser.llamaparse.tier, "cost_effective");
    assert.equal(config.pack.compression, DEFAULT_ZIPWIKI_CONFIG.pack.compression);
  });

  it("ignores deprecated pack.keepStage in project configs", () => {
    const cfg = parseZipwikiConfigFile({
      pack: { compression: "zstd", level: 3, keepStage: true },
    });
    assert.equal(cfg.pack?.compression, "zstd");
    assert.equal(cfg.pack?.level, 3);
    assert.equal(
      (cfg.pack as { keepStage?: boolean } | undefined)?.keepStage,
      undefined,
    );
  });

  it("lets CLI overrides win over file", () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-cfg-cli-"));
    writeFileSync(
      join(dir, "zipwiki.config.json"),
      JSON.stringify({ parser: { engine: "llamaparse" } }),
    );
    const { config } = loadZipwikiConfig(
      {
        configPath: join(dir, "zipwiki.config.json"),
        parserEngine: "liteparse",
        noAiOkf: true,
      },
      dir,
    );
    assert.equal(config.parser.engine, "liteparse");
    assert.equal(config.okf.useAi, false);
  });
});
