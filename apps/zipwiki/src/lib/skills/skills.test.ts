import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { resolveSkills } from "@zipwiki/skills";
import {
  buildNeoZipManifest,
  writeNzipCollectionBundle,
  listZipEntries,
  readZipEntryVerified,
} from "../archive/index.js";
import { buildCatalog, openPackage } from "../access/index.js";
import { isOkfConceptEntryPath } from "../skills/package.js";
import {
  renderQueryHintsMarkdown,
  writeQueryHintsToStage,
  collectStageSkillFiles,
} from "../skills/query-hints.js";

describe("skills wiring", () => {
  it("excludes wiki/skills from OKF concept paths", () => {
    assert.equal(
      isOkfConceptEntryPath("wiki/skills/query-hints.md", "wiki/okf/"),
      false,
    );
    assert.equal(
      isOkfConceptEntryPath("wiki/okf/deed.md", "wiki/okf/"),
      true,
    );
    assert.equal(
      isOkfConceptEntryPath("wiki/okf/index.md", "wiki/okf/"),
      false,
    );
  });

  it("renderQueryHintsMarkdown is a query skill", () => {
    const md = renderQueryHintsMarkdown({
      digest: "Test package",
      documents: [{ path: "deed.pdf", title: "Warranty Deed", type: "Deed" }],
    });
    assert.match(md, /kind: query/);
    assert.match(md, /Warranty Deed/);
  });

  it("pack embeds query-hints and open lists skills", () => {
    const dir = mkdtempSync(join(tmpdir(), "zipwiki-skills-"));
    const src = join(dir, "note.txt");
    writeFileSync(src, "Hello skills test\n");
    const stage = join(dir, "stage");
    mkdirSync(stage, { recursive: true });
    writeQueryHintsToStage(stage, {
      digest: "Hello skills",
      documents: [{ path: "note.txt", title: "Note" }],
    });
    const skillFiles = collectStageSkillFiles(stage);
    assert.ok(skillFiles.some((f) => f.name === "query-hints.md"));

    const out = join(dir, "pkg.zipwiki");
    writeNzipCollectionBundle({
      outputPath: out,
      digest: "Hello skills",
      members: [
        {
          originalPath: src,
          originalName: "note.txt",
          structuredMarkdown: "# Note\n\nHello skills test\n",
        },
      ],
      okf: {
        files: [
          {
            name: "note.md",
            data: "---\ntitle: Note\ntype: Document\ndescription: A note\n---\n",
          },
        ],
      },
      skills: { files: skillFiles },
    });

    const names = listZipEntries(out).map((e) => e.name);
    assert.ok(names.includes("wiki/skills/query-hints.md"));
    const hints = readZipEntryVerified(out, "wiki/skills/query-hints.md")
      .data.toString("utf8");
    assert.match(hints, /kind: query/);

    const catalog = buildCatalog(out);
    assert.equal(catalog.conceptCount, 1);
    assert.ok(catalog.skills);
    assert.ok(catalog.skills.base.some((s) => s.name.includes("query")));
    assert.ok(catalog.skills.package.some((s) => s.name === "query-hints"));

    const opened = openPackage(out);
    assert.ok(opened.skills.base.length >= 1);
    assert.ok(opened.skills.package.some((s) => s.name === "query-hints"));
    assert.equal(opened.okf.conceptCount, 1);
  });

  it("--skills path replaces built-in in catalog", () => {
    const dir = mkdtempSync(join(tmpdir(), "zipwiki-skills-rep-"));
    const src = join(dir, "a.txt");
    writeFileSync(src, "a\n");
    const skill = join(dir, "custom-query.md");
    writeFileSync(
      skill,
      "---\nname: custom-query\ndescription: Custom\nkind: query\n---\n\nCUSTOM_QUERY_MARKER\n",
    );
    const out = join(dir, "pkg.zipwiki");
    writeNzipCollectionBundle({
      outputPath: out,
      members: [
        {
          originalPath: src,
          originalName: "a.txt",
          structuredMarkdown: "# A\n",
        },
      ],
    });
    const catalog = buildCatalog(out, { skillsPath: skill });
    assert.equal(catalog.skills?.replaced, true);
    assert.ok(
      catalog.skills?.base.some((s) => s.markdown.includes("CUSTOM_QUERY_MARKER")),
    );
    assert.ok(
      !catalog.skills?.base.some((s) =>
        s.markdown.includes("open → search → read_okf"),
      ),
    );
  });

  it("buildNeoZipManifest sets ai.skills when files present", () => {
    const manifest = buildNeoZipManifest({
      primaries: [{ path: "a.txt", hasParsed: true }],
      skills: {
        files: [{ name: "query-hints.md", data: "# hints\n" }],
      },
    });
    assert.equal(manifest.ai?.skills?.present, true);
    assert.equal(manifest.ai?.skills?.root, "wiki/skills/");
    assert.deepEqual(manifest.ai?.skills?.files, ["wiki/skills/query-hints.md"]);
  });

  it("enrichment resolveSkills uses built-in by default", () => {
    const resolved = resolveSkills({ kind: "enrichment" });
    assert.equal(resolved.replaced, false);
    assert.match(resolved.text, /OKF enrichment|Open Knowledge Format/i);
  });
});
