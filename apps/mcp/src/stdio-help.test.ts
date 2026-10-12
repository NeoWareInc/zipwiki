import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatMcpInstallHelp, shouldShowMcpInstallHelp } from "./stdio-help.js";

describe("mcp install help", () => {
  it("shows help for a terminal and for --help", () => {
    assert.equal(shouldShowMcpInstallHelp([], true), true);
    assert.equal(shouldShowMcpInstallHelp(["--help"], false), true);
    assert.equal(shouldShowMcpInstallHelp(["-h"], false), true);
    assert.equal(shouldShowMcpInstallHelp([], false), false);
  });

  it("includes the client config and the install page", () => {
    const text = formatMcpInstallHelp();
    assert.match(text, /"command": "zipwiki-mcp"/);
    assert.match(text, /Windsurf/);
    assert.match(text, /Visual Studio Code/);
    assert.match(text, /Codex CLI/);
    assert.match(text, /Zed/);
    assert.match(text, /Goose/);
    assert.match(text, /https:\/\/zipwiki\.ai\/install/);
    assert.match(text, /zipwiki --help/);
  });
});
