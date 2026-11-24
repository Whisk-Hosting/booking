import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, fmtDay, fmtShortDay, fmtTime, instantOf, localDate, monthGrid, partsAt, parseClock } from "../src/time.js";

const NY = "America/New_York";

test("wall times in New York become the right instants, across daylight saving", () => {
  const cases: [string, number, string][] = [
    ["2026-07-15", 9 * 60, "2026-07-15T13:00:00.000Z"], // EDT, -4
    ["2026-12-15", 9 * 60, "2026-12-15T14:00:00.000Z"], // EST, -5
    // 8 Mar 2026: 2:00 jumps to 3:00. 2:30 does not exist and moves on by the gap.
    ["2026-03-08", 2 * 60 + 30, "2026-03-08T07:30:00.000Z"],
    ["2026-03-08", 3 * 60 + 30, "2026-03-08T07:30:00.000Z"],
    // 1 Nov 2026: 2:00 goes back to 1:00. 1:30 happens twice; the first is taken.
    ["2026-11-01", 1 * 60 + 30, "2026-11-01T05:30:00.000Z"],
    ["2026-11-01", 0, "2026-11-01T04:00:00.000Z"],
  ];
  for (const [date, minutes, iso] of cases) assert.equal(new Date(instantOf(date, minutes, NY)).toISOString(), iso, `${date} ${minutes}`);
});

test("an instant reads back as the same wall time", () => {
  for (const tz of [NY, "Europe/London", "America/New_York", "UTC", "Asia/Kolkata"])
    for (const date of ["2026-01-10", "2026-03-29", "2026-10-25", "2026-11-01"])
      for (const m of [0, 9 * 60 + 15, 23 * 60 + 45]) {
        const p = partsAt(instantOf(date, m, tz), tz);
        assert.equal(localDate(instantOf(date, m, tz), tz), date);
        assert.equal(p.minutes, m, `${tz} ${date} ${m}`);
      }
});

test("dates, clocks and the month grid", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(parseClock("09:30"), 570);
  assert.equal(parseClock("24:00"), 1440);
  assert.equal(parseClock("9:75"), null);
  assert.equal(parseClock("noon"), null);
  const grid = monthGrid("2026-10");
  assert.deepEqual(grid[0], [null, null, null, null, "2026-10-01", "2026-10-02", "2026-10-03"]);
  assert.ok(grid.every((w) => w.length === 7));
  assert.equal(fmtTime(instantOf("2026-10-09", 14 * 60 + 5, NY), NY), "2:05 pm");
  assert.equal(fmtTime(instantOf("2026-10-09", 9 * 60, NY), NY), "9:00 am");
  assert.equal(fmtDay(instantOf("2026-10-09", 9 * 60, NY), NY), "Friday, October 9");
  assert.equal(fmtShortDay(instantOf("2026-10-09", 9 * 60, NY), NY), "Fri, Oct 9");
});
