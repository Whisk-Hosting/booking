import assert from "node:assert/strict";
import { test } from "node:test";
import { customerMayChange, money, parseMoney, readDetails, reminderDue, slugify, uniqueSlug } from "../src/model.js";

const H = 3_600_000;
const now = Date.UTC(2026, 9, 9, 0);

test("reminders, case by case", () => {
  const s = { reminder_minutes: 24 * 60 };
  const b = (o: { inHours: number; madeHoursAgo?: number; sent?: boolean; status?: "confirmed" | "cancelled" }) => ({
    status: o.status ?? "confirmed",
    starts_at: new Date(now + o.inHours * H),
    created_at: new Date(now - (o.madeHoursAgo ?? 72) * H),
    reminder_sent_at: o.sent ? new Date(now) : null,
  });
  const cases: [string, ReturnType<typeof b>, typeof s, boolean][] = [
    ["inside the lead time", b({ inHours: 20 }), s, true],
    ["too far away", b({ inHours: 30 }), s, false],
    ["already sent", b({ inHours: 20, sent: true }), s, false],
    ["cancelled", b({ inHours: 20, status: "cancelled" }), s, false],
    ["already started", b({ inHours: -1 }), s, false],
    ["booked inside the lead time", b({ inHours: 20, madeHoursAgo: 2 }), s, false],
    ["reminders off", b({ inHours: 20 }), { reminder_minutes: 0 }, false],
  ];
  for (const [name, booking, settings, want] of cases) assert.equal(reminderDue(booking, settings, now), want, name);
});

test("customers change up to the cut-off", () => {
  const s = { cancel_cutoff_minutes: 12 * 60 };
  assert.equal(customerMayChange({ status: "confirmed", starts_at: new Date(now + 13 * H) }, s, now), true);
  assert.equal(customerMayChange({ status: "confirmed", starts_at: new Date(now + 11 * H) }, s, now), false);
  assert.equal(customerMayChange({ status: "cancelled", starts_at: new Date(now + 48 * H) }, s, now), false);
});

test("details are tidied and checked", () => {
  const cases: [string, Record<string, unknown>, string[]][] = [
    ["all good", { name: " Sarah ", email: "Sarah@Example.com", phone: "+1 (203) 555-0123" }, []],
    ["missing name and email", { name: "", email: "" }, ["name", "email"]],
    ["a bad email", { name: "A", email: "sarah@" }, ["email"]],
    ["a bad phone", { name: "A", email: "a@b.com", phone: "call me" }, ["phone"]],
    ["not text at all", { name: ["x"], email: 3 }, ["name", "email"]],
  ];
  for (const [name, form, want] of cases) assert.deepEqual(Object.keys(readDetails(form).errors), want, name);
  assert.deepEqual(readDetails({ name: " Sarah\u0007 ", email: "Sarah@Example.com" }).details, { name: "Sarah", email: "sarah@example.com", phone: "", notes: "" });
});

test("slugs and money", () => {
  assert.equal(slugify("Sports Massage (45 min)"), "sports-massage-45-min");
  assert.equal(slugify("Café consult"), "cafe-consult");
  assert.equal(slugify("!!!"), "service");
  assert.equal(uniqueSlug("massage", ["massage", "massage-2"]), "massage-3");
  assert.equal(uniqueSlug("massage", []), "massage");
  assert.equal(money(11000, "USD"), "$110");
  assert.equal(money(7550, "USD"), "$75.50");
  assert.equal(money(0, "USD"), "Free");
  assert.equal(money(null, "USD"), "");
  assert.equal(parseMoney("$1,200.50"), 120050);
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("-5"), null);
});
