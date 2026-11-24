// /api/v1: the business's bookings for other systems and AI agents, everything the staff side
// does. An admin makes keys under Settings; each call sends one (see api-rules.ts keyFrom).
// Errors are {"error": {code, message, fix}}. Booking, moving and canceling go through the same
// functions as the pages, so the same rules hold and the same emails go out.
import { Hono, type Context } from "hono";
import { book, cancel, findSlots, move, type Actor } from "./booking.js";
import { checkUrl } from "./busy.js";
import { isDemo } from "./demo.js";
import { baseUrl } from "./mail.js";
import { slugify, staffMayChange, uniqueSlug, type Service } from "./model.js";
import {
  bookingJson,
  hoursJson,
  idOf,
  isKeyShape,
  keyFrom,
  pageOf,
  readHours,
  readNewBooking,
  readPage,
  readPerson,
  readReschedule,
  readService,
  readStatus,
  readTimeOff,
  readWindow,
  serviceJson,
  staffJson,
  type Body,
  type Problem,
} from "./api-rules.js";
import * as store from "./store.js";
import { addDays, instantOf, localDate } from "./time.js";

type Env = { Variables: { key: store.ApiKey } };
export const api = new Hono<Env>();

export const fail = (c: Context, p: Omit<Problem, "status"> & { status: Problem["status"] | 500 }) => c.json({ error: { code: p.code, message: p.message, fix: p.fix } }, p.status);
const failWith = (c: Context, status: Problem["status"], code: string, message: string, fix: string) => fail(c, { status, code, message, fix });

const WHERE_KEYS = "An admin makes keys under Settings > API keys.";

// The endpoint list is open, so an agent can find its way before it has a key.
const endpoints = [
  "GET /api/v1/services?include_hidden=true",
  "POST /api/v1/services {name, duration, description?, buffer_after?, price_cents?, location?, active?, staff_ids?}",
  "GET /api/v1/services/:id_or_slug",
  "PATCH /api/v1/services/:id_or_slug {any field above}",
  "DELETE /api/v1/services/:id_or_slug (hidden instead when it has bookings)",
  "GET /api/v1/staff?include_inactive=true",
  "POST /api/v1/staff {name, email?, role?, active?, calendar_url?, hours?: [{weekday: 0-6, start: HH:MM, end: HH:MM}]}",
  "GET /api/v1/staff/:id",
  "PATCH /api/v1/staff/:id {name?, email?, role?, active?, calendar_url?}",
  "PUT /api/v1/staff/:id/hours {hours: [{weekday, start, end}]}",
  "POST /api/v1/staff/:id/time_off {start_date, end_date?, note?}",
  "DELETE /api/v1/staff/:id/time_off/:time_off_id",
  "GET /api/v1/availability?service=&staff_id=&start_time=&end_time= (at most 31 days)",
  "GET /api/v1/bookings?min_start_time=&max_start_time=&status=active|canceled&staff_id=&invitee_email=&limit=&offset=",
  "POST /api/v1/bookings {service, start_time, invitee: {name, email, phone?}, notes?, staff_id?}",
  "GET /api/v1/bookings/:id",
  "POST /api/v1/bookings/:id/reschedule {start_time, staff_id?}",
  "POST /api/v1/bookings/:id/cancel",
  "GET /api/v1/customers?q=&limit=&offset=",
  "GET /api/v1/customers/:email",
];

api.get("/", (c) =>
  c.json({
    endpoints,
    auth: `Authorization: Bearer <key>, X-Api-Key: <key>, Basic auth with the key as the user name, or ?token=<key>. ${WHERE_KEYS}`,
    pagination: "Lists take ?limit= (1-200, default 50) and ?offset=; each answer has next_offset, null on the last page.",
    errors: '{"error": {"code", "message", "fix"}}',
  }),
);

api.use("*", async (c, next) => {
  if (c.req.path.replace(/\/$/, "") === "/api/v1" && c.req.method === "GET") return next();
  const raw = keyFrom((n) => c.req.header(n), c.req.query("token"));
  const key = raw && isKeyShape(raw) ? await store.keyFor(raw) : undefined;
  if (!key)
    return failWith(c, 401, raw ? "API_KEY_INVALID" : "API_KEY_REQUIRED", raw ? "That API key is not one this app knows. It may have been revoked." : "This needs an API key.", `Send Authorization: Bearer <key>. ${WHERE_KEYS}`);
  c.set("key", key);
  c.header("Cache-Control", "no-store");
  await next();
});

const actor = (c: Context<Env>): Actor => ({ kind: "staff", name: `API key "${c.get("key").label}"` });

// The JSON body, or undefined when it isn't a JSON object.
const body = async (c: Context): Promise<Body | undefined> => {
  const b = await c.req.json().catch(() => undefined);
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Body) : undefined;
};
const badBody = (c: Context) => failWith(c, 400, "BODY_INVALID", "The body is not a JSON object.", "Send Content-Type: application/json and a JSON object.");

// A service by its id or its slug, hidden ones included, as on the staff side.
const serviceFrom = async (ref: string): Promise<Service | undefined> => (idOf(ref) ? store.serviceById(idOf(ref)) : store.serviceBySlug(ref, true));
const noService = (c: Context) => failWith(c, 404, "SERVICE_NOT_FOUND", "No service has that id or slug.", "GET /api/v1/services lists them.");
const noStaff = (c: Context) => failWith(c, 404, "STAFF_NOT_FOUND", "No one on the team has that id.", "GET /api/v1/staff lists them.");
const noBooking = (c: Context) => failWith(c, 404, "BOOKING_NOT_FOUND", "No booking has that id.", "GET /api/v1/bookings lists them.");
const taken = (c: Context) => failWith(c, 409, "SLOT_TAKEN", "That time is not free, or has just gone.", "GET /api/v1/availability for the service and pick another start_time.");
const closed = (c: Context) => failWith(c, 409, "BOOKING_CLOSED", "This booking is canceled or already over, so it can't change.", "Make a new booking instead.");

// ---- Services ----

const activeStaffIds = async () => (await store.staff()).map((p) => p.id);

api.get("/services", async (c) => {
  const [s, list] = await Promise.all([store.settings(), store.services(c.req.query("include_hidden") === "true")]);
  return c.json({ services: list.map((sv) => serviceJson(sv, s.currency, baseUrl())) });
});

api.get("/services/:ref", async (c) => {
  const sv = await serviceFrom(c.req.param("ref"));
  return sv ? c.json({ service: serviceJson(sv, (await store.settings()).currency, baseUrl()) }) : noService(c);
});

api.post("/services", async (c) => {
  const b = await body(c);
  if (!b) return badBody(c);
  const r = readService(b, undefined, await activeStaffIds());
  if (!r.ok) return fail(c, r.problem);
  const id = await store.createService({ ...r.value, slug: uniqueSlug(slugify(r.value.name), await store.slugs()) });
  return c.json({ service: serviceJson((await store.serviceById(id))!, (await store.settings()).currency, baseUrl()) }, 201);
});

api.patch("/services/:ref", async (c) => {
  const sv = await serviceFrom(c.req.param("ref"));
  if (!sv) return noService(c);
  const b = await body(c);
  if (!b) return badBody(c);
  const r = readService(b, sv, await activeStaffIds());
  if (!r.ok) return fail(c, r.problem);
  await store.updateService(sv.id, r.value);
  return c.json({ service: serviceJson((await store.serviceById(sv.id))!, (await store.settings()).currency, baseUrl()) });
});

api.delete("/services/:ref", async (c) => {
  const sv = await serviceFrom(c.req.param("ref"));
  if (!sv) return noService(c);
  return c.json({ id: sv.id, result: await store.deleteService(sv.id) });
});

// ---- Staff ----

const personJson = async (id: number) => {
  const p = (await store.staffById(id))!;
  const [hours, off] = await Promise.all([store.hours([id]), store.timeOff([id], new Date())]);
  return {
    ...staffJson(p),
    hours: hoursJson(hours),
    time_off: off.map((t) => ({ id: t.id, start_time: t.starts_at.toISOString(), end_time: t.ends_at.toISOString(), note: t.note })),
    feed_url: `${baseUrl()}/feeds/${p.feed_token}.ics`,
  };
};

// calendar_url: their own calendar's private iCal address, checked as on the Team page. The
// demo keeps it as it was, as the Team page does.
const calendarFrom = (b: Body, old: string): { url: string } | { error: string } => {
  if (!Object.hasOwn(b, "calendar_url") || isDemo()) return { url: old };
  if (typeof b.calendar_url !== "string" && b.calendar_url !== null) return { error: "calendar_url must be text, or null for none." };
  const r = checkUrl(b.calendar_url ?? "");
  return r.error ? { error: r.error } : { url: r.url ?? "" };
};

api.get("/staff", async (c) => c.json({ staff: (await store.staff(c.req.query("include_inactive") === "true")).map(staffJson) }));

api.get("/staff/:id", async (c) => ((await store.staffById(idOf(c.req.param("id")))) ? c.json({ staff: await personJson(idOf(c.req.param("id"))) }) : noStaff(c)));

api.post("/staff", async (c) => {
  const b = await body(c);
  if (!b) return badBody(c);
  const r = readPerson(b, undefined);
  if (!r.ok) return fail(c, r.problem);
  const hours = readHours(b.hours ?? []);
  if (!hours.ok) return fail(c, hours.problem);
  const cal = calendarFrom(b, "");
  if ("error" in cal) return failWith(c, 422, "CALENDAR_URL_INVALID", cal.error, "Send the calendar's private iCal address, or leave calendar_url out.");
  const id = await store.createStaff({ ...r.value, busy_url: cal.url });
  await store.setHours(id, hours.value);
  return c.json({ staff: await personJson(id) }, 201);
});

api.patch("/staff/:id", async (c) => {
  const p = await store.staffById(idOf(c.req.param("id")));
  if (!p) return noStaff(c);
  const b = await body(c);
  if (!b) return badBody(c);
  const r = readPerson(b, p);
  if (!r.ok) return fail(c, r.problem);
  const cal = calendarFrom(b, p.busy_url);
  if ("error" in cal) return failWith(c, 422, "CALENDAR_URL_INVALID", cal.error, "Send the calendar's private iCal address, or null for none.");
  await store.updateStaff(p.id, { ...r.value, busy_url: cal.url });
  return c.json({ staff: await personJson(p.id) });
});

api.put("/staff/:id/hours", async (c) => {
  const p = await store.staffById(idOf(c.req.param("id")));
  if (!p) return noStaff(c);
  const b = await body(c);
  if (!b) return badBody(c);
  const r = readHours(b.hours);
  if (!r.ok) return fail(c, r.problem);
  await store.setHours(p.id, r.value);
  return c.json({ staff: await personJson(p.id) });
});

api.post("/staff/:id/time_off", async (c) => {
  const p = await store.staffById(idOf(c.req.param("id")));
  if (!p) return noStaff(c);
  const b = await body(c);
  if (!b) return badBody(c);
  const r = readTimeOff(b);
  if (!r.ok) return fail(c, r.problem);
  const s = await store.settings();
  // Whole days, from the start of the first to the end of the last, as on the Team page.
  await store.addTimeOff(p.id, new Date(instantOf(r.value.from, 0, s.timezone)), new Date(instantOf(addDays(r.value.to, 1), 0, s.timezone)), r.value.note);
  return c.json({ staff: await personJson(p.id) }, 201);
});

api.delete("/staff/:id/time_off/:off", async (c) => {
  const p = await store.staffById(idOf(c.req.param("id")));
  if (!p) return noStaff(c);
  await store.deleteTimeOff(idOf(c.req.param("off")), p.id);
  return c.body(null, 204);
});

// ---- Availability ----

api.get("/availability", async (c) => {
  const sv = await serviceFrom(c.req.query("service") ?? "");
  if (!sv) return failWith(c, c.req.query("service") ? 404 : 400, c.req.query("service") ? "SERVICE_NOT_FOUND" : "SERVICE_REQUIRED", "Say which service: ?service= its id or slug.", "GET /api/v1/services lists them.");
  const staffId = c.req.query("staff_id") ? idOf(c.req.query("staff_id")) : 0;
  if (c.req.query("staff_id") && !sv.staff_ids.includes(staffId)) return failWith(c, 400, "STAFF_INVALID", "staff_id is not someone who does this service.", "Leave staff_id out for anyone free, or use one of the service's staff_ids.");
  const w = readWindow(c.req.query("start_time"), c.req.query("end_time"), Date.now());
  if (!w.ok) return fail(c, w.problem);
  const s = await store.settings();
  const slots = await findSlots(sv, staffId, s, actor(c), localDate(w.value.start, s.timezone), localDate(w.value.end, s.timezone));
  return c.json({
    service: { id: sv.id, slug: sv.slug, name: sv.name, duration: sv.duration },
    timezone: s.timezone,
    available_times: slots
      .filter((x) => x.start >= w.value.start && x.start < w.value.end)
      .map((x) => ({ status: "available", start_time: new Date(x.start).toISOString(), end_time: new Date(x.end).toISOString(), staff_ids: x.people })),
  });
});

// ---- Bookings ----

api.get("/bookings", async (c) => {
  const q = (k: string) => c.req.query(k);
  const page = readPage(q("limit"), q("offset"));
  if (!page.ok) return fail(c, page.problem);
  const status = readStatus(q("status"));
  if (!status.ok) return fail(c, status.problem);
  const from = q("min_start_time") ? new Date(q("min_start_time")!) : undefined;
  const to = q("max_start_time") ? new Date(q("max_start_time")!) : undefined;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())))
    return failWith(c, 400, "TIME_INVALID", "min_start_time and max_start_time must be dates or dates and times.", "Send them like 2026-11-01 or 2026-11-01T00:00:00Z.");
  const rows = await store.bookingsPage({ from, to, status: status.value, staffId: idOf(q("staff_id")), email: q("invitee_email") || undefined, ...page.value });
  const { items, next_offset } = pageOf(rows, page.value);
  return c.json({ bookings: items.map((b) => bookingJson(b, baseUrl())), next_offset });
});

api.get("/bookings/:id", async (c) => {
  const b = await store.bookingById(idOf(c.req.param("id")));
  if (!b) return noBooking(c);
  const emails = await store.emailsFor(b.id);
  return c.json({ booking: bookingJson(b, baseUrl()), emails: emails.map((e) => ({ kind: e.kind, to: e.to_address, subject: e.subject, status: e.status, created_at: e.created_at.toISOString() })) });
});

api.post("/bookings", async (c) => {
  const b = await body(c);
  if (!b) return badBody(c);
  const r = readNewBooking(b);
  if (!r.ok) return fail(c, r.problem);
  const sv = await serviceFrom(r.value.service);
  if (!sv) return noService(c);
  if (r.value.staffId && !sv.staff_ids.includes(r.value.staffId)) return failWith(c, 422, "STAFF_INVALID", "staff_id is not someone who does this service.", "Leave staff_id out for anyone free, or use one of the service's staff_ids.");
  const done = await book(sv, r.value.staffId, r.value.start, r.value.details, await store.settings(), actor(c));
  return done.ok ? c.json({ booking: bookingJson(done.booking, baseUrl()) }, 201) : taken(c);
});

api.post("/bookings/:id/reschedule", async (c) => {
  const bk = await store.bookingById(idOf(c.req.param("id")));
  if (!bk) return noBooking(c);
  if (!staffMayChange(bk, Date.now())) return closed(c);
  const b = await body(c);
  if (!b) return badBody(c);
  const r = readReschedule(b);
  if (!r.ok) return fail(c, r.problem);
  const [s, sv] = await Promise.all([store.settings(), store.serviceById(bk.service_id)]);
  if (!sv) return noService(c);
  if (r.value.staffId && !sv.staff_ids.includes(r.value.staffId)) return failWith(c, 422, "STAFF_INVALID", "staff_id is not someone who does this service.", "Leave staff_id out to keep the same person.");
  const done = await move(bk, sv, r.value.staffId, r.value.start, s, actor(c));
  return done.ok ? c.json({ booking: bookingJson(done.booking, baseUrl()) }) : taken(c);
});

api.post("/bookings/:id/cancel", async (c) => {
  const bk = await store.bookingById(idOf(c.req.param("id")));
  if (!bk) return noBooking(c);
  if (!staffMayChange(bk, Date.now())) return closed(c);
  const after = await cancel(bk, await store.settings(), `API key "${c.get("key").label}"`);
  return c.json({ booking: bookingJson(after, baseUrl()) });
});

// ---- Customers ----

const customerJson = (x: store.Customer) => ({ ...x, first_booking_at: x.first_booking_at.toISOString(), last_booking_at: x.last_booking_at.toISOString() });

api.get("/customers", async (c) => {
  const page = readPage(c.req.query("limit"), c.req.query("offset"));
  if (!page.ok) return fail(c, page.problem);
  const rows = await store.customers((c.req.query("q") ?? "").trim().slice(0, 100), page.value.limit, page.value.offset);
  const { items, next_offset } = pageOf(rows, page.value);
  return c.json({ customers: items.map(customerJson), next_offset });
});

api.get("/customers/:email", async (c) => {
  const email = decodeURIComponent(c.req.param("email")).trim().toLowerCase();
  const x = await store.customerByEmail(email);
  if (!x) return failWith(c, 404, "CUSTOMER_NOT_FOUND", "No one has booked with that email address.", "GET /api/v1/customers?q= finds a customer.");
  const rows = await store.bookingsPage({ email, limit: 200, offset: 0 });
  return c.json({ customer: customerJson(x), bookings: rows.slice(0, 200).map((b) => bookingJson(b, baseUrl())) });
});
