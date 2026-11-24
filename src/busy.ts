// Busy times from each person's own calendar. They paste its private iCal address (Google:
// Settings, "Secret address in iCal format"; Outlook: Calendar, Shared calendars, Publish; Apple:
// iCloud calendar, Public Calendar). The app reads it when someone looks for a time, at most
// every ten minutes per person, so nothing polls while nobody is booking.
import { busyTimes } from "./ics.js";
import type { Settings, Staff } from "./model.js";
import type { Interval } from "./slots.js";
import * as store from "./store.js";
import { log } from "./whisk.js";

// The calendar services the app fetches from. A person can only paste an address on one of
// these, so the app never fetches somewhere else on their say-so. Add yours here.
export const CALENDAR_HOSTS = [/^calendar\.google\.com$/, /^outlook\.(office365|office|live)\.com$/, /^p\d+-caldav\.icloud\.com$/, /^([a-z0-9-]+\.)?icloud\.com$/];

const FRESH_MS = 10 * 60_000;
const LOOK_AHEAD_DAYS = 120;
const MAX_BYTES = 5_000_000;

// The address to fetch, or why it can't be used. webcal:// is https:// under another name.
export const checkUrl = (raw: string): { url?: string; error?: string } => {
  const s = raw.trim().replace(/^webcals?:\/\//i, "https://");
  if (!s) return {};
  const u = URL.canParse(s) ? new URL(s) : undefined;
  if (!u || u.protocol !== "https:") return { error: "Paste the calendar's private address. It starts with https:// or webcal://" };
  if (!CALENDAR_HOSTS.some((h) => h.test(u.hostname))) return { error: "Use a Google, Outlook or Apple iCloud calendar address" };
  return { url: u.toString() };
};

const allowed = (url: string) => URL.canParse(url) && new URL(url).protocol === "https:" && CALENDAR_HOSTS.some((h) => h.test(new URL(url).hostname));

// Follows up to three redirects, each only to another allowed calendar host.
const fetchText = async (url: string, hops = 3): Promise<string> => {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "manual", headers: { accept: "text/calendar" } });
  if (res.status >= 300 && res.status < 400) {
    const next = new URL(res.headers.get("location") ?? "", url).toString();
    if (hops === 0 || !allowed(next)) throw new Error("The calendar address redirected somewhere else.");
    return fetchText(next, hops - 1);
  }
  if (!res.ok) throw new Error(`The calendar answered ${res.status}. Check the address is still the private one.`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("The calendar is too large to read.");
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That address isn't a calendar file.");
  return text;
};

// Reads the calendars of these people that are older than ten minutes, in parallel. A calendar
// that fails keeps its last busy times and shows the error on the Team page.
export const refreshBusy = async (people: readonly Staff[], s: Settings, now = Date.now()) => {
  const stale = people.filter((p) => p.busy_url && (!p.busy_checked_at || now - p.busy_checked_at.getTime() > FRESH_MS));
  await Promise.all(
    stale.map(async (p) => {
      try {
        const busy: Interval[] = busyTimes(await fetchText(p.busy_url), s.timezone, now - 86_400_000, now + LOOK_AHEAD_DAYS * 86_400_000);
        await store.saveBusy(p.id, busy, "");
      } catch (err) {
        log.warn({ staff_id: p.id, err: String(err) }, "calendar not read");
        await store.saveBusy(p.id, [], err instanceof Error && err.name !== "TimeoutError" ? err.message : "The calendar took too long to answer.");
      }
    }),
  );
};
