import assert from "node:assert/strict";
import { test } from "node:test";
import { idOf, isKeyShape, keyFrom, pageOf, readHours, readInstant, readNewBooking, readPage, readPerson, readReschedule, readService, readStatus, readTimeOff, readWindow, bookingJson } from "../src/api-rules.js";
import type { BookingView } from "../src/model.js";

const KEY = "bkg_" + "a".repeat(32);
const headers = (h: Record<string, string>) => (n: string) => h[n];
const code = (r: { ok: boolean; problem?: { code: string } }) => (r.ok ? "ok" : r.problem!.code);

test("the key comes from any of the four places", () => {
  const basic = "Basic " + Buffer.from(`${KEY}:`).toString("base64");
  const cases: [string, Record<string, string>, string | undefined, string][] = [
    ["bearer", { authorization: `Bearer ${KEY}` }, undefined, KEY],
    ["bearer, any case", { authorization: `bearer   ${KEY}` }, undefined, KEY],
    ["basic, key as user", { authorization: basic }, undefined, KEY],
    ["x-api-key", { "x-api-key": KEY }, undefined, KEY],
    ["?token=", {}, KEY, KEY],
    ["bearer wins over the query", { authorization: `Bearer ${KEY}` }, "other", KEY],
    ["nothing", {}, undefined, ""],
  ];
  for (const [name, h, token, want] of cases) assert.equal(keyFrom(headers(h), token), want, name);
});

test("only keys this app could have made are looked up", () => {
  const cases: [string, boolean][] = [
    [KEY, true],
    ["bkg_" + "a".repeat(31), false],
    ["trn_" + "a".repeat(32), false],
    ["bkg_" + "a".repeat(31) + "!", false],
    ["", false],
  ];
  for (const [k, want] of cases) assert.equal(isKeyShape(k), want, k);
});

test("pages: limit and offset", () => {
  const cases: [string | undefined, string | undefined, string][] = [
    [undefined, undefined, "ok"],
    ["200", "0", "ok"],
    ["0", undefined, "LIMIT_INVALID"],
    ["201", undefined, "LIMIT_INVALID"],
    ["abc", undefined, "LIMIT_INVALID"],
    ["10", "-1", "OFFSET_INVALID"],
    ["10", "1.5", "OFFSET_INVALID"],
  ];
  for (const [l, o, want] of cases) assert.equal(code(readPage(l, o)), want, `${l} ${o}`);
  assert.deepEqual(readPage(undefined, undefined), { ok: true, value: { limit: 50, offset: 0 } });
  assert.deepEqual(pageOf([1, 2, 3], { limit: 2, offset: 4 }), { items: [1, 2], next_offset: 6 });
  assert.deepEqual(pageOf([1, 2], { limit: 2, offset: 4 }), { items: [1, 2], next_offset: null });
});

test("instants need a zone", () => {
  const cases: [unknown, number | undefined][] = [
    ["2026-11-02T09:00:00Z", Date.UTC(2026, 10, 2, 9)],
    ["2026-11-02T09:00:00.000-05:00", Date.UTC(2026, 10, 2, 14)],
    ["2026-11-02T09:00+0100", Date.UTC(2026, 10, 2, 8)],
    [Date.UTC(2026, 10, 2), Date.UTC(2026, 10, 2)],
    [String(Date.UTC(2026, 10, 2)), Date.UTC(2026, 10, 2)],
    ["2026-11-02T09:00:00", undefined],
    ["2026-11-02", undefined],
    ["soon", undefined],
    [1.5, undefined],
    [null, undefined],
  ];
  for (const [v, want] of cases) assert.equal(readInstant(v), want, String(v));
});

test("the availability window", () => {
  const now = Date.UTC(2026, 10, 1);
  const cases: [string | undefined, string | undefined, string][] = [
    [undefined, undefined, "ok"],
    ["2026-11-02T00:00:00Z", "2026-12-02T00:00:00Z", "ok"],
    ["2026-11-02T00:00:00Z", "2026-12-04T00:00:00Z", "WINDOW_TOO_LONG"],
    ["2026-11-02T00:00:00Z", "2026-11-01T00:00:00Z", "WINDOW_INVALID"],
    ["tomorrow", undefined, "START_TIME_INVALID"],
    [undefined, "2026-11-09", "END_TIME_INVALID"],
  ];
  for (const [a, b, want] of cases) assert.equal(code(readWindow(a, b, now)), want, `${a} ${b}`);
  assert.deepEqual(readWindow(undefined, undefined, now), { ok: true, value: { start: now, end: now + 7 * 86_400_000 } });
});

test("status filter speaks Calendly", () => {
  assert.deepEqual(readStatus(undefined), { ok: true, value: undefined });
  assert.deepEqual(readStatus("active"), { ok: true, value: "confirmed" });
  assert.deepEqual(readStatus("canceled"), { ok: true, value: "cancelled" });
  assert.equal(code(readStatus("done")), "STATUS_INVALID");
});

test("ids", () => {
  const cases: [unknown, number][] = [["12", 12], [12, 12], ["0", 0], ["-1", 0], ["1e3", 0], ["massage", 0], [2 ** 31, 0], [undefined, 0]];
  for (const [v, want] of cases) assert.equal(idOf(v), want, String(v));
});

test("services: create and update", () => {
  const team = [1, 2];
  const base = { name: "Massage", description: "", duration: 60, buffer_after: 10, price_cents: 9000, location: "", active: true, staff_ids: [1] };
  const cases: [string, Record<string, unknown>, typeof base | undefined, string][] = [
    ["the least it needs", { name: "Massage", duration: 60 }, undefined, "ok"],
    ["no name", { duration: 60 }, undefined, "NAME_INVALID"],
    ["no duration", { name: "Massage" }, undefined, "DURATION_INVALID"],
    ["too short", { name: "X", duration: 4 }, undefined, "DURATION_INVALID"],
    ["too long", { name: "X", duration: 721 }, undefined, "DURATION_INVALID"],
    ["duration as text", { name: "X", duration: "60" }, undefined, "DURATION_INVALID"],
    ["buffer too long", { name: "X", duration: 60, buffer_after: 241 }, undefined, "BUFFER_INVALID"],
    ["price in dollars", { name: "X", duration: 60, price_cents: 85.5 }, undefined, "PRICE_INVALID"],
    ["no price", { name: "X", duration: 60, price_cents: null }, undefined, "ok"],
    ["someone not on the team", { name: "X", duration: 60, staff_ids: [3] }, undefined, "STAFF_INVALID"],
    ["active as text", { name: "X", duration: 60, active: "yes" }, undefined, "ACTIVE_INVALID"],
    ["update one field", { active: false }, base, "ok"],
    ["update clears the name", { name: "" }, base, "NAME_INVALID"],
  ];
  for (const [name, b, old, want] of cases) assert.equal(code(readService(b, old, team)), want, name);
  assert.deepEqual(readService({ active: false, staff_ids: [2, "2", 1] }, base, team), { ok: true, value: { ...base, active: false, staff_ids: [2, 1] } });
  assert.deepEqual(readService({ name: "  Facial ", duration: 30 }, undefined, team), {
    ok: true,
    value: { name: "Facial", description: "", duration: 30, buffer_after: 0, price_cents: null, location: "", active: true, staff_ids: [] },
  });
});

test("weekly hours", () => {
  const cases: [unknown, string][] = [
    [[], "ok"],
    [[{ weekday: 1, start: "09:00", end: "17:00" }, { weekday: 1, start: "18:00", end: "20:00" }], "ok"],
    [[{ weekday: 7, start: "09:00", end: "17:00" }], "HOURS_INVALID"],
    [[{ weekday: 1, start: "17:00", end: "09:00" }], "HOURS_INVALID"],
    [[{ weekday: 1, start: "9am", end: "17:00" }], "HOURS_INVALID"],
    [[null], "HOURS_INVALID"],
    ["mornings", "HOURS_INVALID"],
  ];
  for (const [v, want] of cases) assert.equal(code(readHours(v)), want, JSON.stringify(v));
  assert.deepEqual(readHours([{ weekday: 2, start: "09:30", end: "12:00" }]), { ok: true, value: [{ weekday: 2, start: 570, end: 720 }] });
});

test("people on the team", () => {
  const base = { name: "Sam", email: "sam@example.com", role: "", active: true };
  const cases: [string, Record<string, unknown>, typeof base | undefined, string][] = [
    ["name only", { name: "Sam Lee" }, undefined, "ok"],
    ["no name", {}, undefined, "NAME_INVALID"],
    ["bad email", { name: "Sam", email: "sam" }, undefined, "EMAIL_INVALID"],
    ["no email", { name: "Sam", email: "" }, undefined, "ok"],
    ["active as text", { name: "Sam", active: "no" }, undefined, "ACTIVE_INVALID"],
    ["update one field", { role: "Physical therapist" }, base, "ok"],
  ];
  for (const [name, b, old, want] of cases) assert.equal(code(readPerson(b, old)), want, name);
  assert.deepEqual(readPerson({ email: "SAM@Example.com " }, base), { ok: true, value: { ...base, email: "sam@example.com" } });
});

test("time off", () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ start_date: "2026-12-24", end_date: "2026-12-26" }, "ok"],
    [{ start_date: "2026-12-24" }, "ok"],
    [{ start_date: "2026-12-26", end_date: "2026-12-24" }, "DATES_INVALID"],
    [{ start_date: "Christmas" }, "DATES_INVALID"],
    [{}, "DATES_INVALID"],
  ];
  for (const [b, want] of cases) assert.equal(code(readTimeOff(b)), want, JSON.stringify(b));
});

test("new bookings", () => {
  const good = { service: "massage", start_time: "2026-11-02T14:00:00Z", invitee: { name: "Ana Silva", email: "ANA@example.com" } };
  const cases: [string, Record<string, unknown>, string][] = [
    ["by slug", good, "ok"],
    ["by id", { ...good, service: 3 }, "ok"],
    ["with a person", { ...good, staff_id: 2 }, "ok"],
    ["no service", { ...good, service: "" }, "SERVICE_REQUIRED"],
    ["no zone on the time", { ...good, start_time: "2026-11-02T14:00:00" }, "START_TIME_INVALID"],
    ["bad person", { ...good, staff_id: "Sam" }, "STAFF_INVALID"],
    ["no invitee", { ...good, invitee: undefined }, "INVITEE_INVALID"],
    ["bad email", { ...good, invitee: { name: "Ana", email: "ana" } }, "INVITEE_INVALID"],
    ["bad phone", { ...good, invitee: { ...good.invitee, phone: "call me" } }, "INVITEE_INVALID"],
  ];
  for (const [name, b, want] of cases) assert.equal(code(readNewBooking(b)), want, name);
  assert.deepEqual(readNewBooking({ ...good, notes: " Left knee " }), {
    ok: true,
    value: { service: "massage", staffId: 0, start: Date.UTC(2026, 10, 2, 14), details: { name: "Ana Silva", email: "ana@example.com", phone: "", notes: "Left knee" } },
  });
});

test("reschedule", () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ start_time: "2026-11-02T14:00:00Z" }, "ok"],
    [{ start_time: "2026-11-02T14:00:00Z", staff_id: 2 }, "ok"],
    [{ start_time: "later" }, "START_TIME_INVALID"],
    [{ start_time: "2026-11-02T14:00:00Z", staff_id: 0 }, "STAFF_INVALID"],
  ];
  for (const [b, want] of cases) assert.equal(code(readReschedule(b)), want, JSON.stringify(b));
});

test("a booking as JSON", () => {
  const b = {
    id: 7, token: "tok", service_id: 3, staff_id: 2, starts_at: new Date(Date.UTC(2026, 10, 2, 14)), ends_at: new Date(Date.UTC(2026, 10, 2, 15)),
    status: "cancelled", customer_name: "Ana", customer_email: "ana@example.com", customer_phone: "", notes: "", created_at: new Date(Date.UTC(2026, 9, 1)),
    cancelled_at: new Date(Date.UTC(2026, 9, 2)), cancelled_by: "customer", reminder_sent_at: null,
    service_name: "Massage", staff_name: "Sam", staff_email: "", location: "Room 1", duration: 60, buffer_after: 0,
  } as BookingView;
  const j = bookingJson(b, "https://x.test");
  assert.equal(j.status, "canceled");
  assert.equal(j.start_time, "2026-11-02T14:00:00.000Z");
  assert.deepEqual(j.cancellation, { canceled_by: "customer", canceled_at: "2026-10-02T00:00:00.000Z" });
  assert.equal(j.manage_url, "https://x.test/b/tok");
  assert.equal(bookingJson({ ...b, status: "confirmed" }, "").cancellation, null);
});
