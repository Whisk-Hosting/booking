// The API's decisions, pure: reading keys out of a request, reading and checking JSON bodies and
// query values, and shaping rows as JSON. test/api.test.ts covers them. The routes in api.ts are
// the imperative shell around these and the same store and booking functions the pages use.
// Field names follow Calendly's API where it has one (start_time, end_time, invitee, status
// "active" or "canceled").
import { isEmail, KEY_PREFIX, readDetails, SERVICE_LIMITS, type BookingView, type Details, type Service, type Staff } from "./model.js";
import type { Hours } from "./slots.js";
import { fmtClock, isDate, parseClock, type LocalDate } from "./time.js";

// ---- Errors ----

export type Problem = { status: 400 | 401 | 403 | 404 | 409 | 422; code: string; message: string; fix: string };
export type Result<T> = { ok: true; value: T } | { ok: false; problem: Problem };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const no = (status: Problem["status"], code: string, message: string, fix: string): { ok: false; problem: Problem } => ({ ok: false, problem: { status, code, message, fix } });
const invalid = (code: string, message: string, fix: string) => no(422, code, message, fix);

// ---- Keys ----

// The key a request carries: Authorization: Bearer <key>, Basic auth with the key as the user
// name, X-Api-Key, or ?token=. The first one present wins.
export const keyFrom = (header: (name: string) => string | undefined, token?: string): string => {
  const auth = (header("authorization") ?? "").trim();
  const bearer = /^bearer\s+(.+)$/i.exec(auth)?.[1];
  const basic = /^basic\s+(.+)$/i.exec(auth)?.[1];
  const user = basic ? Buffer.from(basic.trim(), "base64").toString("utf8").split(":")[0] : undefined;
  return (bearer ?? user ?? header("x-api-key") ?? token ?? "").trim();
};

// A key this app could have made: the prefix and 32 base64url characters.
export const isKeyShape = (key: string) => new RegExp(`^${KEY_PREFIX}[A-Za-z0-9_-]{32}$`).test(key);

// ---- Query values ----

export type Page = { limit: number; offset: number };

// ?limit= (1 to 200, 50 when absent) and ?offset= (0 or more).
export const readPage = (limit: string | undefined, offset: string | undefined): Result<Page> => {
  const l = limit === undefined || limit === "" ? 50 : Number(limit);
  const o = offset === undefined || offset === "" ? 0 : Number(offset);
  if (!Number.isInteger(l) || l < 1 || l > 200) return no(400, "LIMIT_INVALID", "limit must be a whole number from 1 to 200.", "Send ?limit=50, or leave it out.");
  if (!Number.isInteger(o) || o < 0) return no(400, "OFFSET_INVALID", "offset must be a whole number, 0 or more.", "Send the next_offset from the last page.");
  return ok({ limit: l, offset: o });
};

// The page of rows a query fetched with one row extra, and the offset of the next page.
export const pageOf = <T>(rows: readonly T[], p: Page) => ({ items: rows.slice(0, p.limit), next_offset: rows.length > p.limit ? p.offset + p.limit : null });

// An instant: an ISO 8601 date and time with its zone, or milliseconds since 1970.
export const readInstant = (v: unknown): number | undefined => {
  if (typeof v === "number") return Number.isSafeInteger(v) ? v : undefined;
  if (typeof v !== "string" || !v.trim()) return undefined;
  const s = v.trim();
  if (/^\d{10,15}$/.test(s)) return Number(s);
  // A date alone or a time without a zone would mean different instants in different places.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(s)) return undefined;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : t;
};

const DAY = 86_400_000;
export const MAX_WINDOW_DAYS = 31;

// The span to look for free times in: start_time to end_time, a week from now by default, at
// most 31 days.
export const readWindow = (start: string | undefined, end: string | undefined, now: number): Result<{ start: number; end: number }> => {
  const a = start ? readInstant(start) : now;
  if (a === undefined) return no(400, "START_TIME_INVALID", "start_time is not a date and time.", "Send start_time like 2026-11-02T09:00:00Z.");
  const b = end ? readInstant(end) : a + 7 * DAY;
  if (b === undefined) return no(400, "END_TIME_INVALID", "end_time is not a date and time.", "Send end_time like 2026-11-09T00:00:00Z.");
  if (b <= a) return no(400, "WINDOW_INVALID", "end_time must be after start_time.", "Send an end_time later than start_time.");
  if (b - a > MAX_WINDOW_DAYS * DAY) return no(400, "WINDOW_TOO_LONG", `Ask for at most ${MAX_WINDOW_DAYS} days at a time.`, "Ask for the next span with start_time set to this end_time.");
  return ok({ start: a, end: b });
};

// "active" or "canceled", as Calendly says; the app keeps "confirmed" and "cancelled".
export const readStatus = (v: string | undefined): Result<BookingView["status"] | undefined> =>
  !v ? ok(undefined) : v === "active" ? ok("confirmed") : v === "canceled" || v === "cancelled" ? ok("cancelled") : no(400, "STATUS_INVALID", "status must be active or canceled.", "Send ?status=active, or leave it out.");

// A positive whole-number id, or 0 when it isn't one.
export const idOf = (v: unknown) => {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n < 2 ** 31 ? n : 0;
};

// ---- Bodies ----

export type Body = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);
const has = (b: Body, k: string) => Object.hasOwn(b, k);

export type ServiceFields = { name: string; description: string; duration: number; buffer_after: number; price_cents: number | null; location: string; active: boolean; staff_ids: number[] };

const inRange = (v: unknown, [lo, hi]: readonly [number, number]) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

// A service from JSON. On an update, `base` is the service as it is and only the fields sent
// change. Staff must be people who exist and are active.
export const readService = (b: Body, base: ServiceFields | undefined, activeStaff: readonly number[]): Result<ServiceFields> => {
  const pick = <K extends keyof ServiceFields>(k: K, fallback: ServiceFields[K]) => (has(b, k) ? b[k] : (base?.[k] ?? fallback));
  const name = str(pick("name", ""));
  if (!name || name.length > SERVICE_LIMITS.name) return invalid("NAME_INVALID", `name is needed, up to ${SERVICE_LIMITS.name} characters.`, 'Send {"name": "Massage"}.');
  const duration = pick("duration", undefined as unknown as number);
  if (!inRange(duration, SERVICE_LIMITS.duration)) return invalid("DURATION_INVALID", `duration must be whole minutes from ${SERVICE_LIMITS.duration[0]} to ${SERVICE_LIMITS.duration[1]}.`, 'Send {"duration": 45}.');
  const buffer = pick("buffer_after", 0);
  if (!inRange(buffer, SERVICE_LIMITS.buffer_after)) return invalid("BUFFER_INVALID", `buffer_after must be whole minutes from ${SERVICE_LIMITS.buffer_after[0]} to ${SERVICE_LIMITS.buffer_after[1]}.`, 'Send {"buffer_after": 10}, or leave it out.');
  const price = pick("price_cents", null);
  if (price !== null && !(typeof price === "number" && Number.isInteger(price) && price >= 0 && price < 1e9)) return invalid("PRICE_INVALID", "price_cents must be whole cents, 0 or more, or null for no price.", 'Send {"price_cents": 8500} for 85.00.');
  const description = pick("description", "");
  const location = pick("location", "");
  if (typeof description !== "string" || description.length > SERVICE_LIMITS.description) return invalid("DESCRIPTION_INVALID", `description must be text up to ${SERVICE_LIMITS.description} characters.`, "Shorten the description.");
  if (typeof location !== "string" || location.length > SERVICE_LIMITS.location) return invalid("LOCATION_INVALID", `location must be text up to ${SERVICE_LIMITS.location} characters.`, "Shorten the location.");
  const active = pick("active", true);
  if (typeof active !== "boolean") return invalid("ACTIVE_INVALID", "active must be true or false.", 'Send {"active": false} to hide it from the booking page.');
  const staff = pick("staff_ids", []);
  if (!Array.isArray(staff) || !staff.every((id) => activeStaff.includes(idOf(id))))
    return invalid("STAFF_INVALID", "staff_ids must list people on the team who are active.", "GET /api/v1/staff lists each person's id.");
  return ok({ name, description: description.trim(), duration: duration as number, buffer_after: buffer as number, price_cents: price as number | null, location: location.trim(), active, staff_ids: [...new Set(staff.map(idOf))] });
};

// Weekly hours as [{"weekday": 1, "start": "09:00", "end": "17:00"}]; weekday 0 is Sunday.
// Several on one day make a split shift.
export const readHours = (v: unknown): Result<Hours[]> => {
  if (!Array.isArray(v)) return invalid("HOURS_INVALID", "hours must be a list.", 'Send {"hours": [{"weekday": 1, "start": "09:00", "end": "17:00"}]}.');
  const rows = v.map((h) => {
    const r = (h ?? {}) as Body;
    return { weekday: r.weekday, start: parseClock(r.start), end: parseClock(r.end) };
  });
  const bad = rows.findIndex((h) => !(typeof h.weekday === "number" && Number.isInteger(h.weekday) && h.weekday >= 0 && h.weekday <= 6) || h.start === null || h.end === null || h.end <= h.start);
  if (bad >= 0) return invalid("HOURS_INVALID", `hours[${bad}] needs a weekday from 0 (Sunday) to 6 and a start before its end, as HH:MM.`, 'Send {"weekday": 1, "start": "09:00", "end": "17:00"}.');
  return ok(rows as Hours[]);
};

export type PersonFields = { name: string; email: string; role: string; active: boolean };

// A person on the team from JSON; on an update only the fields sent change.
export const readPerson = (b: Body, base: PersonFields | undefined): Result<PersonFields> => {
  const pick = <K extends keyof PersonFields>(k: K, fallback: PersonFields[K]) => (has(b, k) ? b[k] : (base?.[k] ?? fallback));
  const name = str(pick("name", ""));
  if (!name || name.length > 80) return invalid("NAME_INVALID", "name is needed, up to 80 characters.", 'Send {"name": "Sam Lee"}.');
  const email = str(pick("email", ""))?.toLowerCase();
  if (email === undefined || (email && !isEmail(email))) return invalid("EMAIL_INVALID", "email is not an email address.", 'Send {"email": "sam@example.com"}, or "" for none.');
  const role = str(pick("role", ""));
  if (role === undefined || role.length > 80) return invalid("ROLE_INVALID", "role must be text up to 80 characters.", 'Send {"role": "Physical therapist"}.');
  const active = pick("active", true);
  if (typeof active !== "boolean") return invalid("ACTIVE_INVALID", "active must be true or false.", 'Send {"active": false} to take them off the booking page.');
  return ok({ name, email, role, active });
};

// Whole days off, start_date to end_date inclusive, in the business's time zone.
export const readTimeOff = (b: Body): Result<{ from: LocalDate; to: LocalDate; note: string }> => {
  const from = b.start_date;
  const to = b.end_date ?? b.start_date;
  if (!isDate(from) || !isDate(to)) return invalid("DATES_INVALID", "start_date and end_date must be dates.", 'Send {"start_date": "2026-12-24", "end_date": "2026-12-26"}.');
  if (to < from) return invalid("DATES_INVALID", "end_date is before start_date.", "Send the first and last day off.");
  return ok({ from, to, note: (str(b.note) ?? "").slice(0, 120) });
};

export type NewBooking = { service: string; staffId: number; start: number; details: Details };

// A booking from JSON: {service, start_time, invitee: {name, email, phone?}, notes?, staff_id?}.
// The invitee's details are read by the same rules as the booking page's form.
export const readNewBooking = (b: Body): Result<NewBooking> => {
  const service = typeof b.service === "number" ? String(b.service) : str(b.service);
  if (!service) return invalid("SERVICE_REQUIRED", "service is needed: its id or slug.", "GET /api/v1/services lists them.");
  const start = readInstant(b.start_time);
  if (start === undefined) return invalid("START_TIME_INVALID", "start_time must be a date and time with its zone.", "Pick one from GET /api/v1/availability and send its start_time.");
  const staffId = b.staff_id === undefined || b.staff_id === null ? 0 : idOf(b.staff_id);
  if (b.staff_id !== undefined && b.staff_id !== null && !staffId) return invalid("STAFF_INVALID", "staff_id must be a person's id, or left out for anyone free.", "GET /api/v1/staff lists each person's id.");
  const invitee = (b.invitee && typeof b.invitee === "object" ? b.invitee : {}) as Body;
  const { details, errors } = readDetails({ ...invitee, notes: b.notes });
  const first = Object.entries(errors)[0];
  if (first) return invalid("INVITEE_INVALID", `invitee.${first[0]}: ${first[1]}.`, 'Send {"invitee": {"name": "Ana Silva", "email": "ana@example.com"}}.');
  return ok({ service, staffId, start, details });
};

// A new time for a booking: {start_time, staff_id?}; without staff_id it keeps its person.
export const readReschedule = (b: Body): Result<{ staffId: number; start: number }> => {
  const start = readInstant(b.start_time);
  if (start === undefined) return invalid("START_TIME_INVALID", "start_time must be a date and time with its zone.", "Pick one from GET /api/v1/availability and send its start_time.");
  const staffId = b.staff_id === undefined || b.staff_id === null ? 0 : idOf(b.staff_id);
  if (b.staff_id !== undefined && b.staff_id !== null && !staffId) return invalid("STAFF_INVALID", "staff_id must be a person's id, or left out to keep the same person.", "GET /api/v1/staff lists each person's id.");
  return ok({ staffId, start });
};

// ---- Shapes ----

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export const bookingJson = (b: BookingView, base: string) => ({
  id: b.id,
  status: b.status === "confirmed" ? "active" : "canceled",
  start_time: iso(b.starts_at),
  end_time: iso(b.ends_at),
  service: { id: b.service_id, name: b.service_name, duration: b.duration },
  staff: { id: b.staff_id, name: b.staff_name },
  location: b.location,
  invitee: { name: b.customer_name, email: b.customer_email, phone: b.customer_phone },
  notes: b.notes,
  created_at: iso(b.created_at),
  cancellation: b.status === "cancelled" ? { canceled_by: b.cancelled_by, canceled_at: iso(b.cancelled_at) } : null,
  reminder_sent_at: iso(b.reminder_sent_at),
  // The customer's own page, where they see, move or cancel it.
  manage_url: `${base}/b/${b.token}`,
});

export const serviceJson = (s: Service, currency: string, base: string) => ({
  id: s.id,
  slug: s.slug,
  name: s.name,
  description: s.description,
  duration: s.duration,
  buffer_after: s.buffer_after,
  price_cents: s.price_cents,
  currency,
  location: s.location,
  active: s.active,
  position: s.position,
  staff_ids: s.staff_ids,
  scheduling_url: `${base}/book/${s.slug}`,
});

export const hoursJson = (h: readonly Hours[]) => h.map((x) => ({ weekday: x.weekday, start: fmtClock(x.start), end: fmtClock(x.end) }));

export const staffJson = (p: Staff) => ({
  id: p.id,
  name: p.name,
  email: p.email,
  role: p.role,
  active: p.active,
  calendar_connected: !!p.busy_url,
  calendar_error: p.busy_error || null,
});
