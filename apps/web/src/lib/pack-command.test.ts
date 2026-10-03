import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AccountSettingsBody } from "@zipwiki/api-client";
import {
  applyAccountSettingsToPackBuilder,
  buildCliPackCommand,
  buildMcpPackArgs,
  buildMcpPackPrompt,
  defaultPackBuilderState,
  shellEscape,
  type PackBuilderState,
} from "./pack-command.js";

function state(partial: Partial<PackBuilderState> = {}): PackBuilderState {
  return { ...defaultPackBuilderState(), ...partial };
}

describe("shellEscape", () => {
  it("leaves safe paths unquoted", () => {
    assert.equal(shellEscape("./knowledge/docs"), "./knowledge/docs");
  });

  it("quotes paths with spaces", () => {
    assert.equal(shellEscape("My Docs/file.pdf"), "'My Docs/file.pdf'");
  });

  it("escapes single quotes", () => {
    assert.equal(shellEscape("it's.pdf"), `'it'\\''s.pdf'`);
  });
});

describe("buildCliPackCommand", () => {
  it("emits end-user defaults: zipwiki, knowledge/, AI OKF on, omit originals", () => {
    const cmd = buildCliPackCommand(state());
    assert.match(cmd, /^zipwiki pack/);
    assert.match(cmd, /pack \.\/knowledge /);
    assert.match(cmd, /-o \.\/knowledge\/my-docs\.zipwiki/);
    assert.match(cmd, / -r /);
    assert.match(cmd, /--omit-original/);
    assert.doesNotMatch(cmd, /--no-ai-okf/);
    assert.doesNotMatch(cmd, /--compression/);
    assert.doesNotMatch(cmd, /--level/);
    assert.doesNotMatch(cmd, /--okf-profile/);
  });

  it("includes CLI-only compression and level when non-default", () => {
    const cmd = buildCliPackCommand(
      state({ compression: "deflate", level: 3, omitOriginal: false }),
    );
    assert.match(cmd, /--compression deflate/);
    assert.match(cmd, /--level 3/);
    assert.doesNotMatch(cmd, /--omit-original/);
  });

  it("includes origin locator flags when set", () => {
    const cmd = buildCliPackCommand(
      state({
        originPattern: String.raw`Ch_(?<year>\d{4})-(?<chapter>\d+)`,
        originUrlTemplate: "https://host/{year}/{chapter}",
        originFile: true,
      }),
    );
    assert.match(cmd, /--origin-pattern '/);
    assert.match(
      cmd,
      /--origin-url-template 'https:\/\/host\/\{year\}\/\{chapter\}'/,
    );
    assert.match(cmd, /--origin-file/);
  });

  it("prefers --no-okf over --no-ai-okf", () => {
    const cmd = buildCliPackCommand(state({ noOkf: true, noAiOkf: true }));
    assert.match(cmd, /--no-okf/);
    assert.doesNotMatch(cmd, /--no-ai-okf/);
  });

  it("supports multiple sources and monorepo prefix", () => {
    const cmd = buildCliPackCommand(
      state({
        cliPrefix: "pnpm zipwiki --",
        sourcePaths: ["./a", "./b c"],
        recurse: true,
        noOcr: true,
        okfProfile: "book",
        noAiOkf: true,
      }),
    );
    assert.match(cmd, /^pnpm zipwiki -- pack/);
    assert.match(cmd, /\.\/a '\.\/b c'/);
    assert.match(cmd, / -r /);
    assert.match(cmd, /--no-ocr/);
    assert.match(cmd, /--no-ai-okf/);
    assert.match(cmd, /--okf-profile book/);
  });
});

describe("buildMcpPackArgs / prompt", () => {
  it("omits default noAiOkf and compression from MCP args", () => {
    const args = buildMcpPackArgs(
      state({
        compression: "deflate",
        level: 1,
        omitOriginal: true,
        recurse: true,
        noAiOkf: false,
      }),
    );
    assert.deepEqual(args, {
      source: "./knowledge",
      output: "./knowledge/my-docs.zipwiki",
      recurse: true,
    });
    assert.equal("noAiOkf" in args, false);
    assert.equal("compression" in args, false);
  });

  it("keeps the default prompt to paths only", () => {
    const prompt = buildMcpPackPrompt(state());
    assert.equal(
      prompt,
      'Using ZipWiki MCP, pack "./knowledge" into ./knowledge/my-docs.zipwiki.',
    );
  });

  it("mentions only overrides vs defaults", () => {
    const skipped = buildMcpPackPrompt(state({ noAiOkf: true, noOkf: false }));
    assert.equal(
      skipped,
      'Using ZipWiki MCP, pack "./knowledge" into ./knowledge/my-docs.zipwiki (skip AI OKF, then okf_enrich).',
    );

    const noOkf = buildMcpPackPrompt(state({ noOkf: true }));
    assert.equal(
      noOkf,
      'Using ZipWiki MCP, pack "./knowledge" into ./knowledge/my-docs.zipwiki (skip OKF entirely).',
    );

    const withOrigin = buildMcpPackPrompt(
      state({
        originUrlTemplate: "https://host/{id}",
        okfProfile: "book",
        recurse: false,
      }),
    );
    assert.equal(
      withOrigin,
      'Using ZipWiki MCP, pack "./knowledge" into ./knowledge/my-docs.zipwiki (do not recurse; okfProfile "book"; originUrlTemplate "https://host/{id}").',
    );
  });
});

describe("applyAccountSettingsToPackBuilder", () => {
  it("overlays pack fields and derives noAiOkf from okf.useAi", () => {
    const settings = {
      version: 1,
      parseCredential: "local",
      okfCredential: "local",
      parser: {},
      okf: { useAi: false },
      pack: {
        recurse: true,
        omitOriginalDocuments: false,
        noOcr: true,
        compression: "store",
        level: 0,
      },
    } satisfies AccountSettingsBody;
    const next = applyAccountSettingsToPackBuilder(state(), settings);
    assert.equal(next.recurse, true);
    assert.equal(next.omitOriginal, false);
    assert.equal(next.noOcr, true);
    assert.equal(next.compression, "store");
    assert.equal(next.level, 0);
    assert.equal(next.noAiOkf, true);

    const withAi = applyAccountSettingsToPackBuilder(state({ noAiOkf: true }), {
      ...settings,
      okf: { useAi: true },
    });
    assert.equal(withAi.noAiOkf, false);
  });
});
