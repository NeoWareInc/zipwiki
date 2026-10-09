import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  resetLibreOfficePromptSessionForTests,
  resolveLibreOfficeMissing,
} from "./libreoffice-prompt.js";

const MISSING =
  "conversion error: LibreOffice is not installed. Please install LibreOffice to convert office documents. On macOS: brew install --cask libreoffice";

describe("resolveLibreOfficeMissing", () => {
  beforeEach(() => {
    resetLibreOfficePromptSessionForTests();
  });

  it("ignores unrelated errors", async () => {
    const action = await resolveLibreOfficeMissing(new Error("tessdata missing"), {
      interactive: true,
    });
    assert.equal(action, "continue");
  });

  it("skips the prompt when quiet / yes / non-interactive", async () => {
    assert.equal(
      await resolveLibreOfficeMissing(new Error(MISSING), {
        interactive: true,
        quiet: true,
        promptChoice: async () => {
          throw new Error("should not prompt");
        },
      }),
      "continue",
    );
    assert.equal(
      await resolveLibreOfficeMissing(new Error(MISSING), {
        interactive: true,
        yes: true,
        promptChoice: async () => {
          throw new Error("should not prompt");
        },
      }),
      "continue",
    );
    assert.equal(
      await resolveLibreOfficeMissing(new Error(MISSING), {
        interactive: false,
        promptChoice: async () => {
          throw new Error("should not prompt");
        },
      }),
      "continue",
    );
  });

  it("continue skips further prompts in the session", async () => {
    let prompts = 0;
    const first = await resolveLibreOfficeMissing(new Error(MISSING), {
      interactive: true,
      filename: "a.docx",
      promptChoice: async () => {
        prompts += 1;
        return "continue";
      },
      log: () => {},
    });
    assert.equal(first, "continue");
    const second = await resolveLibreOfficeMissing(new Error(MISSING), {
      interactive: true,
      filename: "b.docx",
      promptChoice: async () => {
        prompts += 1;
        return "install";
      },
      log: () => {},
    });
    assert.equal(second, "continue");
    assert.equal(prompts, 1);
  });

  it("ignore persists and skips later prompts", async () => {
    let ignored = false;
    const first = await resolveLibreOfficeMissing(new Error(MISSING), {
      interactive: true,
      promptChoice: async () => "ignore",
      isIgnored: () => ignored,
      setIgnored: (v) => {
        ignored = v;
      },
      log: () => {},
    });
    assert.equal(first, "continue");
    assert.equal(ignored, true);
    resetLibreOfficePromptSessionForTests();
    const second = await resolveLibreOfficeMissing(new Error(MISSING), {
      interactive: true,
      isIgnored: () => ignored,
      promptChoice: async () => {
        throw new Error("should not prompt when ignored");
      },
    });
    assert.equal(second, "continue");
  });

  it("install success returns retry", async () => {
    const action = await resolveLibreOfficeMissing(new Error(MISSING), {
      interactive: true,
      promptChoice: async () => "install",
      runInstall: () => ({ ok: true }),
      log: () => {},
    });
    assert.equal(action, "retry");
  });

  it("cancel returns cancel", async () => {
    const action = await resolveLibreOfficeMissing(new Error(MISSING), {
      interactive: true,
      promptChoice: async () => "cancel",
      log: () => {},
    });
    assert.equal(action, "cancel");
  });

  it("cancel does not resume the gate and suppresses later prompts", async () => {
    const events: string[] = [];
    const gate = {
      waitForQuiet: async () => {
        events.push("wait");
      },
      resume: () => {
        events.push("resume");
      },
    };
    let prompts = 0;
    const first = await resolveLibreOfficeMissing(new Error(MISSING), {
      interactive: true,
      promptChoice: async () => {
        prompts += 1;
        return "cancel";
      },
      log: () => {},
      getGate: () => gate,
    });
    assert.equal(first, "cancel");
    assert.equal(events.includes("resume"), false);

    const second = await resolveLibreOfficeMissing(new Error(MISSING), {
      interactive: true,
      filename: "other.odt",
      promptChoice: async () => {
        prompts += 1;
        return "install";
      },
      log: () => {},
      getGate: () => gate,
    });
    assert.equal(second, "cancel");
    assert.equal(prompts, 1);
    assert.equal(events.includes("resume"), false);
  });

  it("coalesces concurrent prompts into one choice", async () => {
    let prompts = 0;
    const deps = {
      interactive: true as const,
      promptChoice: async () => {
        prompts += 1;
        await new Promise((r) => setTimeout(r, 20));
        return "continue" as const;
      },
      log: () => {},
      getGate: () => null,
    };
    const [a, b] = await Promise.all([
      resolveLibreOfficeMissing(new Error(MISSING), deps),
      resolveLibreOfficeMissing(new Error(MISSING), deps),
    ]);
    assert.equal(a, "continue");
    assert.equal(b, "continue");
    assert.equal(prompts, 1);
  });

  it("waits for the pipeline gate before prompting, then resumes", async () => {
    const events: string[] = [];
    let releaseQuiet!: () => void;
    const quietHold = new Promise<void>((r) => {
      releaseQuiet = r;
    });
    let waiting = 0;
    const gate = {
      waitForQuiet: async () => {
        events.push("wait");
        waiting += 1;
        await quietHold;
        events.push("quiet");
      },
      resume: () => {
        events.push("resume");
      },
    };

    const actionP = resolveLibreOfficeMissing(new Error(MISSING), {
      interactive: true,
      promptChoice: async () => {
        events.push("prompt");
        return "continue";
      },
      log: () => {},
      getGate: () => gate,
    });

    for (let i = 0; i < 20; i++) {
      if (waiting > 0) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    assert.equal(waiting, 1);
    assert.equal(events.includes("prompt"), false);
    releaseQuiet();
    assert.equal(await actionP, "continue");
    assert.deepEqual(events, ["wait", "quiet", "prompt", "resume"]);
  });
});
