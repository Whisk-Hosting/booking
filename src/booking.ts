// Booking, moving and canceling: the imperative shell around the planner. Each one re-runs the
// planner inside a transaction that has locked the people involved, so the time a customer saw
// as free is still free when it is saved, or they are told it has just gone.
import { refreshBusy } from "./busy.js";
import { sql } from "./db.js";
import { customerMail, staffMail } from "./emails.js";
import { baseUrl, email } from "./mail.js";
import type { BookingView, Details, Service, Settings } from "./model.js";
import { choosePerson, freeSlots, type Rules, type Slot } from "./slots.js";
import * as store from "./store.js";
import { addDays, instantOf, localDate, type LocalDate } from "./time.js";

// Customers keep to the business's rules. Staff booking for someone on the phone may book any
// free time from now on, up to a year ahead.
export type Actor = { kind: "customer" } | { kind: "staff"; name: string };

export const rulesFor = (s: Settings, actor: Actor): Rules =>
  actor.kind === "customer"
    ? { tz: s.timezone, minNoticeMinutes: s.min_notice_minutes, windowDays: s.window_days, stepMinutes: s.step_minutes }
    : { tz: s.timezone, minNoticeMinutes: 0, windowDays: 366, stepMinutes: Math.min(s.step_minutes, 15) };

const asService = (sv: Service) => ({ duration: sv.duration, bufferAfter: sv.buffer_after });

// Who can do this service: everyone set up for it, or one of them by choice.
export const candidates = (sv: Service, staffId: number) => (staffId ? sv.staff_ids.filter((id) => id === staffId) : sv.staff_ids);

const span = (from: LocalDate, to: LocalDate, tz: string) => ({ from: new Date(instantOf(addDays(from, -1), 0, tz)), to: new Date(instantOf(addDays(to, 2), 0, tz)) });

// Free slots between two of the business's dates, reading people's own calendars first.
export const findSlots = async (sv: Service, staffId: number, s: Settings, actor: Actor, from: LocalDate, to: LocalDate, except = 0): Promise<Slot[]> => {
  const ids = candidates(sv, staffId);
  if (!ids.length) return [];
  const everyone = await store.staff();
  await refreshBusy(everyone.filter((p) => ids.includes(p.id)), s);
  const { from: a, to: b } = span(from, to, s.timezone);
  const people = await store.people(sql, ids, a, b, except);
  return freeSlots(asService(sv), people, rulesFor(s, actor), Date.now(), addDays(from, -1), addDays(to, 1));
};

type Taken = { ok: false; reason: "taken" };
type Done = { ok: true; booking: BookingView };

// Saves a booking at `start` if it is still free, with the chosen person or, for "Any
// available", the free person with the fewest bookings that day.
export const book = async (sv: Service, staffId: number, start: number, d: Details, s: Settings, actor: Actor): Promise<Taken | Done> => {
  const ids = candidates(sv, staffId);
  const everyone = await store.staff();
  await refreshBusy(everyone.filter((p) => ids.includes(p.id)), s);
  const date = localDate(start, s.timezone);
  const id = await sql.begin(async (tx) => {
    await store.lockStaff(tx, ids);
    const { from, to } = span(date, date, s.timezone);
    const people = await store.people(tx, ids, from, to);
    const slot = freeSlots(asService(sv), people, rulesFor(s, actor), Date.now(), addDays(date, -1), addDays(date, 1)).find((x) => x.start === start);
    if (!slot) return 0;
    const dayStart = new Date(instantOf(date, 0, s.timezone));
    const load = await store.loadThatDay(tx, slot.people, dayStart, new Date(instantOf(addDays(date, 1), 0, s.timezone)));
    return store.insertBooking(tx, {
      service_id: sv.id,
      staff_id: choosePerson(slot.people, load)!,
      starts_at: new Date(slot.start),
      ends_at: new Date(slot.end),
      customer_name: d.name,
      customer_email: d.email,
      customer_phone: d.phone,
      notes: d.notes,
      created_by: actor.kind === "staff" ? actor.name : "customer",
    });
  });
  if (!id) return { ok: false, reason: "taken" };
  const booking = (await store.bookingById(id))!;
  await Promise.all([
    email(id, "confirmed", customerMail("confirmed", booking, s, baseUrl())),
    email(id, "staff-new", staffMail("staff-new", booking, s, baseUrl())),
  ]);
  return { ok: true, booking };
};

// Moves a booking to a new start, keeping its person unless staff pick another.
export const move = async (b: BookingView, sv: Service, staffId: number, start: number, s: Settings, actor: Actor): Promise<Taken | Done> => {
  const ids = candidates(sv, staffId || b.staff_id);
  const everyone = await store.staff();
  await refreshBusy(everyone.filter((p) => ids.includes(p.id)), s);
  const date = localDate(start, s.timezone);
  const moved = await sql.begin(async (tx) => {
    await store.lockStaff(tx, ids);
    const { from, to } = span(date, date, s.timezone);
    const people = await store.people(tx, ids, from, to, b.id);
    const slot = freeSlots(asService(sv), people, rulesFor(s, actor), Date.now(), addDays(date, -1), addDays(date, 1)).find((x) => x.start === start);
    if (!slot) return false;
    await store.moveBooking(tx, b.id, slot.people.includes(b.staff_id) ? b.staff_id : slot.people[0], new Date(slot.start), new Date(slot.end));
    return true;
  });
  if (!moved) return { ok: false, reason: "taken" };
  const after = (await store.bookingById(b.id))!;
  const notices = [email(b.id, "moved", customerMail("moved", after, s, baseUrl())), email(b.id, "staff-moved", staffMail("staff-moved", after, s, baseUrl()))];
  // Someone else's calendar lost it: tell them too.
  if (after.staff_id !== b.staff_id) notices.push(email(b.id, "staff-cancelled", staffMail("staff-cancelled", { ...b, status: "cancelled" }, s, baseUrl())));
  await Promise.all(notices);
  return { ok: true, booking: after };
};

export const cancel = async (b: BookingView, s: Settings, by: string) => {
  await store.cancelBooking(b.id, by);
  const after = (await store.bookingById(b.id))!;
  await Promise.all([
    email(b.id, "cancelled", customerMail("cancelled", after, s, baseUrl())),
    email(b.id, "staff-cancelled", staffMail("staff-cancelled", after, s, baseUrl())),
  ]);
  return after;
};
