import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dosDateTimeToUnixSeconds } from "./zip";

describe("dosDateTimeToUnixSeconds", () => {
  it("decodes a known MS-DOS date/time", () => {
    // 2024-06-15 14:30:00 → DOS fields
    const year = 2024 - 1980;
    const month = 6;
    const day = 15;
    const hours = 14;
    const minutes = 30;
    const seconds = 0;
    const dosDate = (year << 9) | (month << 5) | day;
    const dosTime = (hours << 11) | (minutes << 5) | (seconds / 2);
    const unix = dosDateTimeToUnixSeconds(dosTime, dosDate);
    const d = new Date(unix * 1000);
    assert.equal(d.getFullYear(), 2024);
    assert.equal(d.getMonth() + 1, 6);
    assert.equal(d.getDate(), 15);
    assert.equal(d.getHours(), 14);
    assert.equal(d.getMinutes(), 30);
    assert.equal(d.getSeconds(), 0);
  });

  it("returns 0 for an invalid month", () => {
    assert.equal(dosDateTimeToUnixSeconds(0, 0), 0);
  });
});
