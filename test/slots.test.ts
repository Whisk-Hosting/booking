import assert from "node:assert/strict";
import { test } from "node:test";
import { byDate, choosePerson, freeSlots, type Person, type Rules } from "../src/slots.js";
import { instantOf, fmtTime } from "../src/time.js";

const NY = "America/New_York";
const rules: Rules = { tz: NY, minNoticeMinutes: 0, windowDays: 60, stepMinutes: 30 };
// Friday 9 October 2026, 7 am in New York.
const now = instantOf("2026-10-09", 7 * 60, NY);
const at = (date: string, hhmm: string) => instantOf(date, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), NY);
const times = (slots: { start: number }[]) => slots.map((s) => fmtTime(s.start, NY));

const ana: Person = { id: 1, hours: [{ weekday: 5, start: 9 * 60, end: 12 * 60 }], blocked: [] };

test("the planner, case by case", () => {
  const cases: { name: string; people: Person[]; service?: { duration: number; bufferAfter: number }; rules?: Partial<Rules>; now?: number; want: string[] }[] = [
    { name: "every step that fits in the shift", people: [ana], want: ["9:00 am", "9:30 am", "10:00 am", "10:30 am", "11:00 am", "11:30 am"] },
    { name: "a long service stops early", people: [ana], service: { duration: 90, bufferAfter: 0 }, want: ["9:00 am", "9:30 am", "10:00 am", "10:30 am"] },
    { name: "a booking blocks what overlaps it", people: [{ ...ana, blocked: [{ start: at("2026-10-09", "10:00"), end: at("2026-10-09", "11:00") }] }], want: ["9:00 am", "9:30 am", "11:00 am", "11:30 am"] },
    { name: "the gap after must be clear too", people: [{ ...ana, blocked: [{ start: at("2026-10-09", "10:00"), end: at("2026-10-09", "11:00") }] }], service: { duration: 30, bufferAfter: 15 }, want: ["9:00 am", "11:00 am", "11:30 am"] },
    { name: "notice hides times too soon", people: [ana], rules: { minNoticeMinutes: 180 }, want: ["10:00 am", "10:30 am", "11:00 am", "11:30 am"] },
    { name: "a past start is never offered", people: [ana], now: at("2026-10-09", "10:10"), want: ["10:30 am", "11:00 am", "11:30 am"] },
    { name: "a split shift skips the gap", people: [{ id: 1, hours: [{ weekday: 5, start: 9 * 60, end: 10 * 60 }, { weekday: 5, start: 13 * 60, end: 14 * 60 }], blocked: [] }], want: ["9:00 am", "9:30 am", "1:00 pm", "1:30 pm"] },
    { name: "a day off has nothing", people: [{ id: 1, hours: [{ weekday: 4, start: 540, end: 720 }], blocked: [] }], want: [] },
    { name: "a 15-minute step", people: [{ id: 1, hours: [{ weekday: 5, start: 540, end: 600 }], blocked: [] }], rules: { stepMinutes: 15 }, want: ["9:00 am", "9:15 am", "9:30 am"] },
    { name: "busy all day in their own calendar", people: [{ ...ana, blocked: [{ start: at("2026-10-09", "00:00"), end: at("2026-10-10", "00:00") }] }], want: [] },
  ];
  for (const c of cases) {
    const slots = freeSlots(c.service ?? { duration: 30, bufferAfter: 0 }, c.people, { ...rules, ...c.rules }, c.now ?? now, "2026-10-09", "2026-10-09");
    assert.deepEqual(times(slots), c.want, c.name);
  }
});

test("the booking window ends the list", () => {
  const every = { id: 1, hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: 540, end: 600 })), blocked: [] };
  const slots = freeSlots({ duration: 60, bufferAfter: 0 }, [every], { ...rules, windowDays: 3 }, now, "2026-10-09", "2026-10-20");
  assert.deepEqual([...byDate(slots, NY).keys()], ["2026-10-09", "2026-10-10", "2026-10-11"]);
});

test("Any available lists everyone free and picks the least busy", () => {
  const ben: Person = { id: 2, hours: [{ weekday: 5, start: 10 * 60, end: 12 * 60 }], blocked: [] };
  const slots = freeSlots({ duration: 60, bufferAfter: 0 }, [ana, ben], rules, now, "2026-10-09", "2026-10-09");
  assert.deepEqual(slots.map((s) => [fmtTime(s.start, NY), s.people]), [["9:00 am", [1]], ["9:30 am", [1]], ["10:00 am", [1, 2]], ["10:30 am", [1, 2]], ["11:00 am", [1, 2]]]);
  assert.equal(choosePerson([1, 2], new Map([[1, 3], [2, 1]])), 2);
  assert.equal(choosePerson([2, 1], new Map()), 1);
  assert.equal(choosePerson([], new Map()), undefined);
});

test("a visitor in Tokyo sees New York's morning that night and into the next day", () => {
  const slots = freeSlots({ duration: 30, bufferAfter: 0 }, [ana], rules, now, "2026-10-09", "2026-10-09");
  const tokyo = byDate(slots, "Asia/Tokyo");
  assert.deepEqual([...tokyo.keys()], ["2026-10-09", "2026-10-10"]);
  assert.equal(fmtTime(tokyo.get("2026-10-09")![0].start, "Asia/Tokyo"), "10:00 pm");
  assert.equal(fmtTime(tokyo.get("2026-10-10")![0].start, "Asia/Tokyo"), "12:00 am");
});
