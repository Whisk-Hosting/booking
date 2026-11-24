// The availability planner: which start times are free for a service, and with whom. Pure, so
// every rule is table-tested (test/slots.test.ts). Booking runs the same planner again inside
// the transaction that saves the booking, so the page and the save can never disagree.
import { addDays, datesFrom, daysBetween, instantOf, localDate, weekdayOf, type LocalDate } from "./time.js";

export type Interval = { start: number; end: number };

// Weekly hours as wall-clock minutes in the business's zone. Several rows on a day make a split
// shift.
export type Hours = { weekday: number; start: number; end: number };

export type Person = {
  id: number;
  hours: readonly Hours[];
  // Everything that already takes their time: bookings (with the buffer after each), time off,
  // and busy times from their own calendar.
  blocked: readonly Interval[];
};

export type Rules = {
  tz: string;
  minNoticeMinutes: number;
  windowDays: number;
  stepMinutes: number;
};

export type Service = { duration: number; bufferAfter: number };

export type Slot = { start: number; end: number; people: number[] };

const MIN = 60_000;

export const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

// The start times on one date that fit inside one person's hours, before checking what blocks
// them. A start lands on the step counted from the start of the shift.
const startsOn = (date: LocalDate, hours: readonly Hours[], service: Service, rules: Rules) =>
  hours
    .filter((h) => h.weekday === weekdayOf(date) && h.end - h.start >= service.duration)
    .flatMap((h) =>
      Array.from({ length: Math.floor((h.end - h.start - service.duration) / rules.stepMinutes) + 1 }, (_, i) => h.start + i * rules.stepMinutes).map((m) => ({
        start: instantOf(date, m, rules.tz),
        end: instantOf(date, m + service.duration, rules.tz),
      })),
    );

// The appointment and the buffer after it must both be clear of other bookings. The buffer may
// run past the end of the shift: the last appointment of the day needs no gap after it.
const fits = (slot: Interval, service: Service, blocked: readonly Interval[]) => {
  const held = { start: slot.start, end: slot.end + service.bufferAfter * MIN };
  return !blocked.some((b) => overlaps(held, b));
};

// The first and last instants anyone may book from now.
export const bookable = (rules: Rules, now: number): Interval => ({
  start: now + rules.minNoticeMinutes * MIN,
  end: now + rules.windowDays * 86_400_000,
});

// Free slots between two local dates (inclusive) for the given people, earliest first. Each slot
// names everyone free for it, so "Any available" can pick one.
export const freeSlots = (service: Service, people: readonly Person[], rules: Rules, now: number, from: LocalDate, to: LocalDate): Slot[] => {
  const window = bookable(rules, now);
  const dates = datesFrom(from, daysBetween(from, to) + 1);
  const open = people.flatMap((person) =>
    dates.flatMap((date) =>
      startsOn(date, person.hours, service, rules)
        .filter((s) => s.start >= window.start && s.start <= window.end && fits(s, service, person.blocked))
        .map((s) => ({ ...s, person: person.id })),
    ),
  );
  return [...Map.groupBy(open, (s) => s.start).values()]
    .map((same) => ({ start: same[0].start, end: same[0].end, people: same.map((s) => s.person) }))
    .sort((a, b) => a.start - b.start);
};

// Groups slots by the date they fall on in the visitor's zone.
export const byDate = (slots: readonly Slot[], tz: string): ReadonlyMap<LocalDate, Slot[]> => Map.groupBy(slots, (s) => localDate(s.start, tz));

// The local dates the planner must look at so that every slot on the visitor's dates from..to
// is found: the visitor's day can begin or end on the business's day before or after.
export const planningRange = (from: LocalDate, to: LocalDate): [LocalDate, LocalDate] => [addDays(from, -1), addDays(to, 1)];

// "Any available": of the people free for a slot, the one with the fewest bookings that day,
// then the lowest id, so the choice is stable.
export const choosePerson = (free: readonly number[], loadThatDay: ReadonlyMap<number, number>): number | undefined =>
  [...free].sort((a, b) => (loadThatDay.get(a) ?? 0) - (loadThatDay.get(b) ?? 0) || a - b)[0];
