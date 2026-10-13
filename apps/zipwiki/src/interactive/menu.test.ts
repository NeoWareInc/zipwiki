import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  archivesInDir,
  formatMenuAccountStatus,
  formatOkfEnrichmentPrompt,
  mainMenuChoices,
  suggestedZipwikiPath,
} from "./menu.js";

describe("interactive menu", () => {
  it("keeps Quit on the menu and offers add when an archive is present", () => {
    const bare = mainMenuChoices([]);
    assert.equal(bare[0]?.label, "Create a new archive");
    assert.equal(bare.at(-1)?.value, "quit");
    assert.equal(
      bare.some((choice) => choice.label.startsWith("Add files")),
      false,
    );

    const withArchive = mainMenuChoices(["notes.zipwiki"]);
    assert.equal(withArchive[1]?.label, "Add files to notes.zipwiki");
    assert.equal(withArchive.at(-1)?.value, "quit");
  });

  it("names a new archive after the folder and finds archives in a directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "zipwiki-menu-"));
    const source = join(dir, "Medical PDFs");
    mkdirSync(source);
    writeFileSync(join(dir, "notes.zipwiki"), "");
    writeFileSync(join(dir, "skip.txt"), "");
    assert.equal(
      suggestedZipwikiPath(source, dir),
      join(dir, "Medical-PDFs.zipwiki"),
    );
    assert.deepEqual(archivesInDir(dir), ["notes.zipwiki"]);
  });

  it("states the account and credits, or how to continue signed out", () => {
    assert.equal(
      formatMenuAccountStatus({
        signedIn: true,
        email: "ada@example.com",
        creditsRemaining: 1350,
      }),
      "Signed in as ada@example.com · 1,350 ZipWiki credits",
    );
    assert.match(
      formatMenuAccountStatus({ signedIn: true, creditsUnlimited: true }),
      /ZipWiki credits unlimited/,
    );
    assert.match(
      formatMenuAccountStatus({ signedIn: false }),
      /zipwiki login/,
    );
    assert.match(
      formatMenuAccountStatus({ signedIn: false }),
      /without an account/,
    );
  });

  it("defaults to AI OKF when credits or a local key exist", () => {
    const withCredits = formatOkfEnrichmentPrompt({
      signedIn: true,
      creditsRemaining: 1350,
      hasLocalAi: false,
    });
    assert.equal(withCredits.initialValue, true);
    assert.match(withCredits.message, /accurate OKF/);
    assert.match(withCredits.message, /ZipWiki credits/);

    const local = formatOkfEnrichmentPrompt({
      signedIn: false,
      hasLocalAi: true,
    });
    assert.equal(local.initialValue, true);
    assert.match(local.message, /local AI key/);

    const unavailable = formatOkfEnrichmentPrompt({
      signedIn: false,
      hasLocalAi: false,
    });
    assert.equal(unavailable.initialValue, false);
    assert.match(unavailable.message, /no ZipWiki credits or local AI/);

    const empty = formatOkfEnrichmentPrompt({
      signedIn: true,
      creditsRemaining: 0,
      hasLocalAi: false,
    });
    assert.equal(empty.initialValue, false);
  });
});