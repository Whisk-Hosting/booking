// What every page route shares: rendering inside the layout, who is asking, and reading form
// fields and query values safely.
import type { Context } from "hono";
import { demoBar, viewer } from "./demo.js";
import { isZone, type LocalDate, isDate } from "./time.js";
import * as store from "./store.js";
import { layout, message, type Html, type StaffNav } from "./views/layout.js";
import type { Identity } from "./whisk.js";

// Staff are the business's team. Owners, admins and developers, and anyone in the
// booking-admins group, also look after services, the team and settings.
export const isStaff = (id: Identity) => id.audience === "team";
export const isAdmin = (id: Identity) => isStaff(id) && (id.roles.some((r) => ["owner", "admin", "developer"].includes(r)) || id.groups.includes("booking-admins"));
export const actorName = (id: Identity) => id.name?.trim() || id.email || "Staff";

type Status = 200 | 400 | 403 | 404 | 409;

export const renderPublic = async (c: Context, title: string, body: Html, status: Status = 200) => {
  const s = await store.settings();
  return c.html(layout({ s, title, body, extra: demoBar(c, false) }), status);
};

export const renderStaff = async (c: Context, title: string, body: Html, nav?: StaffNav, status: Status = 200) => {
  const [s, id] = [await store.settings(), viewer(c)];
  return c.html(layout({ s, title, body, staff: { nav, admin: isAdmin(id), email: id.email ?? "" }, extra: demoBar(c, true) }), status);
};

export const notFound = (c: Context, staff = false) => {
  const body = message("Nothing here", "It may have moved, or the link is missing a part.", { href: staff ? "/schedule" : "/", label: staff ? "Back to the schedule" : "See what you can book" });
  return staff ? renderStaff(c, "Not found", body, undefined, 404) : renderPublic(c, "Not found", body, 404);
};

// Messages shown after a redirect, by key, so no text travels in the address.
const flashes: Record<string, string> = {
  saved: "Saved.",
  created: "Added.",
  deleted: "Deleted.",
  hidden: "It has bookings, so it is hidden from the booking page instead of deleted.",
  moved: "Moved. We've emailed the new time.",
  cancelled: "Canceled. We've let them know.",
  booked: "Booked. We've emailed the details.",
  feed: "New calendar feed address made. The old one no longer works.",
  key_revoked: "Key revoked. Anything using it stops working now.",
};
export const flash = (c: Context) => flashes[c.req.query("ok") ?? ""];

export const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const intIn = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
};
export const posInt = (v: unknown) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 && n < 2 ** 31 ? n : 0;
};
export const idParam = (c: Context, name = "id") => posInt(c.req.param(name));
export const zoneParam = (c: Context, fallback: string) => {
  const tz = c.req.query("tz") ?? "";
  return tz && tz.length < 64 && isZone(tz) ? tz : fallback;
};
export const dateParam = (v: string | undefined): LocalDate | null => (isDate(v) ? v : null);
export const monthParam = (v: string | undefined) => (v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null);
export const form = async (c: Context) => (await c.req.parseBody()) as Record<string, string | File>;
export const field = (f: Record<string, unknown>, name: string) => (typeof f[name] === "string" ? (f[name] as string) : "");

// The query string for a page with some values changed; empty values drop out.
export const withQuery = (path: string, q: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== 0).map(([k, v]) => [k, String(v)]));
  return p.size ? `${path}?${p}` : path;
};
