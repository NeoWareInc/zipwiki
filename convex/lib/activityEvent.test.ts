import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activityEventFields, omitUndefined } from "./activityEvent.js";

describe("activity events", () => {
  it("omits filename and bytes on pack_start", () => {
    const fields = activityEventFields({
      type: "pack_start",
      engine: "pack",
      status: "success",
      pages: 5,
      createId: "create-1",
    });
    assert.deepEqual(fields, {
      type: "pack_start",
      status: "success",
      engine: "pack",
      pages: 5,
      createId: "create-1",
    });
    assert.equal("filename" in fields, false);
    assert.equal("bytes" in fields, false);
    assert.equal(Object.values(fields).includes(undefined as never), false);
  });

  it("keeps pack_end totals that are already on the usage event", () => {
    const fields = activityEventFields({
      type: "pack_end",
      engine: "pack",
      filename: "florida-laws-failed.zipwiki",
      bytes: 532192,
      pages: 5,
      creditCost: 5,
      llamaCredits: 2808,
      okfCount: 5,
    });
    assert.equal(fields.creditCost, 5);
    assert.equal(fields.llamaCredits, 2808);
    assert.equal(fields.okfCount, 5);
    assert.equal(fields.bytes, 532192);
  });

  it("drops explicit undefined before a Convex call", () => {
    const args = omitUndefined({
      accountId: "acc",
      type: "pack_start",
      engine: "pack",
      filename: undefined,
      bytes: undefined,
      pages: 5,
    });
    assert.deepEqual(args, {
      accountId: "acc",
      type: "pack_start",
      engine: "pack",
      pages: 5,
    });
  });
});
