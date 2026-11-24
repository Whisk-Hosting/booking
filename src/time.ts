// Time zones without a library. Instants are epoch milliseconds; a business's hours are wall
// times in its own zone. Every function here is pure.

export type LocalDate = string; // "2026-10-09"

export type Parts = { y: number; m: number; d: number; weekday: number; minutes: number };

const MIN = 60_000;
export const DAY = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();
const formatter = (tz: string) => {
  const hit = formatters.get(tz);
  if (hit) return hit;
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" });
  formatters.set(tz, f);
  return f;
};

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export const isZone = (tz: string) => {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
};

// The wall-clock date, weekday and minute of the day at an instant in a zone.
export const partsAt = (at: number, tz: string): Parts => {
  const p = Object.fromEntries(formatter(tz).formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), weekday: WEEKDAYS[p.weekday], minutes: Number(p.hour) * 60 + Number(p.minute) };
};

// How far a zone is ahead of UTC at an instant, in milliseconds.
const offsetAt = (at: number, tz: string) => {
  const p = partsAt(at, tz);
  return Date.UTC(p.y, p.m - 1, p.d, 0, p.minutes) - Math.floor(at / MIN) * MIN;
};

// The instant a wall time happens in a zone. A time skipped by daylight saving moves forward
// by the gap; a time that happens twice takes the first.
export const instantOf = (date: LocalDate, minutes: number, tz: string): number => {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  // The zone's offsets a day either side cover both sides of any daylight saving change.
  const offsets = [...new Set([offsetAt(guess - DAY, tz), offsetAt(guess, tz), offsetAt(guess + DAY, tz)])];
  const exact = offsets.map((o) => guess - o).filter((t) => offsetAt(t, tz) === guess - t).sort((a, b) => a - b);
  return exact.length ? exact[0] : guess - Math.min(...offsets);
};

export const pad = (n: number) => String(n).padStart(2, "0");
export const dateOf = (p: Pick<Parts, "y" | "m" | "d">): LocalDate => `${p.y}-${pad(p.m)}-${pad(p.d)}`;
export const localDate = (at: number, tz: string): LocalDate => dateOf(partsAt(at, tz));

export const isDate = (s: unknown): s is LocalDate => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// Calendar arithmetic on dates alone, independent of any zone.
export const addDays = (date: LocalDate, n: number): LocalDate => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const weekdayOf = (date: LocalDate) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const daysBetween = (from: LocalDate, to: LocalDate) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
export const datesFrom = (from: LocalDate, count: number): LocalDate[] => Array.from({ length: Math.max(0, count) }, (_, i) => addDays(from, i));

export const monthOf = (date: LocalDate) => date.slice(0, 7);
export const firstOfMonth = (month: string): LocalDate => `${month}-01`;
export const addMonths = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
};
export const daysInMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

// The weeks of a month for a calendar grid starting on Sunday; null fills the gaps.
export const monthGrid = (month: string): (LocalDate | null)[][] => {
  const first = firstOfMonth(month);
  const lead = weekdayOf(first);
  const cells = [...Array<null>(lead).fill(null), ...datesFrom(first, daysInMonth(month))];
  const padded = [...cells, ...Array<null>((7 - (cells.length % 7)) % 7).fill(null)];
  return Array.from({ length: padded.length / 7 }, (_, i) => padded.slice(i * 7, i * 7 + 7));
};

// Display. en-US gives "Fri, Oct 9"; times are "2:30 pm", lowercase.
const display = (tz: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts });
export const fmtTime = (at: number, tz: string) => display(tz, { hour: "numeric", minute: "2-digit", hour12: true }).format(at).replace(/\s?([ap])\.?m\.?/i, (_, ap: string) => ` ${ap.toLowerCase()}m`);
export const fmtDay = (at: number, tz: string) => display(tz, { weekday: "long", day: "numeric", month: "long" }).format(at);
export const fmtShortDay = (at: number, tz: string) => display(tz, { weekday: "short", day: "numeric", month: "short" }).format(at);
export const fmtDayOfDate = (date: LocalDate) => display("UTC", { weekday: "long", day: "numeric", month: "long" }).format(Date.parse(`${date}T00:00:00Z`));
export const fmtMonth = (month: string) => display("UTC", { month: "long", year: "numeric" }).format(Date.parse(`${month}-01T00:00:00Z`));
export const fmtWhen = (at: number, tz: string) => `${fmtDay(at, tz)}, ${fmtTime(at, tz)}`;
export const fmtClock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
export const parseClock = (s: unknown): number | null => {
  const m = typeof s === "string" ? /^(\d{1,2}):(\d{2})$/.exec(s.trim()) : null;
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && v <= 24 * 60 ? v : null;
};
export const fmtDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h} hr ${m} min` : h ? `${h} hr` : `${m} min`;
};
// "America/New_York" → "New York"; with the offset now, "New York (GMT-4)".
export const zoneLabel = (tz: string, at = Date.now()) => {
  const city = tz.split("/").pop()!.replace(/_/g, " ");
  const off = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "";
  return `${city} (${off.replace("GMT", "GMT")})`;
};
