// Calendar files, both ways, all pure:
// - out: an .ics for one booking, a feed of a person's bookings, and "add to calendar" links;
// - in: the busy times in a calendar's private iCal address (Google, Outlook, Apple), with the
//   common repeat rules expanded, so a booking never lands on something already on the calendar.
import type { Interval } from "./slots.js";
import { instantOf, isZone } from "./time.js";

export type CalEvent = {
  uid: string;
  start: number;
  end: number;
  title: string;
  description?: string;
  location?: string;
  cancelled?: boolean;
  url?: string;
};

const stamp = (at: number) => new Date(at).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// Text values escape \ ; , and line breaks (RFC 5545 §3.3.11).
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Lines longer than 75 octets fold onto continuation lines starting with a space.
const fold = (line: string): string => {
  const bytes = Buffer.from(line);
  if (bytes.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 74) {
    let cut = 74;
    while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut--;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  return [...chunks, rest].join("\r\n ");
};

const vevent = (e: CalEvent, now: number) =>
  [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${esc(e.title)}`,
    e.description ? `DESCRIPTION:${esc(e.description)}` : "",
    e.location ? `LOCATION:${esc(e.location)}` : "",
    e.url ? `URL:${e.url}` : "",
    `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
  ].filter(Boolean);

export const calendar = (name: string, events: readonly CalEvent[], now: number, method?: "PUBLISH" | "REQUEST" | "CANCEL") =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Whisk//Booking//EN",
    "CALSCALE:GREGORIAN",
    method ? `METHOD:${method}` : "",
    `X-WR-CALNAME:${esc(name)}`,
    ...events.flatMap((e) => vevent(e, now)),
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .map(fold)
    .join("\r\n") + "\r\n";

export const googleLink = (e: CalEvent) =>
  `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${stamp(e.start)}/${stamp(e.end)}`, details: e.description ?? "", location: e.location ?? "" })}`;

export const outlookLink = (e: CalEvent) =>
  `https://outlook.live.com/calendar/0/action/compose?${new URLSearchParams({ rru: "addevent", subject: e.title, startdt: new Date(e.start).toISOString(), enddt: new Date(e.end).toISOString(), body: e.description ?? "", location: e.location ?? "" })}`;

// ---- Reading busy times ----

type Prop = { name: string; params: Record<string, string>; value: string };

// Unfolds continuation lines, then splits NAME;PARAM=x:value.
export const props = (text: string): Prop[] =>
  text
    .replace(/\r?\n[ \t]/g, "")
    .split(/\r?\n/)
    .filter((l) => l.includes(":"))
    .map((line) => {
      const colon = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
      const [head, ...params] = line.slice(0, colon).split(";");
      return {
        name: head.toUpperCase(),
        params: Object.fromEntries(params.map((p) => [p.split("=")[0].toUpperCase(), p.slice(p.indexOf("=") + 1).replace(/^"|"$/g, "")])),
        value: line.slice(colon + 1),
      };
    });

// Outlook names zones the Windows way. The common ones map to their IANA names; anything else
// falls back to the business's own zone.
const WINDOWS: Record<string, string> = {
  "New Zealand Standard Time": "Pacific/Auckland",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "E. Australia Standard Time": "Australia/Brisbane",
  "W. Australia Standard Time": "Australia/Perth",
  "Cen. Australia Standard Time": "Australia/Adelaide",
  "GMT Standard Time": "Europe/London",
  "W. Europe Standard Time": "Europe/Berlin",
  "Romance Standard Time": "Europe/Paris",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles",
  "Singapore Standard Time": "Asia/Singapore",
  "Tokyo Standard Time": "Asia/Tokyo",
  "UTC": "UTC",
};
const zoneFor = (tzid: string | undefined, fallback: string) => {
  const z = tzid ? (WINDOWS[tzid] ?? tzid) : fallback;
  return isZone(z) ? z : fallback;
};

// A DATE-TIME (UTC with Z, or a wall time in TZID) or a DATE (an all-day event) as an instant.
export const when = (p: Prop | undefined, fallbackTz: string): { at: number; allDay: boolean } | undefined => {
  if (!p) return undefined;
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(p.value.trim());
  if (!m) return undefined;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4]) return { at: instantOf(date, 0, fallbackTz), allDay: true };
  if (m[7]) return { at: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]), allDay: false };
  return { at: instantOf(date, +m[4] * 60 + +m[5], zoneFor(p.params.TZID, fallbackTz)), allDay: false };
};

const DURATION = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;
const durationMs = (v: string) => {
  const m = DURATION.exec(v.trim());
  if (!m) return 0;
  const [w, d, h, mi, s] = m.slice(2).map((x) => Number(x ?? 0));
  return ((((w * 7 + d) * 24 + h) * 60 + mi) * 60 + s) * 1000;
};

type Rule = { freq: "DAILY" | "WEEKLY" | "MONTHLY"; interval: number; count?: number; until?: number; byDay?: number[] };
const DAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export const parseRule = (v: string, tz: string): Rule | undefined => {
  const kv = Object.fromEntries(v.split(";").map((p) => p.split("=") as [string, string]));
  if (!["DAILY", "WEEKLY", "MONTHLY"].includes(kv.FREQ)) return undefined;
  // Rules that pick days by position ("the second Tuesday") are skipped rather than guessed.
  if (kv.BYSETPOS || kv.BYMONTHDAY || kv.BYYEARDAY || /\d/.test(kv.BYDAY ?? "")) return undefined;
  return {
    freq: kv.FREQ as Rule["freq"],
    interval: Math.max(1, Number(kv.INTERVAL ?? 1) || 1),
    count: kv.COUNT ? Number(kv.COUNT) : undefined,
    until: kv.UNTIL ? when({ name: "UNTIL", params: {}, value: kv.UNTIL }, tz)?.at : undefined,
    byDay: kv.BYDAY ? kv.BYDAY.split(",").map((d) => DAYS[d]).filter((d) => d !== undefined) : undefined,
  };
};

// Each start of a repeating event up to `horizon`, in the event's own zone so a weekly 9 am
// meeting stays at 9 am across daylight saving. At most 1,000 per event.
export const occurrences = (start: number, rule: Rule, tz: string, horizon: number): number[] => {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(fmt.formatToParts(start).map((x) => [x.type, x.value]));
  const date0 = `${p.year}-${p.month}-${p.day}`;
  const minutes = Number(p.hour) * 60 + Number(p.minute);
  const end = Math.min(horizon, rule.until ?? Infinity);
  const dayAt = (i: number) => new Date(Date.parse(`${date0}T00:00:00Z`) + i * 86_400_000);
  const step = rule.freq === "DAILY" ? rule.interval : 1;
  const out: number[] = [];
  for (let i = 0; out.length < Math.min(rule.count ?? 1000, 1000); i += step) {
    const d = dayAt(i);
    const iso = d.toISOString().slice(0, 10);
    const at = instantOf(iso, minutes, tz);
    if (at > end) break;
    // Weeks count from the Monday on or before the first date (WKST=MO).
    const weeks = Math.floor((i + ((new Date(`${date0}T00:00:00Z`).getUTCDay() + 6) % 7)) / 7);
    const keep =
      rule.freq === "DAILY"
        ? true
        : rule.freq === "WEEKLY"
          ? weeks % rule.interval === 0 && (rule.byDay ?? [new Date(`${date0}T00:00:00Z`).getUTCDay()]).includes(d.getUTCDay())
          : d.getUTCDate() === Number(p.day) && ((d.getUTCFullYear() - Number(p.year)) * 12 + d.getUTCMonth() + 1 - Number(p.month)) % rule.interval === 0;
    if (keep && at >= start) out.push(at);
  }
  return out;
};

// Busy intervals from an iCal file that overlap [from, to]. Free ("transparent") and canceled
// events are left out, and so is anything the file marks as an exception.
export const busyTimes = (text: string, fallbackTz: string, from: number, to: number): Interval[] => {
  const blocks = text.split(/BEGIN:VEVENT/).slice(1).map((b) => props(b.split(/END:VEVENT/)[0]));
  const get = (ps: Prop[], name: string) => ps.find((p) => p.name === name);
  const all = (ps: Prop[], name: string) => ps.filter((p) => p.name === name);
  // A changed or moved occurrence comes as its own event with RECURRENCE-ID; the series skips it.
  const moved = new Set(blocks.map((ps) => get(ps, "RECURRENCE-ID")).filter(Boolean).map((p) => when(p, fallbackTz)?.at));
  return blocks.flatMap((ps) => {
    if (get(ps, "TRANSP")?.value.trim() === "TRANSPARENT" || get(ps, "STATUS")?.value.trim() === "CANCELLED") return [];
    const start = when(get(ps, "DTSTART"), fallbackTz);
    if (!start) return [];
    const endProp = when(get(ps, "DTEND"), fallbackTz);
    const length = endProp ? endProp.at - start.at : get(ps, "DURATION") ? durationMs(get(ps, "DURATION")!.value) : start.allDay ? 86_400_000 : 0;
    if (length <= 0) return [];
    const tz = zoneFor(get(ps, "DTSTART")?.params.TZID, fallbackTz);
    const rrule = get(ps, "RRULE");
    const rule = rrule && !get(ps, "RECURRENCE-ID") ? parseRule(rrule.value, tz) : undefined;
    const except = new Set(all(ps, "EXDATE").flatMap((p) => p.value.split(",").map((v) => when({ ...p, value: v }, fallbackTz)?.at)));
    const starts = rule ? occurrences(start.at, rule, tz, to).filter((s) => !except.has(s) && !moved.has(s)) : [start.at];
    return starts.map((s) => ({ start: s, end: s + length })).filter((i) => i.start < to && i.end > from);
  });
};
