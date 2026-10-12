import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ZIPWIKI_VERSION_DATE,
  cliQuietRequested,
  formatZipwikiBanner,
  printZipwikiBanner,
} from "./banner.js";

describe("startup banner", () => {
  it("matches the NeoZip header shape", () => {
    const text = formatZipwikiBanner("0.1.0");
    assert.equal(
      text,
      `ZipWiki Version: 0.1.0 beta (${ZIPWIKI_VERSION_DATE})\nCopyright © 2026 by NeoWare Inc, All rights reserved.\n`,
    );
    assert.equal(
      formatZipwikiBanner("0.1.0", ZIPWIKI_VERSION_DATE, "ZipWiki MCP"),
      `ZipWiki MCP Version: 0.1.0 beta (${ZIPWIKI_VERSION_DATE})\nCopyright © 2026 by NeoWare Inc, All rights reserved.\n`,
    );
  });

  it("treats -q and --quiet as quiet", () => {
    assert.equal(cliQuietRequested(["zipwiki", "pack", "-q"]), true);
    assert.equal(cliQuietRequested(["zipwiki", "--quiet", "open"]), true);
    assert.equal(cliQuietRequested(["zipwiki", "open", "wiki.zipwiki"]), false);
  });

  it("prints unless a quiet flag is set", () => {
    const lines: string[] = [];
    const log = (line: string) => {
      lines.push(line);
    };
    printZipwikiBanner(["zipwiki", "open"], log, "0.1.0");
    assert.equal(lines.length, 1);
    assert.match(lines[0] ?? "", /^ZipWiki Version: 0\.1\.0 beta /);
    assert.match(lines[0] ?? "", /Copyright © 2026 by NeoWare Inc/);

    printZipwikiBanner(["zipwiki-mcp", "--help"], log, "0.1.0", "ZipWiki MCP");
    assert.match(lines[1] ?? "", /^ZipWiki MCP Version: 0\.1\.0 beta /);
    assert.equal(lines.length, 2);

    printZipwikiBanner(["zipwiki", "pack", "--quiet"], log, "0.1.0");
    printZipwikiBanner(["zipwiki", "-q"], log, "0.1.0");
    assert.equal(lines.length, 2);
  });
});
