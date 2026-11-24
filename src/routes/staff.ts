// The staff side. The platform only lets the business's team reach these routes; the app then
// keeps services, team and settings to admins (web.ts isAdmin).
import type { Context, Hono, Next } from "hono";
import { html } from "hono/html";
import { book, cancel, move } from "../booking.js";
import { checkUrl } from "../busy.js";
import { demoLanding, isDemo, viewer } from "../demo.js";
import { baseUrl } from "../mail.js";
import { isColour, isEmail, readDetails, slugify, staffMayChange, uniqueSlug, parseMoney, SERVICE_LIMITS, type Service, type Settings } from "../model.js";
import type { Hours } from "../slots.js";
import * as store from "../store.js";
import { addDays, addMonths, datesFrom, fmtDay, fmtTime, instantOf, isZone, localDate, monthOf, parseClock, type LocalDate } from "../time.js";
import { layout, message } from "../views/layout.js";
import { detailsPage, moveConfirm, picker } from "../views/public.js";
import { bookingDetail, chooseService, personPage, schedulePage, serviceForm, servicesPage, settingsPage, teamPage } from "../views/staff.js";
import { actorName, dateParam, field, flash, form, idParam, intIn, isAdmin, isStaff, monthParam, notFound, posInt, renderStaff, text, withQuery } from "../web.js";
import { pickerState } from "./picker.js";

const staffOnly = async (c: Context, next: Next) => {
  if (!isStaff(viewer(c)) && isDemo()) return c.html(layout({ s: await store.settings(), title: "Look around", body: demoLanding() }));
  if (!isStaff(viewer(c))) return c.redirect(`/.whisk/login?return=${encodeURIComponent(c.req.path)}`, 302);
  await next();
};
const adminOnly = async (c: Context, next: Next) => {
  if (!isAdmin(viewer(c))) return renderStaff(c, "Not allowed", message("For admins", "Ask an owner of this business to add you to its booking-admins group."), undefined, 403);
  await next();
};

const DAYS_SHOWN = 7;

export const staffRoutes = (app: Hono) => {
  for (const p of ["/schedule", "/schedule/*", "/services", "/services/*", "/team", "/team/*", "/settings", "/settings/*"]) app.use(p, staffOnly);
  for (const p of ["/services", "/services/*", "/team", "/team/*", "/settings", "/settings/*"]) app.use(p, adminOnly);

  // ---- Schedule ----

  app.get("/schedule", async (c) => {
    const s = await store.settings();
    const now = Date.now();
    const today = localDate(now, s.timezone);
    const date = dateParam(c.req.query("date")) ?? (monthParam(c.req.query("month")) ? `${c.req.query("month")}-01` : today);
    const month = monthParam(c.req.query("month")) ?? monthOf(date);
    const people = await store.staff();
    const staffId = people.some((p) => p.id === posInt(c.req.query("staff"))) ? posInt(c.req.query("staff")) : 0;
    const from = new Date(instantOf(date, 0, s.timezone));
    const to = new Date(instantOf(addDays(date, DAYS_SHOWN), 0, s.timezone));
    const [rows, perDay, stats] = await Promise.all([
      store.schedule(from, to, staffId, true),
      store.perDay(new Date(instantOf(`${month}-01`, 0, s.timezone) - 7 * 86_400_000), new Date(instantOf(`${addMonths(month, 1)}-01`, 0, s.timezone) + 7 * 86_400_000), s.timezone, staffId),
      store.counts(new Date(instantOf(today, 0, s.timezone)), new Date(instantOf(addDays(today, 1), 0, s.timezone))),
    ]);
    const days = datesFrom(date, DAYS_SHOWN).map((d) => ({ date: d, items: rows.filter((b) => localDate(b.starts_at.getTime(), s.timezone) === d) }));
    const href = (q: { date?: string; month?: string; staff?: number }) =>
      withQuery("/schedule", { date: q.month ? undefined : (q.date ?? date), month: q.month, staff: q.staff ?? staffId });
    return renderStaff(c, "Schedule", schedulePage({ s, date, today, month, people, staffId, days, perDay, stats, now, href, flash: flash(c) }), "schedule");
  });

  app.get("/schedule/new", async (c) => renderStaff(c, "New booking", chooseService(await store.settings(), await store.services()), "schedule"));

  app.get("/schedule/new/:slug", async (c) => {
    const sv = await store.serviceBySlug(c.req.param("slug"), true);
    if (!sv) return notFound(c, true);
    const [s, people] = await Promise.all([store.settings(), store.staff()]);
    const staffId = sv.staff_ids.includes(posInt(c.req.query("staff"))) ? posInt(c.req.query("staff")) : 0;
    const st = await pickerState({ s, sv, staffId, tz: s.timezone, month: monthParam(c.req.query("month")), date: dateParam(c.req.query("date")), actor: { kind: "staff", name: actorName(viewer(c)) } });
    const here = (q: { month?: string; date?: string; staff?: number }) => withQuery(`/schedule/new/${sv.slug}`, { staff: q.staff ?? staffId, month: q.month ?? (q.date ? undefined : st.month), date: q.date });
    const body = html`<div class="wrap" style="padding-top:28px">${picker({
      s, sv, people: people.filter((p) => sv.staff_ids.includes(p.id)), staffId, tz: s.timezone, month: st.month, date: st.date, today: st.today, open: st.open, slots: st.slots,
      prev: st.prevMonth ? here({ month: st.prevMonth }) : null,
      next: st.nextMonth ? here({ month: st.nextMonth }) : null,
      href: (q) => (q.staff !== undefined ? withQuery(`/schedule/new/${sv.slug}`, { staff: q.staff }) : here(q)),
      pick: (sl) => withQuery(`/schedule/new/${sv.slug}/details`, { start: sl.start, staff: staffId }),
      kicker: "New booking",
    })}</div>`;
    return renderStaff(c, "New booking", body, "schedule");
  });

  const newDetails = async (c: Context, sv: Service, s: Settings, start: number, staffId: number, d = {}, errors = {}, taken = false) => {
    const person = staffId ? (await store.staffById(staffId))?.name : undefined;
    const back = withQuery(`/schedule/new/${sv.slug}`, { staff: staffId });
    return renderStaff(c, "New booking", html`<div class="wrap" style="padding-top:28px">${detailsPage(s, sv, `${fmtDay(start, s.timezone)}, ${fmtTime(start, s.timezone)}`, person, `/schedule/new/${sv.slug}`, back, d, errors, taken, { start: String(start), staff: String(staffId) })}</div>`, "schedule", taken ? 409 : Object.keys(errors).length ? 400 : 200);
  };

  app.get("/schedule/new/:slug/details", async (c) => {
    const [sv, s] = await Promise.all([store.serviceBySlug(c.req.param("slug"), true), store.settings()]);
    const start = Number(c.req.query("start"));
    if (!sv || !Number.isSafeInteger(start)) return notFound(c, true);
    return newDetails(c, sv, s, start, posInt(c.req.query("staff")));
  });

  app.post("/schedule/new/:slug", async (c) => {
    const [sv, s] = await Promise.all([store.serviceBySlug(c.req.param("slug"), true), store.settings()]);
    if (!sv) return notFound(c, true);
    const f = await form(c);
    const start = Number(field(f, "start"));
    const staffId = posInt(field(f, "staff"));
    if (!Number.isSafeInteger(start)) return notFound(c, true);
    const { details, errors } = readDetails(f);
    if (Object.keys(errors).length) return newDetails(c, sv, s, start, staffId, details, errors);
    const done = await book(sv, staffId, start, details, s, { kind: "staff", name: actorName(viewer(c)) });
    if (!done.ok) return newDetails(c, sv, s, start, staffId, details, {}, true);
    return c.redirect(`/schedule/${done.booking.id}?ok=booked`, 303);
  });

  app.get("/schedule/:id", async (c) => {
    const b = await store.bookingById(idParam(c));
    if (!b) return notFound(c, true);
    const [s, emails] = await Promise.all([store.settings(), store.emailsFor(b.id)]);
    return renderStaff(c, b.customer_name, bookingDetail(s, b, emails, staffMayChange(b, Date.now()), baseUrl(), flash(c)), "schedule");
  });

  app.post("/schedule/:id/cancel", async (c) => {
    const b = await store.bookingById(idParam(c));
    if (!b) return notFound(c, true);
    if (staffMayChange(b, Date.now())) await cancel(b, await store.settings(), actorName(viewer(c)));
    return c.redirect(`/schedule/${b.id}?ok=cancelled`, 303);
  });

  app.get("/schedule/:id/move", async (c) => {
    const b = await store.bookingById(idParam(c));
    if (!b || !staffMayChange(b, Date.now())) return notFound(c, true);
    const [s, sv, people] = await Promise.all([store.settings(), store.serviceById(b.service_id), store.staff()]);
    if (!sv) return notFound(c, true);
    const staffId = sv.staff_ids.includes(posInt(c.req.query("staff"))) ? posInt(c.req.query("staff")) : b.staff_id;
    const st = await pickerState({ s, sv, staffId, tz: s.timezone, month: monthParam(c.req.query("month")), date: dateParam(c.req.query("date")), actor: { kind: "staff", name: actorName(viewer(c)) }, except: b.id });
    const here = (q: { month?: string; date?: string; staff?: number }) => withQuery(`/schedule/${b.id}/move`, { staff: q.staff ?? staffId, month: q.month ?? (q.date ? undefined : st.month), date: q.date });
    const body = html`<div class="wrap" style="padding-top:28px">${picker({
      s, sv, people: people.filter((p) => sv.staff_ids.includes(p.id)), staffId, tz: s.timezone, month: st.month, date: st.date, today: st.today, open: st.open, slots: st.slots,
      prev: st.prevMonth ? here({ month: st.prevMonth }) : null,
      next: st.nextMonth ? here({ month: st.nextMonth }) : null,
      href: (q) => (q.staff !== undefined ? withQuery(`/schedule/${b.id}/move`, { staff: q.staff || b.staff_id }) : here(q)),
      pick: (sl) => withQuery(`/schedule/${b.id}/move/confirm`, { start: sl.start, staff: staffId }),
      kicker: `Move ${b.customer_name}`,
    })}</div>`;
    return renderStaff(c, `Move ${b.customer_name}`, body, "schedule");
  });

  const moveConfirmView = async (c: Context, id: number, start: number, staffId: number, taken: boolean) => {
    const b = await store.bookingById(id);
    const [s, sv] = await Promise.all([store.settings(), b ? store.serviceById(b.service_id) : undefined]);
    if (!b || !sv) return notFound(c, true);
    const person = staffId && staffId !== b.staff_id ? await store.staffById(staffId) : undefined;
    const shown = person ? { ...b, staff_name: person.name } : b;
    const back = withQuery(`/schedule/${b.id}/move`, { staff: staffId });
    return renderStaff(c, `Move ${b.customer_name}`, html`<div class="wrap" style="padding-top:28px">${moveConfirm(s, shown, sv, start, start + sv.duration * 60_000, s.timezone, withQuery(`/schedule/${b.id}/move`, { staff: staffId }), back, taken)}</div>`, "schedule", taken ? 409 : 200);
  };

  app.get("/schedule/:id/move/confirm", async (c) => {
    const start = Number(c.req.query("start"));
    if (!Number.isSafeInteger(start)) return notFound(c, true);
    return moveConfirmView(c, idParam(c), start, posInt(c.req.query("staff")), false);
  });

  app.post("/schedule/:id/move", async (c) => {
    const b = await store.bookingById(idParam(c));
    if (!b || !staffMayChange(b, Date.now())) return notFound(c, true);
    const start = Number(field(await form(c), "start"));
    const staffId = posInt(c.req.query("staff"));
    const [s, sv] = await Promise.all([store.settings(), store.serviceById(b.service_id)]);
    if (!sv || !Number.isSafeInteger(start)) return notFound(c, true);
    const done = await move(b, sv, staffId, start, s, { kind: "staff", name: actorName(viewer(c)) });
    if (!done.ok) return moveConfirmView(c, b.id, start, staffId, true);
    return c.redirect(`/schedule/${b.id}?ok=moved`, 303);
  });

  // ---- Services ----

  app.get("/services", async (c) => {
    const [s, services, people] = await Promise.all([store.settings(), store.services(true), store.staff(true)]);
    return renderStaff(c, "Services", servicesPage(s, services, people, flash(c)), "services");
  });

  const readService = (f: Record<string, unknown>, people: readonly number[]) => {
    const staffIds = ([] as unknown[]).concat(f["staff[]"] ?? f.staff ?? []).map(posInt).filter((id) => people.includes(id));
    return {
      name: text(f.name, SERVICE_LIMITS.name),
      description: text(f.description, SERVICE_LIMITS.description),
      duration: intIn(f.duration, ...SERVICE_LIMITS.duration, 30),
      buffer_after: intIn(f.buffer_after, ...SERVICE_LIMITS.buffer_after, 0),
      price_cents: parseMoney(f.price),
      location: text(f.location, SERVICE_LIMITS.location),
      active: f.active === "1",
      staff_ids: [...new Set(staffIds)],
    };
  };

  app.get("/services/new", async (c) => renderStaff(c, "New service", serviceForm(await store.settings(), {}, await store.staff()), "services"));

  app.post("/services", async (c) => {
    const people = (await store.staff()).map((p) => p.id);
    const sv = readService(await c.req.parseBody({ all: true }), people);
    if (!sv.name) return renderStaff(c, "New service", serviceForm(await store.settings(), sv, await store.staff(), "Give it a name."), "services", 400);
    const id = await store.createService({ ...sv, slug: uniqueSlug(slugify(sv.name), await store.slugs()) });
    return c.redirect(`/services?ok=created#${id}`, 303);
  });

  app.get("/services/:id", async (c) => {
    const sv = await store.serviceById(idParam(c));
    if (!sv) return notFound(c, true);
    return renderStaff(c, sv.name, serviceForm(await store.settings(), sv, await store.staff()), "services");
  });

  app.post("/services/:id", async (c) => {
    const old = await store.serviceById(idParam(c));
    if (!old) return notFound(c, true);
    const people = (await store.staff()).map((p) => p.id);
    const sv = readService(await c.req.parseBody({ all: true }), people);
    if (!sv.name) return renderStaff(c, old.name, serviceForm(await store.settings(), { ...old, ...sv }, await store.staff(), "Give it a name."), "services", 400);
    await store.updateService(old.id, sv);
    return c.redirect("/services?ok=saved", 303);
  });

  app.post("/services/:id/move", async (c) => {
    await store.moveService(idParam(c), field(await form(c), "dir") === "-1" ? -1 : 1);
    return c.redirect("/services", 303);
  });

  app.post("/services/:id/delete", async (c) => {
    const what = await store.deleteService(idParam(c));
    return c.redirect(`/services?ok=${what}`, 303);
  });

  // ---- Team ----

  app.get("/team", async (c) => {
    const people = await store.staff(true);
    return renderStaff(c, "Team", teamPage(people, await store.hours(people.map((p) => p.id)), flash(c)), "team");
  });

  // Weekly hours arrive as start_<weekday> and end_<weekday>, one pair per shift.
  const readHours = (f: Record<string, unknown>): Hours[] =>
    [0, 1, 2, 3, 4, 5, 6].flatMap((d) => {
      const starts = ([] as unknown[]).concat(f[`start_${d}`] ?? []);
      const ends = ([] as unknown[]).concat(f[`end_${d}`] ?? []);
      return starts
        .map((v, i) => ({ weekday: d, start: parseClock(v), end: parseClock(ends[i]) }))
        .filter((h): h is Hours => h.start !== null && h.end !== null && h.end > h.start);
    });

  const readPerson = (f: Record<string, unknown>) => {
    const busy = checkUrl(text(f.busy_url, 2000));
    const email = text(f.email, 254).toLowerCase();
    return {
      person: { name: text(f.name, 80), role: text(f.role, 80), email: isEmail(email) ? email : "", active: f.active === "1", busy_url: busy.url ?? "" },
      error: !text(f.name, 80) ? "Give them a name." : busy.error ? busy.error : email && !isEmail(email) ? "That email address doesn't look right." : undefined,
    };
  };

  const personView = async (c: Context, id: number, extra: { error?: string; status?: 200 | 400 } = {}) => {
    const [s, p] = await Promise.all([store.settings(), id ? store.staffById(id) : undefined]);
    const [hours, off] = p ? await Promise.all([store.hours([p.id]), store.timeOff([p.id], new Date())]) : [[], []];
    return renderStaff(c, p?.name ?? "Add person", personPage({ s, p: p ?? {}, hours: p ? hours : [1, 2, 3, 4, 5].map((d) => ({ weekday: d, start: 540, end: 1020 })), off, base: baseUrl(), error: extra.error, flash: flash(c), demo: isDemo() }), "team", extra.status);
  };

  app.get("/team/new", (c) => personView(c, 0));

  app.post("/team", async (c) => {
    const f = await c.req.parseBody({ all: true });
    const { person, error } = readPerson(f);
    if (error) return personView(c, 0, { error, status: 400 });
    const id = await store.createStaff({ ...person, busy_url: isDemo() ? "" : person.busy_url });
    await store.setHours(id, readHours(f));
    return c.redirect(`/team/${id}?ok=created`, 303);
  });

  app.get("/team/:id", async (c) => ((await store.staffById(idParam(c))) ? personView(c, idParam(c)) : notFound(c, true)));

  app.post("/team/:id", async (c) => {
    const p = await store.staffById(idParam(c));
    if (!p) return notFound(c, true);
    const f = await c.req.parseBody({ all: true });
    const { person, error } = readPerson(f);
    if (error) return personView(c, p.id, { error, status: 400 });
    await store.updateStaff(p.id, { ...person, busy_url: isDemo() ? p.busy_url : person.busy_url });
    await store.setHours(p.id, readHours(f));
    return c.redirect(`/team/${p.id}?ok=saved`, 303);
  });

  app.post("/team/:id/feed", async (c) => {
    await store.newFeedToken(idParam(c));
    return c.redirect(`/team/${idParam(c)}?ok=feed`, 303);
  });

  app.post("/team/:id/off", async (c) => {
    const p = await store.staffById(idParam(c));
    if (!p) return notFound(c, true);
    const f = await form(c);
    const s = await store.settings();
    const from = dateParam(field(f, "from"));
    const to = dateParam(field(f, "to"));
    if (!from || !to || to < from) return personView(c, p.id, { error: "Pick the first and last day off.", status: 400 });
    // Whole days, from the start of the first to the end of the last.
    await store.addTimeOff(p.id, new Date(instantOf(from, 0, s.timezone)), new Date(instantOf(addDays(to as LocalDate, 1), 0, s.timezone)), text(f.note, 120));
    return c.redirect(`/team/${p.id}?ok=saved`, 303);
  });

  app.post("/team/:id/off/:off/delete", async (c) => {
    await store.deleteTimeOff(idParam(c, "off"), idParam(c));
    return c.redirect(`/team/${idParam(c)}?ok=deleted`, 303);
  });

  // ---- Settings ----

  const settingsView = async (c: Context, o: { newKey?: string; error?: string; status?: 200 | 400 } = {}) => {
    const [s, emails, keys] = await Promise.all([store.settings(), store.recentEmails(), store.apiKeys()]);
    return renderStaff(c, "Settings", settingsPage(s, emails, isDemo(), { keys, base: baseUrl(), newKey: o.newKey }, flash(c), o.error), "settings", o.status);
  };

  app.get("/settings", (c) => settingsView(c));

  // API keys. The key itself is shown on this response only; nothing keeps it.
  app.post("/settings/api-keys", async (c) => {
    const label = text((await form(c)).label, 80);
    if (!label) return settingsView(c, { error: "Give the key a name, so you know what uses it.", status: 400 });
    return settingsView(c, { newKey: await store.createKey(label, actorName(viewer(c))) });
  });

  app.post("/settings/api-keys/:id/revoke", async (c) => {
    await store.revokeKey(idParam(c));
    return c.redirect("/settings?ok=key_revoked#api", 303);
  });

  app.post("/settings", async (c) => {
    const f = await form(c);
    const old = await store.settings();
    const from = text(f.email_from, 254).toLowerCase();
    const reply = text(f.reply_to, 254).toLowerCase();
    const next: Settings = {
      business_name: text(f.business_name, 80) || old.business_name,
      tagline: text(f.tagline, 160),
      accent: isColour(f.accent) ? f.accent : old.accent,
      timezone: isZone(text(f.timezone, 64)) ? text(f.timezone, 64) : old.timezone,
      currency: /^[A-Z]{3}$/.test(text(f.currency, 3)) ? text(f.currency, 3) : old.currency,
      min_notice_minutes: intIn(f.min_notice_minutes, 0, 60 * 24 * 14, old.min_notice_minutes),
      window_days: intIn(f.window_days, 1, 365, old.window_days),
      step_minutes: intIn(f.step_minutes, 5, 240, old.step_minutes),
      cancel_cutoff_minutes: intIn(f.cancel_cutoff_minutes, 0, 60 * 24 * 14, old.cancel_cutoff_minutes),
      reminder_minutes: intIn(f.reminder_minutes, 0, 60 * 24 * 7, old.reminder_minutes),
      email_from: isDemo() ? old.email_from : isEmail(from) ? from : "",
      reply_to: isDemo() ? old.reply_to : isEmail(reply) ? reply : "",
    };
    await store.saveSettings(next);
    return c.redirect("/settings?ok=saved", 303);
  });
};
