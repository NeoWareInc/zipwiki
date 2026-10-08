import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { writeNzipCollectionBundle } from "../archive/index.js";
import {
  askArchive,
  askFailureMessage,
  bundleAskExcerpts,
  formatAskReport,
  isIncompleteAskAnswer,
  resolveAskQuestion,
  type AskArchiveResult,
} from "./ask.js";

const dir = mkdtempSync(join(tmpdir(), "zipwiki-ask-"));
const deed = join(dir, "deed.pdf");
const pkg = join(dir, "sample.zipwiki");
writeFileSync(deed, "%PDF-1.1\n");
writeNzipCollectionBundle({
  outputPath: pkg,
  members: [
    {
      originalPath: deed,
      originalName: "deed.pdf",
      structuredMarkdown:
        "# Deed\n\nThe grantor conveyed the oak street parcel.\n",
    },
  ],
  okf: {
    version: "0.2",
    files: [
      {
        name: "deed.md",
        data: [
          "---",
          'title: "Deed"',
          "tags: [deed]",
          "sources:",
          "  - resource: ../parsed/deed.pdf.md",
          "---",
          "",
          "Concept for the parcel.",
          "",
        ].join("\n"),
      },
    ],
  },
});

function answerResponse(answer: string, status = 200): Response {
  return new Response(
    JSON.stringify({
      status: "answer",
      answer,
      model: "claude-haiku-5-5",
      creditsCharged: 2,
      creditsRemaining: 40,
      creditsUnlimited: false,
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

describe("ask bundle", () => {
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("puts passages before concept cards and stops at nine", () => {
    const passages = Array.from({ length: 6 }, (_, i) => ({
      path: `wiki/parsed/ch-${i}.md`,
      text: `passage ${i}`,
    }));
    const hits = Array.from({ length: 4 }, (_, i) => ({
      path: `wiki/okf/ch-${i}.md`,
      title: `Chapter ${i}`,
      kind: "okf" as const,
      text: `card ${i}`,
    }));
    const gaps = [
      { path: "missing.pdf", reason: "no extract" },
      { path: "other.pdf", reason: "no extract" },
    ];
    const excerpts = bundleAskExcerpts({ passages, hits, gaps });
    assert.equal(excerpts.length, 9);
    assert.deepEqual(
      excerpts.slice(0, 6).map((row) => row.kind),
      ["parsed", "parsed", "parsed", "parsed", "parsed", "parsed"],
    );
    assert.equal(excerpts[6]?.kind, "okf");
    assert.equal(excerpts.some((row) => row.kind === "gap"), false);
  });

  it("rejects a search preamble and maps hosted errors", () => {
    assert.equal(isIncompleteAskAnswer("Let me search the statute:"), true);
    assert.equal(isIncompleteAskAnswer("I'll look that up…"), true);
    assert.equal(isIncompleteAskAnswer("Trying the index:"), true);
    assert.equal(
      isIncompleteAskAnswer("The grantor conveyed the oak street parcel."),
      false,
    );
    assert.match(
      askFailureMessage("credits_exhausted"),
      /Credits are required to ask a question/,
    );
    assert.match(
      askFailureMessage("credits_locked"),
      /credits are locked/i,
    );
    assert.match(askFailureMessage("account_disabled"), /account is disabled/i);
    assert.match(
      askFailureMessage("anthropic_not_configured"),
      /not configured/,
    );
    assert.match(
      askFailureMessage("incomplete answer"),
      /stopped mid-search/,
    );
  });

  it("uses a command-line question, a terminal line, or an error", async () => {
    assert.equal(
      await resolveAskQuestion({
        question: "  who signed  ",
        isTTY: false,
        readLine: async () => {
          throw new Error("should not prompt");
        },
      }),
      "who signed",
    );
    assert.equal(
      await resolveAskQuestion({
        isTTY: true,
        readLine: async () => "  homestead  ",
      }),
      "homestead",
    );
    await assert.rejects(
      () =>
        resolveAskQuestion({
          isTTY: true,
          readLine: async () => "   ",
        }),
      /question is required/,
    );
    await assert.rejects(
      () =>
        resolveAskQuestion({
          isTTY: false,
          readLine: async () => "ignored",
        }),
      /run ask in a terminal/,
    );
  });

  it("prints credits, sources, passages, and gaps", () => {
    const result: AskArchiveResult = {
      answer: "The grantor conveyed the parcel.",
      reads: ["wiki/parsed/deed.pdf.md"],
      searches: [],
      sources: [
        { path: "wiki/parsed/deed.pdf.md", kind: "parsed" },
        { path: "wiki/okf/deed.md", kind: "okf" },
      ],
      passages: [
        {
          path: "wiki/parsed/deed.pdf.md",
          text: "oak street",
          truncated: false,
        },
      ],
      gaps: [{ path: "legacy.docx", reason: "no extract", originUri: "https://example.test/legacy" }],
      model: "claude-haiku-5-5",
      creditsCharged: 1,
      creditsRemaining: 12,
      creditsUnlimited: false,
    };
    const report = formatAskReport(result);
    assert.match(report, /Charged 1 credit · 12 remaining/);
    assert.match(report, /Also read wiki\/parsed\/deed\.pdf\.md/);
    assert.match(report, /wiki\/okf\/deed\.md  okf/);
    assert.match(report, /Passage: wiki\/parsed\/deed\.pdf\.md/);
    assert.match(report, /Gap: legacy\.docx — no extract Original: https:\/\/example\.test\/legacy/);
    assert.match(
      formatAskReport({ ...result, creditsUnlimited: true }),
      /Unlimited · no charge/,
    );
  });

  it("does not call the model when nothing matches", async () => {
    let called = 0;
    const result = await askArchive({
      package: pkg,
      question: "zzqq-no-such-term",
      apiUrl: "https://example.test",
      apiKey: "test",
      fetchImpl: async () => {
        called += 1;
        return answerResponse("should not run");
      },
    });
    assert.equal(called, 0);
    assert.equal(result.model, "");
    assert.match(result.answer, /No matching text was found/);
  });

  it("sends parsed passages before the concept card", async () => {
    let excerpts: Array<{ kind: string; path: string }> = [];
    const result = await askArchive({
      package: pkg,
      question: "parcel",
      apiUrl: "https://example.test",
      apiKey: "test",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as {
          excerpts: Array<{ kind: string; path: string }>;
        };
        excerpts = body.excerpts;
        return answerResponse("The grantor conveyed the oak street parcel.");
      },
    });
    const parsedAt = excerpts.findIndex(
      (row) => row.kind === "parsed" && row.path.includes("wiki/parsed/"),
    );
    const cardAt = excerpts.findIndex((row) => row.kind === "okf");
    assert.ok(parsedAt >= 0);
    assert.ok(cardAt > parsedAt);
    assert.match(result.answer, /oak street parcel/);
    assert.equal(result.sources[0]?.kind, "parsed");
  });

  it("rejects an answer that only announces a search", async () => {
    await assert.rejects(
      () =>
        askArchive({
          package: pkg,
          question: "parcel",
          apiUrl: "https://example.test",
          apiKey: "test",
          fetchImpl: async () => answerResponse("Let me search the deed:"),
        }),
      /stopped mid-search/,
    );
  });

  it("maps a credits error from the hosted turn", async () => {
    await assert.rejects(
      () =>
        askArchive({
          package: pkg,
          question: "parcel",
          apiUrl: "https://example.test",
          apiKey: "test",
          fetchImpl: async () =>
            new Response(JSON.stringify({ error: "credits_exhausted" }), {
              status: 402,
              headers: { "content-type": "application/json" },
            }),
        }),
      /Credits are required to ask a question/,
    );
  });
});
