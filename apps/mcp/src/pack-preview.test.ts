import assert from "node:assert/strict";
import {
  closeSync,
  ftruncateSync,
  mkdtempSync,
  openSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  LARGE_REMOTE_PARSE_BYTES,
  formatPackCliCommand,
  formatPackPlanDisplay,
  isPackPreviewOnly,
  resolvePackPlanPreview,
  shellQuote,
} from "./pack-preview.js";
import { pack } from "./handlers.js";

describe("resolvePackPlanPreview", () => {
  it("builds a markdown table plan and CLI for chat confirmation", () => {
    const dir = mkdtempSync(join(tmpdir(), "zipwiki-mcp-preview-"));
    const source = join(dir, "big.pdf");
    const fd = openSync(source, "w");
    ftruncateSync(fd, LARGE_REMOTE_PARSE_BYTES);
    closeSync(fd);

    const preview = resolvePackPlanPreview({
      source,
      parser: "llamaparse",
      parseCredential: "zipwiki",
    });

    assert.equal(preview.status, "preview");
    assert.equal(preview.awaitingHumanApproval, true);
    assert.match(preview.cliCommand, /^zipwiki pack --yes/);
    assert.match(preview.cliCommand, /--parser llamaparse/);
    assert.match(preview.displayForUser, /ZipWiki pack plan/);
    assert.match(preview.displayForUser, /\| Source \|/);
    assert.match(preview.displayForUser, /CLI/);
    assert.match(preview.agentInstruction, /STOP/);
    assert.ok(
      preview.warnings.some((w) => /413|Payload Too Large|large/i.test(w)),
    );
  });

  it("forces local credential when parser is liteparse", () => {
    const dir = mkdtempSync(join(tmpdir(), "zipwiki-mcp-preview-"));
    const source = join(dir, "note.txt");
    writeFileSync(source, "hello\n");

    const preview = resolvePackPlanPreview({
      source,
      parser: "liteparse",
      parseCredential: "zipwiki",
    });

    assert.equal(preview.plan.parser, "liteparse");
    assert.equal(preview.plan.parseCredential, "local");
    assert.match(preview.cliCommand, /--parser liteparse/);
  });

  it("shell-quotes paths with spaces", () => {
    assert.equal(shellQuote("plain"), "plain");
    assert.equal(shellQuote("a b"), "'a b'");
    const cmd = formatPackCliCommand({
      source: "/tmp/my docs",
      sourceBytes: 1,
      fileCount: 1,
      output: "/tmp/out.zipwiki",
      accountEmail: null,
      parser: "liteparse",
      parseCredential: "local",
      llamaTier: null,
      okf: "ai",
      omitOriginalDocuments: true,
      recurse: false,
      noOcr: false,
      okfProfile: "auto",
      origins: null,
      originPattern: null,
      originUrlTemplate: null,
      originFile: false,
      originDrive: false,
    });
    assert.match(cmd, /'\/tmp\/my docs'/);
  });

  it("formatPackPlanDisplay is a markdown table", () => {
    const text = formatPackPlanDisplay(
      {
        source: "/tmp/src",
        sourceBytes: 100,
        fileCount: 2,
        output: "/tmp/out.zipwiki",
        accountEmail: "a@b.com",
        parser: "liteparse",
        parseCredential: "local",
        llamaTier: null,
        okf: "fallback",
        omitOriginalDocuments: false,
        recurse: false,
        noOcr: false,
        okfProfile: "auto",
        origins: null,
        originPattern: null,
        originUrlTemplate: null,
        originFile: false,
        originDrive: false,
      },
      ["sample warning"],
      "zipwiki pack --yes /tmp/src",
    );
    assert.match(text, /\| Parser \| liteparse/);
    assert.match(text, /sample warning/);
    assert.match(text, /Reply \*\*yes\*\*/);
  });

  it("defaults to preview; confirm:true is the pack path", () => {
    assert.equal(isPackPreviewOnly({ source: "x" }), true);
    assert.equal(isPackPreviewOnly({ source: "x", previewOnly: true }), true);
    assert.equal(isPackPreviewOnly({ source: "x", confirm: false }), true);
    assert.equal(isPackPreviewOnly({ source: "x", confirm: true }), false);
  });
});

describe("pack human gate", () => {
  it("returns the markdown table on first call (no confirm)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zipwiki-mcp-pack-preview-"));
    const source = join(dir, "note.txt");
    writeFileSync(source, "hello\n");

    const res = await pack({ source, parser: "liteparse" });
    assert.equal(res.isError, undefined);
    const body = JSON.parse(res.content[0]?.text ?? "{}") as {
      status?: string;
      displayForUser?: string;
      cliCommand?: string;
      awaitingHumanApproval?: boolean;
    };
    assert.equal(body.status, "preview");
    assert.equal(body.awaitingHumanApproval, true);
    assert.match(body.displayForUser ?? "", /ZipWiki pack plan/);
    assert.match(body.cliCommand ?? "", /zipwiki pack --yes/);
  });

  it("rejects confirm without humanApproved and still shows the table", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zipwiki-mcp-pack-need-human-"));
    const source = join(dir, "note.txt");
    writeFileSync(source, "hello\n");

    const res = await pack({
      source,
      parser: "liteparse",
      confirm: true,
    });
    assert.equal(res.isError, true);
    const body = JSON.parse(res.content[0]?.text ?? "{}") as {
      code?: string;
      displayForUser?: string;
    };
    assert.equal(body.code, "pack_needs_human_approval");
    assert.match(body.displayForUser ?? "", /\| Source \|/);
  });
});
