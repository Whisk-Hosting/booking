// The booking page anyone can open: services, the picker, the details form, and each booking's
// private page where the customer sees, moves or cancels it. Public POSTs are under
// routes.challenge in whisk.yaml, so bots have to do work before they can book.
import type { Context, Hono } from "hono";
import { book, candidates, cancel, move } from "../booking.js";
import { calendar } from "../ics.js";
import { eventOf } from "../emails.js";
import { baseUrl } from "../mail.js";
import { customerMayChange, readDetails, type Service } from "../model.js";
import type { Slot } from "../slots.js";
import * as store from "../store.js";
import { fmtDay, fmtTime } from "../time.js";
import { detailsPage, home, bookingPage, moveConfirm, picker, steps } from "../views/public.js";
import { html } from "hono/html";
import { dateParam, field, form, monthParam, notFound, posInt, renderPublic, withQuery, zoneParam } from "../web.js";
import { pickerState } from "./picker.js";
import { isDemo } from "../demo.js";

const forService = (sv: Service, people: Awaited<ReturnType<typeof store.staff>>) => people.filter((p) => sv.staff_ids.includes(p.id));

export const publicRoutes = (app: Hono) => {
  app.get("/", async (c) => {
    const [s, services, people] = await Promise.all([store.settings(), store.services(), store.staff()]);
    // The edge answers repeat visits for a minute without waking the app (not in the demo,
    // whose bar differs per visitor).
    if (!isDemo()) c.header("Cache-Control", "public, max-age=60");
    return renderPublic(c, s.business_name, home(s, services, people));
  });

  // The picker. Every choice is in the address, so it can be shared and the back button works.
  app.get("/book/:slug", async (c) => {
    const sv = await store.serviceBySlug(c.req.param("slug"));
    if (!sv) return notFound(c);
    const [s, people] = await Promise.all([store.settings(), store.staff()]);
    const tz = zoneParam(c, s.timezone);
    const staffId = sv.staff_ids.includes(posInt(c.req.query("staff"))) ? posInt(c.req.query("staff")) : 0;
    const st = await pickerState({ s, sv, staffId, tz, month: monthParam(c.req.query("month")), date: dateParam(c.req.query("date")), actor: { kind: "customer" } });
    const here = (q: { month?: string; date?: string; staff?: number }) =>
      withQuery(`/book/${sv.slug}`, { staff: q.staff ?? staffId, month: q.month ?? (q.date ? undefined : st.month), date: q.date, tz: c.req.query("tz") });
    const body = html`<div class="wrap">${steps("time", { service: "/" })}${picker({
      s, sv, people: forService(sv, people), staffId, tz, month: st.month, date: st.date, today: st.today, open: st.open, slots: st.slots,
      prev: st.prevMonth ? here({ month: st.prevMonth }) : null,
      next: st.nextMonth ? here({ month: st.nextMonth }) : null,
      href: (q) => (q.staff !== undefined ? withQuery(`/book/${sv.slug}`, { staff: q.staff, tz: c.req.query("tz") }) : here(q)),
      pick: (sl: Slot) => withQuery(`/book/${sv.slug}/details`, { start: sl.start, staff: staffId, tz: c.req.query("tz") }),
    })}</div>`;
    return renderPublic(c, sv.name, body);
  });

  const detailsView = async (c: Context, sv: Service, start: number, staffId: number, d = {}, errors = {}, taken = false) => {
    const s = await store.settings();
    const tz = zoneParam(c, s.timezone);
    const person = staffId ? (await store.staffById(staffId))?.name : undefined;
    const back = withQuery(`/book/${sv.slug}`, { staff: staffId, date: undefined, tz: c.req.query("tz") });
    const when = `${fmtDay(start, tz)}, ${fmtTime(start, tz)}`;
    const body = html`<div class="wrap">${steps("details", { service: "/", time: back })}${detailsPage(s, sv, when, person, withQuery(`/book/${sv.slug}`, { tz: c.req.query("tz") }), back, d, errors, taken, { start: String(start), staff: String(staffId) })}</div>`;
    return renderPublic(c, `Book ${sv.name}`, body, taken ? 409 : Object.keys(errors).length ? 400 : 200);
  };

  app.get("/book/:slug/details", async (c) => {
    const sv = await store.serviceBySlug(c.req.param("slug"));
    const start = Number(c.req.query("start"));
    if (!sv || !Number.isSafeInteger(start)) return notFound(c);
    return detailsView(c, sv, start, candidates(sv, posInt(c.req.query("staff"))).length === 1 ? posInt(c.req.query("staff")) : 0);
  });

  app.post("/book/:slug", async (c) => {
    const sv = await store.serviceBySlug(c.req.param("slug"));
    if (!sv) return notFound(c);
    const f = await form(c);
    const start = Number(field(f, "start"));
    const staffId = posInt(field(f, "staff"));
    if (!Number.isSafeInteger(start)) return notFound(c);
    const { details, errors } = readDetails(f);
    if (Object.keys(errors).length) return detailsView(c, sv, start, staffId, details, errors);
    const s = await store.settings();
    const done = await book(sv, staffId, start, details, s, { kind: "customer" });
    if (!done.ok) return detailsView(c, sv, start, staffId, details, {}, true);
    return c.redirect(withQuery(`/b/${done.booking.token}`, { new: 1, tz: c.req.query("tz") }), 303);
  });

  // The customer's own page for a booking, found only by its unguessable link.
  app.get("/b/:token", async (c) => {
    const b = await store.bookingByToken(c.req.param("token"));
    if (!b) return notFound(c);
    const s = await store.settings();
    const flash = c.req.query("ok") === "moved" ? "Moved. We've emailed the new time." : undefined;
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    return renderPublic(c, b.service_name, html`${c.req.query("new") ? html`<div class="wrap">${steps("done")}</div>` : ""}${bookingPage(s, b, baseUrl(), { fresh: !!c.req.query("new"), mayChange: customerMayChange(b, s, Date.now()), tz: zoneParam(c, s.timezone), flash })}`);
  });

  app.get("/b/:token/event.ics", async (c) => {
    const b = await store.bookingByToken(c.req.param("token"));
    if (!b) return c.notFound();
    const s = await store.settings();
    return c.body(calendar(s.business_name, [eventOf(b, s, baseUrl())], Date.now(), "PUBLISH"), 200, {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="booking.ics"`,
      "cache-control": "no-store",
    });
  });

  app.post("/b/:token/cancel", async (c) => {
    const b = await store.bookingByToken(c.req.param("token"));
    if (!b) return notFound(c);
    const s = await store.settings();
    if (customerMayChange(b, s, Date.now())) await cancel(b, s, "customer");
    return c.redirect(`/b/${b.token}`, 303);
  });

  app.get("/b/:token/move", async (c) => {
    const b = await store.bookingByToken(c.req.param("token"));
    if (!b) return notFound(c);
    const [s, sv] = await Promise.all([store.settings(), store.serviceById(b.service_id)]);
    if (!sv || !customerMayChange(b, s, Date.now())) return c.redirect(`/b/${b.token}`, 303);
    const tz = zoneParam(c, s.timezone);
    const st = await pickerState({ s, sv, staffId: b.staff_id, tz, month: monthParam(c.req.query("month")), date: dateParam(c.req.query("date")), actor: { kind: "customer" }, except: b.id });
    const here = (q: { month?: string; date?: string }) => withQuery(`/b/${b.token}/move`, { month: q.month ?? (q.date ? undefined : st.month), date: q.date, tz: c.req.query("tz") });
    const body = html`<div class="wrap" style="padding-top:28px">${picker({
      s, sv, people: [], staffId: b.staff_id, tz, month: st.month, date: st.date, today: st.today, open: st.open, slots: st.slots,
      prev: st.prevMonth ? here({ month: st.prevMonth }) : null,
      next: st.nextMonth ? here({ month: st.nextMonth }) : null,
      href: here,
      pick: (sl) => withQuery(`/b/${b.token}/move/confirm`, { start: sl.start, tz: c.req.query("tz") }),
      fixedPerson: b.staff_name,
      kicker: "Move booking",
    })}</div>`;
    return renderPublic(c, `Move ${b.service_name}`, body);
  });

  const confirmView = async (c: Context, token: string, start: number, taken: boolean) => {
    const b = await store.bookingByToken(token);
    const [s, sv] = await Promise.all([store.settings(), b ? store.serviceById(b.service_id) : undefined]);
    if (!b || !sv) return notFound(c);
    const tz = zoneParam(c, s.timezone);
    const back = withQuery(`/b/${b.token}/move`, { tz: c.req.query("tz") });
    return renderPublic(c, `Move ${b.service_name}`, html`<div class="wrap" style="padding-top:28px">${moveConfirm(s, b, sv, start, start + sv.duration * 60_000, tz, withQuery(`/b/${b.token}/move`, { tz: c.req.query("tz") }), back, taken)}</div>`, taken ? 409 : 200);
  };

  app.get("/b/:token/move/confirm", async (c) => {
    const start = Number(c.req.query("start"));
    if (!Number.isSafeInteger(start)) return notFound(c);
    return confirmView(c, c.req.param("token"), start, false);
  });

  app.post("/b/:token/move", async (c) => {
    const b = await store.bookingByToken(c.req.param("token"));
    if (!b) return notFound(c);
    const start = Number(field(await form(c), "start"));
    const [s, sv] = await Promise.all([store.settings(), store.serviceById(b.service_id)]);
    if (!sv || !Number.isSafeInteger(start) || !customerMayChange(b, s, Date.now())) return c.redirect(`/b/${b.token}`, 303);
    const done = await move(b, sv, b.staff_id, start, s, { kind: "customer" });
    if (!done.ok) return confirmView(c, b.token, start, true);
    return c.redirect(withQuery(`/b/${b.token}`, { ok: "moved", tz: c.req.query("tz") }), 303);
  });

  // A person's bookings as a calendar to subscribe to, at an address only they are given.
  app.get("/feeds/:file", async (c) => {
    const m = /^([A-Za-z0-9_-]{20,64})\.ics$/.exec(c.req.param("file"));
    const person = m ? await store.staffByFeed(m[1]) : undefined;
    if (!person || !person.active) return c.notFound();
    const [s, rows] = await Promise.all([store.settings(), store.feedBookings(person.id)]);
    const events = rows.map((b) => ({ ...eventOf(b, s, baseUrl()), title: `${b.customer_name}: ${b.service_name}`, description: [b.customer_email, b.customer_phone, b.notes].filter(Boolean).join("\n") }));
    return c.body(calendar(`${s.business_name}: ${person.name}`, events, Date.now()), 200, { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=300" });
  });
};
