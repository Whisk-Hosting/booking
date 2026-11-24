// Reading and writing rows. Each function is one small query; decisions live in model.ts and
// slots.ts. Functions that must run inside a transaction take it as their first argument.
import { createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";
import { sql, type Sql } from "./db.js";
import { KEY_PREFIX, type Booking, type BookingView, type Service, type Settings, type Staff } from "./model.js";
import type { Hours, Interval, Person } from "./slots.js";

export const token = (bytes = 18) => randomBytes(bytes).toString("base64url");

// ---- Settings ----

const settingCols = sql`business_name, tagline, accent, timezone, currency, min_notice_minutes, window_days, step_minutes,
  cancel_cutoff_minutes, reminder_minutes, email_from, reply_to`;

export const settings = async (db: Sql = sql): Promise<Settings> => (await db<Settings[]>`select ${settingCols} from settings where id = 1`)[0];

export const saveSettings = (s: Settings) =>
  sql`update settings set ${sql(s, "business_name", "tagline", "accent", "timezone", "currency", "min_notice_minutes", "window_days", "step_minutes", "cancel_cutoff_minutes", "reminder_minutes", "email_from", "reply_to")} where id = 1`;

// ---- Services ----

const serviceCols = sql`s.id, s.slug, s.name, s.description, s.duration, s.buffer_after, s.price_cents, s.location, s.active, s.position,
  coalesce((select array_agg(ss.staff_id order by ss.staff_id) from service_staff ss join staff st on st.id = ss.staff_id where ss.service_id = s.id and st.active), '{}') as staff_ids`;

export const services = (includeHidden = false) =>
  sql<Service[]>`select ${serviceCols} from services s where ${includeHidden} or s.active order by s.position, s.id`;

export const serviceBySlug = async (slug: string, includeHidden = false): Promise<Service | undefined> =>
  (await sql<Service[]>`select ${serviceCols} from services s where s.slug = ${slug} and (${includeHidden} or s.active)`)[0];

export const serviceById = async (id: number, db: Sql = sql): Promise<Service | undefined> =>
  (await db<Service[]>`select ${serviceCols} from services s where s.id = ${id}`)[0];

export const slugs = async () => (await sql<{ slug: string }[]>`select slug from services`).map((r) => r.slug);

export type ServiceInput = Pick<Service, "slug" | "name" | "description" | "duration" | "buffer_after" | "price_cents" | "location" | "active"> & { staff_ids: number[] };

export const createService = (s: ServiceInput) =>
  sql.begin(async (tx) => {
    const [row] = await tx<{ id: number }[]>`insert into services (slug, name, description, duration, buffer_after, price_cents, location, active, position)
      values (${s.slug}, ${s.name}, ${s.description}, ${s.duration}, ${s.buffer_after}, ${s.price_cents}, ${s.location}, ${s.active},
      (select coalesce(max(position), 0) + 1 from services)) returning id`;
    await setServiceStaff(tx, row.id, s.staff_ids);
    return row.id;
  });

export const updateService = (id: number, s: Omit<ServiceInput, "slug">) =>
  sql.begin(async (tx) => {
    await tx`update services set name = ${s.name}, description = ${s.description}, duration = ${s.duration}, buffer_after = ${s.buffer_after},
      price_cents = ${s.price_cents}, location = ${s.location}, active = ${s.active} where id = ${id}`;
    await setServiceStaff(tx, id, s.staff_ids);
  });

const setServiceStaff = async (tx: Sql, serviceId: number, staffIds: readonly number[]) => {
  await tx`delete from service_staff where service_id = ${serviceId}`;
  if (staffIds.length) await tx`insert into service_staff ${tx(staffIds.map((staff_id) => ({ service_id: serviceId, staff_id })))} on conflict do nothing`;
};

export const moveService = (id: number, dir: -1 | 1) =>
  sql.begin(async (tx) => {
    const rows = await tx<{ id: number }[]>`select id from services order by position, id`;
    const i = rows.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const order = rows.map((r) => r.id).map((x, k) => (k === i ? rows[j].id : k === j ? rows[i].id : x));
    await Promise.all(order.map((sid, k) => tx`update services set position = ${k + 1} where id = ${sid}`));
  });

// A service with bookings is hidden rather than deleted, so its history stays.
export const deleteService = async (id: number) => {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from bookings where service_id = ${id}`;
  if (n) await sql`update services set active = false where id = ${id}`;
  else await sql`delete from services where id = ${id}`;
  return n ? "hidden" : "deleted";
};

// ---- Staff ----

const staffCols = sql`id, name, email, role, active, feed_token, busy_url, busy_error, busy_checked_at`;

export const staff = (includeInactive = false) => sql<Staff[]>`select ${staffCols} from staff where ${includeInactive} or active order by position, id`;

export const staffById = async (id: number): Promise<Staff | undefined> => (await sql<Staff[]>`select ${staffCols} from staff where id = ${id}`)[0];

export const staffByFeed = async (feed: string): Promise<Staff | undefined> => (await sql<Staff[]>`select ${staffCols} from staff where feed_token = ${feed}`)[0];

export type StaffInput = Pick<Staff, "name" | "email" | "role" | "active" | "busy_url">;

export const createStaff = async (s: StaffInput) =>
  (
    await sql<{ id: number }[]>`insert into staff (name, email, role, active, busy_url, feed_token, position)
      values (${s.name}, ${s.email}, ${s.role}, ${s.active}, ${s.busy_url}, ${token(24)}, (select coalesce(max(position), 0) + 1 from staff)) returning id`
  )[0].id;

// A new calendar address clears what was read from the old one.
export const updateStaff = (id: number, s: StaffInput) =>
  sql`update staff set name = ${s.name}, email = ${s.email}, role = ${s.role}, active = ${s.active},
    busy = case when busy_url = ${s.busy_url} then busy else '[]' end,
    busy_checked_at = case when busy_url = ${s.busy_url} then busy_checked_at else null end,
    busy_error = case when busy_url = ${s.busy_url} then busy_error else '' end,
    busy_url = ${s.busy_url} where id = ${id}`;

export const newFeedToken = (id: number) => sql`update staff set feed_token = ${token(24)} where id = ${id}`;

export const hours = (staffIds: readonly number[], db: Sql = sql) =>
  db<(Hours & { staff_id: number })[]>`select staff_id, weekday, start_minute as start, end_minute as "end" from hours
    where staff_id = any(${staffIds as number[]}) order by weekday, start_minute`;

export const setHours = (staffId: number, rows: readonly Hours[]) =>
  sql.begin(async (tx) => {
    await tx`delete from hours where staff_id = ${staffId}`;
    if (rows.length)
      await tx`insert into hours ${tx(rows.map((h) => ({ staff_id: staffId, weekday: h.weekday, start_minute: h.start, end_minute: h.end })))}`;
  });

export type TimeOff = { id: number; staff_id: number; starts_at: Date; ends_at: Date; note: string };

export const timeOff = (staffIds: readonly number[], from: Date, db: Sql = sql) =>
  db<TimeOff[]>`select id, staff_id, starts_at, ends_at, note from time_off where staff_id = any(${staffIds as number[]}) and ends_at > ${from} order by starts_at`;

export const addTimeOff = (staffId: number, from: Date, to: Date, note: string) =>
  sql`insert into time_off (staff_id, starts_at, ends_at, note) values (${staffId}, ${from}, ${to}, ${note})`;

export const deleteTimeOff = (id: number, staffId: number) => sql`delete from time_off where id = ${id} and staff_id = ${staffId}`;

export const saveBusy = (id: number, busy: readonly Interval[], error: string) =>
  error
    ? sql`update staff set busy_error = ${error}, busy_checked_at = now() where id = ${id}`
    : sql`update staff set busy = ${sql.json(busy as unknown as postgres.JSONValue)}, busy_error = '', busy_checked_at = now() where id = ${id}`;

// ---- What the planner needs ----

// Everyone's hours and everything that blocks them between two instants: confirmed bookings
// with the buffer after each, time off, and busy times from their own calendar. `except` leaves
// one booking out, for moving it.
export const people = async (db: Sql, staffIds: readonly number[], from: Date, to: Date, except = 0): Promise<Person[]> => {
  const ids = staffIds as number[];
  const [hrs, booked, off, busy] = await Promise.all([
    hours(ids, db),
    db<{ staff_id: number; start: Date; end: Date }[]>`select b.staff_id, b.starts_at as start, b.ends_at + make_interval(mins => s.buffer_after) as "end"
      from bookings b join services s on s.id = b.service_id
      where b.staff_id = any(${ids}) and b.status = 'confirmed' and b.id <> ${except} and b.starts_at < ${to} and b.ends_at > ${from} - interval '1 day'`,
    db<{ staff_id: number; start: Date; end: Date }[]>`select staff_id, starts_at as start, ends_at as "end" from time_off
      where staff_id = any(${ids}) and starts_at < ${to} and ends_at > ${from}`,
    db<{ id: number; busy: Interval[] }[]>`select id, busy from staff where id = any(${ids})`,
  ]);
  const busyOf = new Map(busy.map((r) => [r.id, r.busy]));
  return staffIds.map((id) => ({
    id,
    hours: hrs.filter((h) => h.staff_id === id).map(({ weekday, start, end }) => ({ weekday, start, end })),
    blocked: [
      ...[...booked, ...off].filter((b) => b.staff_id === id).map((b) => ({ start: b.start.getTime(), end: b.end.getTime() })),
      ...(busyOf.get(id) ?? []),
    ],
  }));
};

// ---- Bookings ----

const viewCols = sql`b.id, b.token, b.service_id, b.staff_id, b.starts_at, b.ends_at, b.status, b.customer_name, b.customer_email,
  b.customer_phone, b.notes, b.created_at, b.cancelled_at, b.cancelled_by, b.reminder_sent_at,
  s.name as service_name, s.location, s.duration, s.buffer_after, st.name as staff_name, st.email as staff_email`;
const viewFrom = sql`bookings b join services s on s.id = b.service_id join staff st on st.id = b.staff_id`;

export const bookingByToken = async (t: string): Promise<BookingView | undefined> =>
  (await sql<BookingView[]>`select ${viewCols} from ${viewFrom} where b.token = ${t}`)[0];

export const bookingById = async (id: number, db: Sql = sql): Promise<BookingView | undefined> =>
  (await db<BookingView[]>`select ${viewCols} from ${viewFrom} where b.id = ${id}`)[0];

export const schedule = (from: Date, to: Date, staffId: number, includeCancelled: boolean) =>
  sql<BookingView[]>`select ${viewCols} from ${viewFrom}
    where b.starts_at >= ${from} and b.starts_at < ${to} and (${staffId} = 0 or b.staff_id = ${staffId})
      and (${includeCancelled} or b.status = 'confirmed')
    order by b.starts_at, st.position`;

export const search = (q: string) =>
  sql<BookingView[]>`select ${viewCols} from ${viewFrom}
    where b.customer_name ilike ${"%" + q.replace(/[\\%_]/g, "\\$&") + "%"} or b.customer_email ilike ${"%" + q.replace(/[\\%_]/g, "\\$&") + "%"}
    order by b.starts_at desc limit 50`;

export const loadThatDay = async (db: Sql, staffIds: readonly number[], from: Date, to: Date) =>
  new Map(
    (
      await db<{ staff_id: number; n: number }[]>`select staff_id, count(*)::int as n from bookings
        where staff_id = any(${staffIds as number[]}) and status = 'confirmed' and starts_at >= ${from} and starts_at < ${to} group by staff_id`
    ).map((r) => [r.staff_id, r.n]),
  );

// Locks the people a booking could go to, so two bookings for the same time wait for each other
// and the second sees the first.
export const lockStaff = (db: Sql, staffIds: readonly number[]) => db`select id from staff where id = any(${staffIds as number[]}) order by id for update`;

export type NewBooking = Pick<Booking, "service_id" | "staff_id" | "starts_at" | "ends_at" | "customer_name" | "customer_email" | "customer_phone" | "notes"> & { created_by: string };

export const insertBooking = async (db: Sql, b: NewBooking) =>
  (
    await db<{ id: number }[]>`insert into bookings (token, service_id, staff_id, starts_at, ends_at, customer_name, customer_email, customer_phone, notes, created_by)
      values (${token()}, ${b.service_id}, ${b.staff_id}, ${b.starts_at}, ${b.ends_at}, ${b.customer_name}, ${b.customer_email}, ${b.customer_phone}, ${b.notes}, ${b.created_by})
      returning id`
  )[0].id;

export const moveBooking = (db: Sql, id: number, staffId: number, start: Date, end: Date) =>
  db`update bookings set staff_id = ${staffId}, starts_at = ${start}, ends_at = ${end}, reminder_sent_at = null where id = ${id}`;

export const cancelBooking = (id: number, by: string) =>
  sql`update bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = ${by} where id = ${id} and status = 'confirmed'`;

export const remindersToSend = (until: Date) =>
  sql<BookingView[]>`select ${viewCols} from ${viewFrom}
    where b.status = 'confirmed' and b.reminder_sent_at is null and b.starts_at > now() and b.starts_at <= ${until} order by b.starts_at limit 500`;

// Marks it first, so a retried run never reminds twice; answers false when another run did.
export const markReminded = async (id: number) => (await sql`update bookings set reminder_sent_at = now() where id = ${id} and reminder_sent_at is null`).count === 1;

export const feedBookings = (staffId: number) =>
  sql<BookingView[]>`select ${viewCols} from ${viewFrom}
    where b.staff_id = ${staffId} and b.starts_at > now() - interval '30 days' order by b.starts_at limit 2000`;

export const counts = async (from: Date, to: Date) =>
  (
    await sql<{ upcoming: number; today: number; week: number }[]>`select
      count(*) filter (where starts_at >= now())::int as upcoming,
      count(*) filter (where starts_at >= ${from} and starts_at < ${to})::int as today,
      count(*) filter (where created_at > now() - interval '7 days')::int as week
      from bookings where status = 'confirmed'`
  )[0];

// ---- Email ----

export type EmailRow = { id: number; booking_id: number | null; kind: string; to_address: string; subject: string; html: string; body_text: string; status: string; error: string; created_at: Date };

export const queueEmail = async (e: { booking_id: number | null; kind: string; to: string; subject: string; html: string; text: string }) =>
  (
    await sql<{ id: number }[]>`insert into emails (booking_id, kind, to_address, subject, html, body_text)
      values (${e.booking_id}, ${e.kind}, ${e.to}, ${e.subject}, ${e.html}, ${e.text}) returning id`
  )[0].id;

export const emailById = async (id: number): Promise<EmailRow | undefined> =>
  (await sql<EmailRow[]>`select id, booking_id, kind, to_address, subject, html, body_text, status, error, created_at from emails where id = ${id}`)[0];

export const markEmail = (id: number, status: "sent" | "failed" | "demo", error = "") =>
  sql`update emails set status = ${status}, error = ${error}, sent_at = case when ${status} = 'sent' then now() else sent_at end where id = ${id}`;

export const recentEmails = (limit = 30) =>
  sql<EmailRow[]>`select id, booking_id, kind, to_address, subject, '' as html, '' as body_text, status, error, created_at from emails order by created_at desc, id desc limit ${limit}`;

export const emailsFor = (bookingId: number) =>
  sql<EmailRow[]>`select id, booking_id, kind, to_address, subject, '' as html, '' as body_text, status, error, created_at from emails where booking_id = ${bookingId} order by created_at`;

// How many confirmed bookings start on each of the business's dates in a range.
export const perDay = async (from: Date, to: Date, tz: string, staffId: number) =>
  new Map(
    (
      await sql<{ day: string; n: number }[]>`select to_char(starts_at at time zone ${tz}, 'YYYY-MM-DD') as day, count(*)::int as n from bookings
        where status = 'confirmed' and starts_at >= ${from} and starts_at < ${to} and (${staffId} = 0 or staff_id = ${staffId}) group by 1`
    ).map((r) => [r.day, r.n]),
  );

// ---- Bookings for the API: filtered, oldest start first, one page at a time ----

export type BookingFilter = { from?: Date; to?: Date; status?: Booking["status"]; staffId?: number; email?: string; limit: number; offset: number };

// One row more than the page, so the caller knows whether another page follows.
export const bookingsPage = (f: BookingFilter) =>
  sql<BookingView[]>`select ${viewCols} from ${viewFrom}
    where true
      ${f.from ? sql`and b.starts_at >= ${f.from}` : sql``}
      ${f.to ? sql`and b.starts_at < ${f.to}` : sql``}
      ${f.status ? sql`and b.status = ${f.status}` : sql``}
      ${f.staffId ? sql`and b.staff_id = ${f.staffId}` : sql``}
      ${f.email ? sql`and lower(b.customer_email) = ${f.email.toLowerCase()}` : sql``}
    order by b.starts_at, b.id limit ${f.limit + 1} offset ${f.offset}`;

// ---- Customers: everyone who has booked, by email address ----

export type Customer = { email: string; name: string; phone: string; bookings: number; upcoming: number; first_booking_at: Date; last_booking_at: Date };

const customerCols = sql`lower(customer_email) as email,
  (array_agg(customer_name order by created_at desc))[1] as name,
  coalesce((array_agg(customer_phone order by created_at desc) filter (where customer_phone <> ''))[1], '') as phone,
  count(*)::int as bookings,
  (count(*) filter (where status = 'confirmed' and starts_at > now()))::int as upcoming,
  min(starts_at) as first_booking_at, max(starts_at) as last_booking_at`;

export const customers = (q: string, limit: number, offset: number) => {
  const like = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
  return sql<Customer[]>`select ${customerCols} from bookings
    where ${q} = '' or customer_name ilike ${like} or customer_email ilike ${like}
    group by 1 order by max(created_at) desc, 1 limit ${limit + 1} offset ${offset}`;
};

export const customerByEmail = async (email: string): Promise<Customer | undefined> =>
  (await sql<Customer[]>`select ${customerCols} from bookings where lower(customer_email) = ${email.toLowerCase()} group by 1`)[0];

// ---- API keys ----

export type ApiKey = { id: number; label: string; prefix: string; created_by: string; created_at: Date; last_used_at: Date | null };

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

// createKey makes a key and keeps only its hash; the caller shows the key once.
export const createKey = async (label: string, by: string): Promise<string> => {
  const key = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  await sql`insert into api_keys (label, prefix, hash, created_by) values (${label}, ${key.slice(0, 10)}, ${hashKey(key)}, ${by})`;
  return key;
};

export const keyFor = async (key: string): Promise<ApiKey | undefined> =>
  (
    await sql<ApiKey[]>`update api_keys set last_used_at = now() where hash = ${hashKey(key)}
      returning id, label, prefix, created_by, created_at, last_used_at`
  )[0];

export const apiKeys = () => sql<ApiKey[]>`select id, label, prefix, created_by, created_at, last_used_at from api_keys order by id desc`;

export const revokeKey = async (id: number) => (await sql<{ label: string }[]>`delete from api_keys where id = ${id} returning label`)[0]?.label;
