import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  isPackageSkillPath,
  loadBuiltInSkills,
  loadSkillsFromPath,
  resolveSkills,
  skillDocFromMarkdown,
} from "./index.js";

describe("@zipwiki/skills", () => {
  it("loads built-in enrichment and query skills", () => {
    const enrich = loadBuiltInSkills("enrichment");
    const query = loadBuiltInSkills("query");
    assert.equal(enrich.length, 1);
    assert.equal(query.length, 1);
    assert.match(enrich[0]!.body, /OKF/);
    assert.match(query[0]!.body, /Open sequence/i);
  });

  it("--skills path replaces built-in", () => {
    const dir = mkdtempSync(join(tmpdir(), "zw-skills-"));
    const file = join(dir, "custom-enrich.md");
    writeFileSync(
      file,
      "---\nname: custom-enrich\nkind: enrichment\n---\n\nCUSTOM_ENRICH_MARKER\n",
    );
    const resolved = resolveSkills({ kind: "enrichment", skillsPath: file });
    assert.equal(resolved.replaced, true);
    assert.match(resolved.text, /CUSTOM_ENRICH_MARKER/);
    assert.doesNotMatch(resolved.text, /TYPE MAPPING/i);
  });

  it("appends package skills after base", () => {
    const pkg = skillDocFromMarkdown(
      "---\nname: hints\nkind: query\n---\n\nPACKAGE_HINT\n",
      "wiki/skills/query-hints.md",
      "query",
    );
    assert.ok(pkg);
    const resolved = resolveSkills({
      kind: "query",
      packageSkills: [pkg!],
    });
    assert.equal(resolved.replaced, false);
    assert.match(resolved.text, /Open sequence/i);
    assert.match(resolved.text, /PACKAGE_HINT/);
  });

  it("detects package skill paths", () => {
    assert.equal(isPackageSkillPath("wiki/skills/query-hints.md"), true);
    assert.equal(isPackageSkillPath("wiki/okf/deed.md"), false);
  });

  it("loadSkillsFromPath rejects missing kind", () => {
    const dir = mkdtempSync(join(tmpdir(), "zw-skills-bad-"));
    writeFileSync(join(dir, "note.md"), "# no frontmatter kind\n");
    assert.throws(() => loadSkillsFromPath(dir, "enrichment"), /No enrichment/);
  });
});
