import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isLibreOfficeMissingError,
  LIBREOFFICE_INSTALL_HINT,
  libreOfficeInstallCommand,
  withLibreOfficeHint,
} from "./libreoffice-hint.js";

describe("withLibreOfficeHint", () => {
  it("appends install hint for soffice errors", () => {
    const out = withLibreOfficeHint("soffice not found for docx conversion");
    assert.match(out, /LibreOffice/);
    assert.ok(out.includes(LIBREOFFICE_INSTALL_HINT));
  });

  it("leaves unrelated errors unchanged", () => {
    const msg = "tessdata missing";
    assert.equal(withLibreOfficeHint(msg), msg);
  });
});

describe("isLibreOfficeMissingError", () => {
  it("matches LiteParse missing-install messages", () => {
    assert.equal(
      isLibreOfficeMissingError(
        new Error(
          "conversion error: LibreOffice is not installed. Please install LibreOffice to convert office documents.",
        ),
      ),
      true,
    );
    assert.equal(isLibreOfficeMissingError(new Error("parse yield empty")), false);
  });
});

describe("libreOfficeInstallCommand", () => {
  it("returns brew on macOS", () => {
    const cmd = libreOfficeInstallCommand("darwin");
    assert.ok(cmd);
    assert.equal(cmd!.command, "brew");
    assert.match(cmd!.label, /libreoffice/);
  });
});
