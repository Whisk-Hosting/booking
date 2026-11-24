import assert from "node:assert/strict";
import { test } from "node:test";
import { busyTimes, calendar, googleLink, parseRule } from "../src/ics.js";
import { fmtTime, instantOf, localDate } from "../src/time.js";

const NY = "America/New_York";
const from = instantOf("2026-10-05", 0, NY);
const to = instantOf("2026-10-26", 0, NY);
const ical = (...events: string[]) => ["BEGIN:VCALENDAR", ...events.map((e) => `BEGIN:VEVENT\r\n${e}\r\nEND:VEVENT`), "END:VCALENDAR"].join("\r\n");
const label = (i: { start: number; end: number }) => `${localDate(i.start, NY)} ${fmtTime(i.start, NY)}–${fmtTime(i.end, NY)}`;

test("busy times from a calendar address, case by case", () => {
  const cases: { name: string; text: string; want: string[] }[] = [
    { name: "one event in UTC", text: ical("DTSTART:20261009T130000Z\r\nDTEND:20261009T140000Z\r\nSUMMARY:x"), want: ["2026-10-09 9:00 am–10:00 am"] },
    { name: "a zoned event", text: ical("DTSTART;TZID=America/New_York:20261009T140000\r\nDTEND;TZID=America/New_York:20261009T150000"), want: ["2026-10-09 2:00 pm–3:00 pm"] },
    { name: "a Windows zone name", text: ical("DTSTART;TZID=Eastern Standard Time:20261009T140000\r\nDURATION:PT30M"), want: ["2026-10-09 2:00 pm–2:30 pm"] },
    { name: "free time is ignored", text: ical("DTSTART:20261008T200000Z\r\nDTEND:20261008T210000Z\r\nTRANSP:TRANSPARENT"), want: [] },
    { name: "cancelled is ignored", text: ical("DTSTART:20261008T200000Z\r\nDTEND:20261008T210000Z\r\nSTATUS:CANCELLED"), want: [] },
    { name: "an all-day event takes the day", text: ical("DTSTART;VALUE=DATE:20261012\r\nDTEND;VALUE=DATE:20261013"), want: ["2026-10-12 12:00 am–12:00 am"] },
    { name: "outside the range is left out", text: ical("DTSTART:20261201T200000Z\r\nDTEND:20261201T210000Z"), want: [] },
    {
      name: "weekly repeats, with one skipped and one moved",
      text: ical(
        "DTSTART;TZID=America/New_York:20261006T090000\r\nDTEND;TZID=America/New_York:20261006T100000\r\nRRULE:FREQ=WEEKLY;COUNT=10\r\nEXDATE;TZID=America/New_York:20261013T090000\r\nUID:a",
        "DTSTART;TZID=America/New_York:20261020T110000\r\nDTEND;TZID=America/New_York:20261020T120000\r\nRECURRENCE-ID;TZID=America/New_York:20261020T090000\r\nUID:a",
      ),
      want: ["2026-10-06 9:00 am–10:00 am", "2026-10-20 11:00 am–12:00 pm"],
    },
    {
      name: "every other week on two days",
      text: ical("DTSTART;TZID=America/New_York:20261005T080000\r\nDTEND;TZID=America/New_York:20261005T083000\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH"),
      want: ["2026-10-05 8:00 am–8:30 am", "2026-10-08 8:00 am–8:30 am", "2026-10-19 8:00 am–8:30 am", "2026-10-22 8:00 am–8:30 am"],
    },
    {
      name: "daily until a date",
      text: ical("DTSTART;TZID=America/New_York:20261010T120000\r\nDTEND;TZID=America/New_York:20261010T130000\r\nRRULE:FREQ=DAILY;UNTIL=20261013T000000Z"),
      want: ["2026-10-10 12:00 pm–1:00 pm", "2026-10-11 12:00 pm–1:00 pm", "2026-10-12 12:00 pm–1:00 pm"],
    },
    { name: "a folded line is unfolded", text: ical("DTSTART:20261009T1300\r\n 00Z\r\nDTEND:20261009T140000Z"), want: ["2026-10-09 9:00 am–10:00 am"] },
  ];
  for (const c of cases) assert.deepEqual(busyTimes(c.text, NY, from, to).map(label).sort(), c.want, c.name);
});

test("a weekly repeat keeps its local time across daylight saving", () => {
  // The United States moved its clocks back on 1 November 2026.
  const text = ical("DTSTART;TZID=America/New_York:20261026T090000\r\nDTEND;TZID=America/New_York:20261026T093000\r\nRRULE:FREQ=WEEKLY;COUNT=3");
  assert.deepEqual(busyTimes(text, NY, from, instantOf("2026-11-16", 0, NY)).map(label), ["2026-10-26 9:00 am–9:30 am", "2026-11-02 9:00 am–9:30 am", "2026-11-09 9:00 am–9:30 am"]);
});

test("rules picked by position are not guessed", () => {
  assert.equal(parseRule("FREQ=MONTHLY;BYDAY=2TU", NY), undefined);
  assert.equal(parseRule("FREQ=YEARLY", NY), undefined);
  assert.deepEqual(parseRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH", NY), { freq: "WEEKLY", interval: 2, count: undefined, until: undefined, byDay: [1, 4] });
});

test("a calendar file escapes text and folds long lines", () => {
  const out = calendar("Brookside; Physical Therapy", [{ uid: "b1@x", start: Date.UTC(2026, 9, 8, 20), end: Date.UTC(2026, 9, 8, 21), title: "Massage, 45 min", description: "a".repeat(200) }], Date.UTC(2026, 9, 1));
  assert.match(out, /^BEGIN:VCALENDAR\r\n/);
  assert.match(out, /X-WR-CALNAME:Brookside\\; Physical Therapy\r\n/);
  assert.match(out, /SUMMARY:Massage\\, 45 min\r\n/);
  assert.match(out, /DTSTART:20261008T200000Z\r\n/);
  assert.ok(out.split("\r\n").every((l) => Buffer.byteLength(l) <= 75));
  assert.equal(out.replace(/\r\n /g, "").match(/DESCRIPTION:(a+)/)?.[1].length, 200);
});

test("the Google link carries the times in UTC", () => {
  const url = new URL(googleLink({ uid: "x", start: Date.UTC(2026, 9, 8, 20), end: Date.UTC(2026, 9, 8, 21), title: "Massage" }));
  assert.equal(url.searchParams.get("dates"), "20261008T200000Z/20261008T210000Z");
});
