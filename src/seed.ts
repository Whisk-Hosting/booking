// The sample business every fresh install starts with, so the booking page is never empty: a
// small physical therapy clinic with three people, four services and two weeks of bookings around
// today. The demo resets to the same data every night. Change it all from the staff side.
import { randomBytes } from "node:crypto";
import type { Sql } from "./db.js";
import { addDays, instantOf, localDate, weekdayOf } from "./time.js";

const tok = () => randomBytes(18).toString("base64url");

const PEOPLE = [
  { name: "Sarah Mitchell", email: "sarah@example.com", role: "Physical therapist", days: [1, 2, 3, 4, 5], shifts: [[8 * 60 + 30, 12 * 60 + 30], [13 * 60 + 30, 17 * 60]] },
  { name: "Sam Patel", email: "sam@example.com", role: "Physical therapist", days: [1, 3, 4, 5, 6], shifts: [[9 * 60, 17 * 60 + 30]] },
  { name: "Mia Chen", email: "mia@example.com", role: "Massage therapist", days: [2, 3, 4, 6], shifts: [[10 * 60, 18 * 60]] },
];

const SERVICES = [
  { slug: "first-visit", name: "First visit", description: "A full assessment and your first treatment. Bring any scans or referral notes.", duration: 60, buffer: 10, price: 11000, location: "120 Main Street, Suite 200, Stamford, CT 06901", staff: [0, 1] },
  { slug: "follow-up", name: "Follow-up", description: "Treatment and progress check for an injury we're already seeing.", duration: 30, buffer: 10, price: 7500, location: "120 Main Street, Suite 200, Stamford, CT 06901", staff: [0, 1] },
  { slug: "sports-massage", name: "Sports massage", description: "Deep tissue work for tight, sore or recovering muscles.", duration: 45, buffer: 15, price: 9500, location: "120 Main Street, Suite 200, Stamford, CT 06901", staff: [2] },
  { slug: "video-consult", name: "Video consult", description: "Advice, exercises and a plan, wherever you are. We email the link.", duration: 30, buffer: 0, price: 6000, location: "Video call", staff: [0, 1] },
];

const CUSTOMERS = ["Jack Wilson", "Olivia Brown", "James Carter", "Charlotte Smith", "Liam Taylor", "Ava Martin", "Noah Williams", "Ruby Anderson", "Michael Torres", "Grace Lee", "Leo Thompson", "Amelia White", "Emily Brooks", "Zoe Clark", "Oscar Hall"];

// Bookings as (day from today, person, service, minutes past midnight).
const PLAN: [number, number, number, number][] = [
  [-1, 0, 0, 9 * 60], [-1, 1, 1, 10 * 60], [-1, 2, 2, 14 * 60],
  [0, 0, 1, 9 * 60], [0, 0, 0, 10 * 60 + 30], [0, 1, 0, 11 * 60], [0, 1, 3, 15 * 60], [0, 2, 2, 13 * 60], [0, 0, 1, 15 * 60 + 30],
  [1, 0, 0, 9 * 60], [1, 1, 1, 9 * 60 + 30], [1, 2, 2, 10 * 60 + 30], [1, 2, 2, 15 * 60],
  [2, 1, 0, 14 * 60], [2, 0, 3, 11 * 60], [3, 2, 2, 11 * 60], [3, 0, 1, 16 * 60],
  [4, 1, 1, 10 * 60], [6, 0, 0, 9 * 60 + 30], [7, 2, 2, 12 * 60], [8, 1, 0, 13 * 60], [9, 0, 1, 14 * 60],
];

// Adds the sample business when there are no services yet. Answers whether it did.
export const seed = async (db: Sql, now = Date.now()): Promise<boolean> => {
  const [{ n }] = await db<{ n: number }[]>`select count(*)::int as n from services`;
  if (n > 0) return false;
  const tz = "America/New_York";
  await db`update settings set business_name = 'Brookside Physical Therapy', tagline = 'Physical therapy and massage on Main Street. Book online any time.', timezone = ${tz}, currency = 'USD' where id = 1`;
  const staffIds = await Promise.all(
    PEOPLE.map(async (p, i) => (await db<{ id: number }[]>`insert into staff (name, email, role, position, feed_token) values (${p.name}, ${p.email}, ${p.role}, ${i + 1}, ${tok()}) returning id`)[0].id),
  );
  const hourRows = PEOPLE.flatMap((p, i) => p.days.flatMap((weekday) => p.shifts.map(([start, end]) => ({ staff_id: staffIds[i], weekday, start_minute: start, end_minute: end }))));
  await db`insert into hours ${db(hourRows)}`;
  const serviceIds = await Promise.all(
    SERVICES.map(
      async (s, i) =>
        (
          await db<{ id: number }[]>`insert into services (slug, name, description, duration, buffer_after, price_cents, location, position)
          values (${s.slug}, ${s.name}, ${s.description}, ${s.duration}, ${s.buffer}, ${s.price}, ${s.location}, ${i + 1}) returning id`
        )[0].id,
    ),
  );
  await db`insert into service_staff ${db(SERVICES.flatMap((s, i) => s.staff.map((p) => ({ service_id: serviceIds[i], staff_id: staffIds[p] }))))}`;

  // Mia is away for a long weekend next week.
  const away = addDays(localDate(now, tz), 10);
  await db`insert into time_off (staff_id, starts_at, ends_at, note) values (${staffIds[2]}, ${new Date(instantOf(away, 0, tz))}, ${new Date(instantOf(addDays(away, 3), 0, tz))}, 'Long weekend')`;

  // Only bookings that fall inside that person's hours, so the sample makes sense on any day.
  const today = localDate(now, tz);
  const rows = PLAN.flatMap(([day, p, s, minute], i) => {
    const date = addDays(today, day);
    const sv = SERVICES[s];
    const inHours = PEOPLE[p].days.includes(weekdayOf(date)) && PEOPLE[p].shifts.some(([a, b]) => minute >= a && minute + sv.duration <= b);
    if (!inHours || !sv.staff.includes(p)) return [];
    const name = CUSTOMERS[i % CUSTOMERS.length];
    const start = instantOf(date, minute, tz);
    return [{
      token: tok(),
      service_id: serviceIds[s],
      staff_id: staffIds[p],
      starts_at: new Date(start),
      ends_at: new Date(start + sv.duration * 60_000),
      customer_name: name,
      customer_email: `${name.split(" ")[0].toLowerCase()}@example.com`,
      customer_phone: `(203) 555-0${100 + i}`,
      notes: i % 4 === 0 ? "Left knee, been sore since a run last week." : "",
      created_at: new Date(start - (3 + (i % 5)) * 86_400_000),
      reminder_sent_at: start < now + 86_400_000 ? new Date(Math.min(now, start - 86_400_000)) : null,
    }];
  });
  if (rows.length) await db`insert into bookings ${db(rows)}`;
  return true;
};
