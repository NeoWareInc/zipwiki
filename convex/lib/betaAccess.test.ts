import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  capacityMessage,
  CAPACITY_TITLE,
  INVITE_ONLY_MESSAGE,
  INVITE_ONLY_TITLE,
  resolveBetaAccessMode,
  resolveBetaUserLimit,
} from "./betaAccess.js";

describe("resolveBetaAccessMode", () => {
  it("honors BETA_ACCESS_MODE", () => {
    assert.equal(
      resolveBetaAccessMode({ BETA_ACCESS_MODE: "invite" } as NodeJS.ProcessEnv),
      "invite",
    );
    assert.equal(
      resolveBetaAccessMode({ BETA_ACCESS_MODE: "open" } as NodeJS.ProcessEnv),
      "open",
    );
  });

  it("defaults from SITE_URL when unset", () => {
    assert.equal(
      resolveBetaAccessMode({
        SITE_URL: "https://dev.zipwiki.ai",
      } as NodeJS.ProcessEnv),
      "invite",
    );
    assert.equal(
      resolveBetaAccessMode({
        SITE_URL: "https://zipwiki.ai",
        WEB_ORIGIN: "https://zipwiki.ai,http://localhost:5173",
      } as NodeJS.ProcessEnv),
      "open",
    );
  });
});

describe("resolveBetaUserLimit", () => {
  it("defaults to 500", () => {
    assert.equal(resolveBetaUserLimit({} as NodeJS.ProcessEnv), 500);
  });

  it("parses BETA_USER_LIMIT", () => {
    assert.equal(
      resolveBetaUserLimit({ BETA_USER_LIMIT: "100" } as NodeJS.ProcessEnv),
      100,
    );
  });
});

describe("messages", () => {
  it("names invite-only and capacity clearly", () => {
    assert.match(INVITE_ONLY_TITLE, /invite-only/i);
    assert.match(INVITE_ONLY_MESSAGE, /invited/i);
    assert.match(CAPACITY_TITLE, /capacity/i);
    assert.match(capacityMessage(500), /500/);
  });
});
