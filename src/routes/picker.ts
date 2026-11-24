// What the time picker shows, for any of its uses: booking, a customer moving their booking, and
// staff booking or moving for someone.
import { findSlots, rulesFor, type Actor } from "../booking.js";
import type { Service, Settings } from "../model.js";
import { bookable, byDate, planningRange, type Slot } from "../slots.js";
import { addMonths, daysInMonth, firstOfMonth, localDate, monthOf, type LocalDate } from "../time.js";

export type PickerState = { month: string; date: LocalDate | null; today: LocalDate; open: Set<LocalDate>; slots: Slot[]; prevMonth: string | null; nextMonth: string | null };

const maxDate = (a: LocalDate, b: LocalDate) => (a > b ? a : b);
const minDate = (a: LocalDate, b: LocalDate) => (a < b ? a : b);

export const pickerState = async (o: { s: Settings; sv: Service; staffId: number; tz: string; month: string | null; date: LocalDate | null; actor: Actor; except?: number }): Promise<PickerState> => {
  const now = Date.now();
  const today = localDate(now, o.tz);
  const last = localDate(bookable(rulesFor(o.s, o.actor), now).end, o.tz);
  const slotsBetween = async (from: LocalDate, to: LocalDate): Promise<Map<LocalDate, Slot[]>> => {
    if (from > to) return new Map();
    const [a, b] = planningRange(from, to);
    const all = byDate(await findSlots(o.sv, o.staffId, o.s, o.actor, a, b, o.except), o.tz);
    return new Map([...all].filter(([d]) => d >= from && d <= to));
  };
  // With no month asked for, open on the month of the first free time.
  const month =
    o.month && o.month >= monthOf(today) && o.month <= monthOf(last)
      ? o.month
      : (([...(await slotsBetween(today, minDate(last, `${addMonths(monthOf(today), 2)}-28`))).keys()][0] as LocalDate | undefined)?.slice(0, 7) ?? monthOf(today));
  const groups = await slotsBetween(maxDate(firstOfMonth(month), today), minDate(`${month}-${String(daysInMonth(month)).padStart(2, "0")}`, last));
  const open = new Set(groups.keys());
  const date = o.date && open.has(o.date) ? o.date : ([...open][0] ?? null);
  return {
    month,
    date,
    today,
    open,
    slots: date ? (groups.get(date) ?? []) : [],
    prevMonth: month > monthOf(today) ? addMonths(month, -1) : null,
    nextMonth: month < monthOf(last) ? addMonths(month, 1) : null,
  };
};
