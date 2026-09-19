import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LIBREOFFICE_INSTALL_HINT,
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
