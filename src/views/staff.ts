// The staff side: the schedule, one booking, services, the team and settings. Pure views.
import { html, raw } from "hono/html";
import { WEEK, WEEKDAY_NAMES, money, type BookingView, type Service, type Settings, type Staff } from "../model.js";
import type { Hours } from "../slots.js";
import type { ApiKey, EmailRow, TimeOff } from "../store.js";
import { addMonths, fmtClock, fmtDayOfDate, fmtDuration, fmtMonth, fmtShortDay, fmtTime, fmtWhen, localDate, monthGrid, zoneLabel, type LocalDate } from "../time.js";
import { icon } from "./icons.js";
import { notice } from "./layout.js";
import { face } from "./public.js";

const sel = (on: boolean) => (on ? raw(" selected") : "");
const chk = (on: boolean) => (on ? raw(" checked") : "");
const cur = (on: boolean, v = "page") => (on ? raw(` aria-current="${v}"`) : "");

// ---- Schedule ----

export type ScheduleView = {
  s: Settings;
  date: LocalDate;
  today: LocalDate;
  month: string;
  people: readonly Staff[];
  staffId: number;
  days: { date: LocalDate; items: BookingView[] }[];
  perDay: ReadonlyMap<string, number>;
  stats: { upcoming: number; today: number; week: number };
  now: number;
  href: (q: { date?: string; month?: string; staff?: number }) => string;
  flash?: string;
};

const agendaItem = (b: BookingView, tz: string, now: number) => {
  const state = b.status === "cancelled" ? "cancelled" : b.ends_at.getTime() <= now ? "past" : b.starts_at.getTime() <= now ? "now" : "";
  return html`<li class="${state}">
    <div class="t">${fmtTime(b.starts_at.getTime(), tz)}<small>${fmtDuration(b.duration)}</small></div>
    <span class="pin"></span>
    <a class="card" href="/schedule/${b.id}">
      <div><b>${b.customer_name}</b><span class="sub">${b.service_name}${b.status === "cancelled" ? " · canceled" : ""}</span></div>
      <span class="chip plain" title="${b.staff_name}">${face(b.staff_name)}${b.staff_name.split(" ")[0]}</span>
    </a>
  </li>`;
};

const nowLine = () => html`<li class="nowline"><div class="t">Now</div><span class="pin"></span><hr></li>`;

const agenda = (items: readonly BookingView[], tz: string, now: number, isToday: boolean) => {
  const split = isToday ? items.findIndex((b) => b.starts_at.getTime() > now) : -1;
  const parts = items.map((b) => agendaItem(b, tz, now));
  const withNow = split < 0 ? (isToday && items.length ? [...parts, nowLine()] : parts) : [...parts.slice(0, split), nowLine(), ...parts.slice(split)];
  return html`<ol class="agenda">${withNow}</ol>`;
};

const miniCal = (v: ScheduleView) => html`<div class="panel">
  <div class="cal-head"><h2 style="font-size:1rem">${fmtMonth(v.month)}</h2><div class="row" style="gap:2px">
    <a class="icon-btn" href="${v.href({ month: addMonths(v.month, -1) })}" aria-label="Earlier month">${icon.prev}</a>
    <a class="icon-btn" href="${v.href({ month: addMonths(v.month, 1) })}" aria-label="Later month">${icon.next}</a>
  </div></div>
  <table class="cal"><thead><tr>${["S", "M", "T", "W", "T", "F", "S"].map((d) => html`<th>${d}</th>`)}</tr></thead>
  <tbody>${monthGrid(v.month).map((w) => html`<tr>${w.map((d) => (d ? html`<td><a class="day${v.perDay.get(d) ? " has" : ""}${d === v.today ? " today" : ""}" href="${v.href({ date: d })}"${cur(d === v.date, "date")} aria-label="${fmtDayOfDate(d)}${v.perDay.get(d) ? `, ${v.perDay.get(d)} booked` : ""}">${Number(d.slice(8))}</a></td>` : html`<td></td>`))}</tr>`)}</tbody></table>
  <p style="margin:12px 0 0"><a class="btn small ghost" href="${v.href({ date: v.today })}">Today</a></p>
</div>`;

export const schedulePage = (v: ScheduleView) => html`<div class="wrap">
  <div class="page-head spread"><h1>Schedule</h1><a class="btn primary" href="/schedule/new">${icon.plus}New booking</a></div>
  ${notice("good", v.flash)}
  <div class="stats">
    <div class="stat"><b>${v.stats.today}</b><span>Today</span></div>
    <div class="stat"><b>${v.stats.upcoming}</b><span>Coming up</span></div>
    <div class="stat"><b>${v.stats.week}</b><span>Booked this week</span></div>
  </div>
  <div class="sched">
    <aside>
      ${miniCal(v)}
      ${v.people.length > 1
        ? html`<div class="chips" role="group" aria-label="Whose bookings">
        <a class="chip plain" href="${v.href({ staff: 0 })}"${cur(v.staffId === 0, "true")}>Everyone</a>
        ${v.people.map((p) => html`<a class="chip" href="${v.href({ staff: p.id })}"${cur(v.staffId === p.id, "true")}>${face(p.name)}${p.name.split(" ")[0]}</a>`)}
      </div>`
        : ""}
    </aside>
    <div>
      ${v.days.map(
        (d) => html`<section class="day-block">
        <h2>${fmtDayOfDate(d.date)} ${d.date === v.today ? html`<span class="badge accent">Today</span>` : ""}<small>${d.items.filter((b) => b.status === "confirmed").length || "Nothing"} booked</small></h2>
        ${d.items.length ? agenda(d.items, v.s.timezone, v.now, d.date === v.today) : ""}
      </section>`,
      )}
      <p><a class="btn" href="${v.href({ date: v.days.length ? nextDate(v.days[v.days.length - 1].date) : v.date })}">Next ${v.days.length} days ${icon.right}</a></p>
    </div>
  </div>
</div>`;

const nextDate = (d: LocalDate) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

// ---- One booking ----

export const bookingDetail = (s: Settings, b: BookingView, emails: readonly EmailRow[], mayChange: boolean, base: string, flash?: string) => html`<div class="wrap">
  <div class="page-head"><a class="crumbs" href="/schedule?date=${localDate(b.starts_at.getTime(), s.timezone)}">${icon.left}Schedule</a><h1>${b.customer_name}</h1></div>
  ${notice("good", flash)}
  <div class="split">
    <div class="stack" style="max-width:none">
      <section class="panel">
        <div class="spread" style="margin-bottom:14px"><h2 style="margin:0">${b.service_name}</h2>${b.status === "cancelled" ? html`<span class="badge bad">Canceled</span>` : b.ends_at.getTime() < Date.now() ? html`<span class="badge">Done</span>` : html`<span class="badge good">Confirmed</span>`}</div>
        <dl class="kv">
          <dt>When</dt><dd>${fmtWhen(b.starts_at.getTime(), s.timezone)} to ${fmtTime(b.ends_at.getTime(), s.timezone)}</dd>
          <dt>With</dt><dd>${b.staff_name}</dd>
          ${b.location ? html`<dt>Where</dt><dd>${b.location}</dd>` : ""}
          <dt>Email</dt><dd><a href="mailto:${b.customer_email}">${b.customer_email}</a></dd>
          ${b.customer_phone ? html`<dt>Phone</dt><dd><a href="tel:${b.customer_phone.replace(/[^+\d]/g, "")}">${b.customer_phone}</a></dd>` : ""}
          ${b.notes ? html`<dt>Note</dt><dd style="white-space:pre-wrap;font-weight:500">${b.notes}</dd>` : ""}
          <dt>Booked</dt><dd style="font-weight:500">${fmtWhen(b.created_at.getTime(), s.timezone)}</dd>
          ${b.cancelled_at ? html`<dt>Canceled</dt><dd style="font-weight:500">${fmtWhen(b.cancelled_at.getTime(), s.timezone)}, by ${b.cancelled_by === "customer" ? "the customer" : b.cancelled_by}</dd>` : ""}
        </dl>
      </section>
      ${mayChange
        ? html`<div class="row">
        <a class="btn" href="/schedule/${b.id}/move">${icon.move}Move</a>
        <form method="post" action="/schedule/${b.id}/cancel" data-confirm="Cancel this booking? We'll email ${b.customer_name}."><button class="btn danger" type="submit">${icon.x}Cancel booking</button></form>
        <a class="btn ghost" href="${base}/b/${b.token}" target="_blank" rel="noopener">${icon.external}Customer's page</a>
      </div>`
        : ""}
    </div>
    <aside class="panel">
      <h3>Emails</h3>
      ${emails.length ? html`<ul class="list">${emails.map((e) => html`<li><div><b class="small">${e.subject}</b><div class="small muted">${e.to_address} · ${fmtShortDay(e.created_at.getTime(), s.timezone)}, ${fmtTime(e.created_at.getTime(), s.timezone)}</div></div>${emailBadge(e)}</li>`)}</ul>` : html`<p class="muted small" style="margin:0">None yet.</p>`}
    </aside>
  </div>
</div>`;

export const emailBadge = (e: Pick<EmailRow, "status" | "error">) =>
  e.status === "sent" ? html`<span class="badge good">Sent</span>` : e.status === "failed" ? html`<span class="badge bad" title="${e.error}">Failed</span>` : e.status === "demo" ? html`<span class="badge demo">Not sent</span>` : html`<span class="badge">Queued</span>`;

// Choosing a service, then the picker, for a booking staff make for someone.
export const chooseService = (s: Settings, services: readonly Service[]) => html`<div class="wrap">
  <div class="page-head"><a class="crumbs" href="/schedule">${icon.left}Schedule</a><h1>New booking</h1></div>
  <div class="service-list">${services.map((sv) => html`<a class="service-row" href="/schedule/new/${sv.slug}"><div><h2>${sv.name}</h2><div class="meta"><span>${icon.clock}${fmtDuration(sv.duration)}</span>${sv.price_cents !== null ? html`<span class="price">${money(sv.price_cents, s.currency)}</span>` : ""}</div></div><div class="go">${icon.right}</div></a>`)}</div>
</div>`;

// ---- Services ----

export const servicesPage = (s: Settings, services: readonly Service[], people: readonly Staff[], flash?: string) => {
  const byId = new Map(people.map((p) => [p.id, p]));
  return html`<div class="wrap">
  <div class="page-head spread"><h1>Services</h1><a class="btn primary" href="/services/new">${icon.plus}New service</a></div>
  ${notice("good", flash)}
  ${services.length
    ? html`<div class="stack" style="max-width:none;padding-bottom:80px">${services.map(
        (sv, i) => html`<div class="panel spread${sv.active ? "" : " faded"}" style="padding:18px 22px${sv.active ? "" : ";opacity:.6"}">
        <div style="min-width:0;flex:1">
          <a href="/services/${sv.id}" style="text-decoration:none"><h2 style="font-size:1.15rem;margin:0 0 4px">${sv.name} ${sv.active ? "" : html`<span class="badge">Hidden</span>`}</h2></a>
          <div class="meta"><span>${icon.clock}${fmtDuration(sv.duration)}${sv.buffer_after ? ` + ${sv.buffer_after} min after` : ""}</span>${sv.price_cents !== null ? html`<span class="price">${money(sv.price_cents, s.currency)}</span>` : ""}<span>${icon.people}${sv.staff_ids.map((id) => byId.get(id)?.name.split(" ")[0]).filter(Boolean).join(", ") || "Nobody yet"}</span></div>
        </div>
        <div class="row" style="gap:2px">
          <form class="inline" method="post" action="/services/${sv.id}/move"><input type="hidden" name="dir" value="-1"><button class="icon-btn" aria-label="Move up"${i === 0 ? raw(" disabled") : ""}>${icon.up}</button></form>
          <form class="inline" method="post" action="/services/${sv.id}/move"><input type="hidden" name="dir" value="1"><button class="icon-btn" aria-label="Move down"${i === services.length - 1 ? raw(" disabled") : ""}>${icon.down}</button></form>
          <a class="btn small" href="/services/${sv.id}">Edit</a>
        </div>
      </div>`,
      )}</div>`
    : html`<div class="empty"><h2>No services</h2><p><a class="btn primary" href="/services/new">${icon.plus}New service</a></p></div>`}
</div>`;
};

export const serviceForm = (s: Settings, sv: Partial<Service>, people: readonly Staff[], error?: string) => html`<div class="wrap">
  <div class="page-head"><a class="crumbs" href="/services">${icon.left}Services</a><h1>${sv.id ? sv.name : "New service"}</h1></div>
  ${notice("error", error)}
  <form class="panel stack" method="post" action="${sv.id ? `/services/${sv.id}` : "/services"}" style="margin-bottom:24px">
    <div class="field"><label for="name">Name</label><input id="name" name="name" type="text" required maxlength="80" value="${sv.name ?? ""}"></div>
    <div class="field"><label for="description">Description</label><textarea id="description" name="description" rows="3" maxlength="600">${sv.description ?? ""}</textarea></div>
    <div class="grid-3">
      <div class="field"><label for="duration">Minutes</label><input id="duration" name="duration" type="number" min="5" max="720" step="5" required value="${sv.duration ?? 30}"></div>
      <div class="field"><label for="buffer_after">Gap after, minutes</label><input id="buffer_after" name="buffer_after" type="number" min="0" max="240" step="5" value="${sv.buffer_after ?? 0}"></div>
      <div class="field"><label for="price">Price, ${s.currency}</label><input id="price" name="price" type="text" inputmode="decimal" value="${sv.price_cents === null || sv.price_cents === undefined ? "" : (sv.price_cents / 100).toFixed(sv.price_cents % 100 ? 2 : 0)}"></div>
    </div>
    <div class="field"><label for="location">Where</label><input id="location" name="location" type="text" maxlength="200" value="${sv.location ?? ""}" placeholder="Address, Video call or Phone"></div>
    <fieldset class="events"><legend class="label">Who does it</legend>
      ${people.map((p) => html`<label class="check"><input type="checkbox" name="staff" value="${p.id}"${chk((sv.staff_ids ?? people.map((x) => x.id)).includes(p.id))}>${p.name}</label>`)}
    </fieldset>
    <label class="check"><input type="checkbox" name="active" value="1"${chk(sv.active ?? true)}>On the booking page</label>
    <div class="row"><button class="btn primary" type="submit">${icon.check}Save</button>${sv.slug ? html`<a class="btn ghost" href="/book/${sv.slug}" target="_blank" rel="noopener">${icon.external}/book/${sv.slug}</a>` : ""}</div>
  </form>
  ${sv.id ? html`<form method="post" action="/services/${sv.id}/delete" data-confirm="Delete ${sv.name}?" style="padding-bottom:80px"><button class="btn danger" type="submit">${icon.trash}Delete service</button></form>` : ""}
</div>`;

// ---- Team ----

const hoursSummary = (hours: readonly Hours[]) => html`<div class="hours-summary">${WEEK.map((d) => {
  const day = hours.filter((h) => h.weekday === d);
  return day.length ? html`<b>${WEEKDAY_NAMES[d].slice(0, 3)}</b><span>${day.map((h) => `${fmtClock(h.start)}–${fmtClock(h.end)}`).join(", ")}</span>` : "";
})}</div>`;

export const teamPage = (people: readonly Staff[], hours: readonly (Hours & { staff_id: number })[], flash?: string) => html`<div class="wrap">
  <div class="page-head spread"><h1>Team</h1><a class="btn primary" href="/team/new">${icon.plus}Add person</a></div>
  ${notice("good", flash)}
  <div class="cards">${people.map(
    (p) => html`<a class="card-link${p.active ? "" : " off"}" href="/team/${p.id}">
    <div class="row">${face(p.name, "lg")}<div><h2>${p.name}</h2><span class="muted small">${p.role || (p.active ? "" : "Not taking bookings")}</span></div></div>
    ${hoursSummary(hours.filter((h) => h.staff_id === p.id))}
    <span class="small muted">${p.busy_url ? (p.busy_error ? html`<span class="status-dot bad"></span>Calendar not read` : html`<span class="status-dot"></span>Calendar linked`) : html`<span class="status-dot off"></span>No calendar linked`}</span>
  </a>`,
  )}</div>
</div>`;

const shiftRow = (day: number | "DAY", h?: Hours) => html`<div class="shift">
  <input type="time" name="start_${day}" value="${h ? fmtClock(h.start) : "09:00"}" step="300" aria-label="From">
  <span class="muted">to</span>
  <input type="time" name="end_${day}" value="${h ? fmtClock(h.end) : "17:00"}" step="300" aria-label="To">
  <button type="button" class="icon-btn" data-remove-shift aria-label="Remove">${icon.x}</button>
</div>`;

export type PersonView = { s: Settings; p: Partial<Staff>; hours: readonly Hours[]; off: readonly TimeOff[]; base: string; error?: string; flash?: string; demo: boolean };

export const personPage = (v: PersonView) => html`<div class="wrap">
  <div class="page-head"><a class="crumbs" href="/team">${icon.left}Team</a><h1>${v.p.id ? v.p.name : "Add person"}</h1></div>
  ${notice("good", v.flash)}${notice("error", v.error)}
  <div class="split">
    <div class="stack" style="max-width:none">
      <form class="panel" method="post" action="${v.p.id ? `/team/${v.p.id}` : "/team"}">
        <div class="grid-2">
          <div class="field"><label for="name">Name</label><input id="name" name="name" type="text" required maxlength="80" value="${v.p.name ?? ""}"></div>
          <div class="field"><label for="role">Title</label><input id="role" name="role" type="text" maxlength="80" value="${v.p.role ?? ""}"></div>
        </div>
        <div class="field"><label for="email">Email for new bookings</label><input id="email" name="email" type="email" maxlength="254" value="${v.p.email ?? ""}"></div>
        <div class="field"><label for="busy_url">Their calendar's private iCal address</label><input id="busy_url" name="busy_url" type="url" value="${v.p.busy_url ?? ""}" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"${v.demo ? raw(" readonly") : ""}>
          <span class="hint">Google: Secret address in iCal format · Outlook: Publish calendar, ICS link · Apple: Public Calendar</span></div>
        <label class="check" style="margin-bottom:18px"><input type="checkbox" name="active" value="1"${chk(v.p.active ?? true)}>Taking bookings</label>
        <h3 style="margin-top:8px">Weekly hours</h3>
        <div class="week">${WEEK.map((d) => html`<div class="week-row"><span class="dayname">${WEEKDAY_NAMES[d]}</span><div class="shifts">${v.hours.filter((h) => h.weekday === d).map((h) => shiftRow(d, h))}<div><button type="button" class="btn small ghost" data-add-shift="${d}">${icon.plus}Add hours</button></div></div></div>`)}</div>
        <template id="shift-template">${shiftRow("DAY")}</template>
        <p class="small muted">${zoneLabel(v.s.timezone)}</p>
        <div class="row"><button class="btn primary" type="submit">${icon.check}Save</button></div>
      </form>
      ${v.p.id
        ? html`<section class="panel">
        <h3>Time off</h3>
        ${v.off.length ? html`<ul class="list">${v.off.map((o) => html`<li><span>${fmtShortDay(o.starts_at.getTime(), v.s.timezone)} ${fmtTime(o.starts_at.getTime(), v.s.timezone)} – ${fmtShortDay(o.ends_at.getTime(), v.s.timezone)} ${fmtTime(o.ends_at.getTime(), v.s.timezone)}${o.note ? html` <span class="muted">· ${o.note}</span>` : ""}</span><form class="inline" method="post" action="/team/${v.p.id}/off/${o.id}/delete"><button class="icon-btn" aria-label="Remove">${icon.trash}</button></form></li>`)}</ul>` : ""}
        <form method="post" action="/team/${v.p.id}/off" class="grid-2" style="margin-top:12px;align-items:end">
          <div class="field"><label for="off_from">From</label><input id="off_from" name="from" type="date" required></div>
          <div class="field"><label for="off_to">To</label><input id="off_to" name="to" type="date" required></div>
          <div class="field"><label for="off_note">Note</label><input id="off_note" name="note" type="text" maxlength="120"></div>
          <div class="field"><button class="btn" type="submit">${icon.plus}Add time off</button></div>
        </form>
      </section>`
        : ""}
    </div>
    ${v.p.id
      ? html`<aside class="panel">
      <h3>${icon.sync} Calendar feed</h3>
      <div class="copyfield"><input id="feed" type="text" readonly value="${v.base}/feeds/${v.p.feed_token}.ics"><button type="button" class="btn small" data-copy="feed">${icon.copy}</button></div>
      <form method="post" action="/team/${v.p.id}/feed" data-confirm="Make a new address? The old one stops working." style="margin-top:12px"><button class="btn small ghost" type="submit">New address</button></form>
      ${v.p.busy_url
        ? html`<hr class="rule"><h3>Their calendar</h3><p class="small">${v.p.busy_error ? html`<span class="status-dot bad"></span>${v.p.busy_error}` : v.p.busy_checked_at ? html`<span class="status-dot"></span>Read ${fmtShortDay(v.p.busy_checked_at.getTime(), v.s.timezone)}, ${fmtTime(v.p.busy_checked_at.getTime(), v.s.timezone)}` : html`<span class="status-dot off"></span>Not read yet`}</p>`
        : ""}
    </aside>`
      : ""}
  </div>
</div>`;

// ---- Settings ----

const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "Europe/London", "Europe/Dublin", "Europe/Berlin", "Europe/Paris", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Adelaide", "Australia/Perth", "Pacific/Auckland", "UTC"];
const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "NZD", "SGD"];
const durations: [number, string][] = [[0, "None"], [30, "30 minutes"], [60, "1 hour"], [120, "2 hours"], [240, "4 hours"], [720, "12 hours"], [1440, "1 day"], [2880, "2 days"]];

const minutesSelect = (name: string, value: number, opts = durations) =>
  html`<select id="${name}" name="${name}">${[...new Set([...opts.map(([m]) => m), value])].sort((a, b) => a - b).map((m) => html`<option value="${m}"${sel(m === value)}>${opts.find(([x]) => x === m)?.[1] ?? fmtDuration(m)}</option>`)}</select>`;

export type KeysView = { keys: readonly ApiKey[]; base: string; newKey?: string };

export const settingsPage = (s: Settings, emails: readonly EmailRow[], demo: boolean, api: KeysView, flash?: string, error?: string) => html`<div class="wrap">
  <div class="page-head"><h1>Settings</h1></div>
  ${notice("good", flash)}${notice("error", error)}
  <form class="stack" method="post" action="/settings" style="padding-bottom:24px">
    <section class="panel">
      <h3>Look</h3>
      <div class="field"><label for="business_name">Business name</label><input id="business_name" name="business_name" type="text" required maxlength="80" value="${s.business_name}"></div>
      <div class="field"><label for="tagline">Line under the name</label><input id="tagline" name="tagline" type="text" maxlength="160" value="${s.tagline}"></div>
      <div class="field"><label for="accent">Color</label><input id="accent" name="accent" type="color" value="${s.accent}"></div>
    </section>
    <section class="panel">
      <h3>Booking rules</h3>
      <div class="grid-2">
        <div class="field"><label for="min_notice_minutes">Notice needed</label>${minutesSelect("min_notice_minutes", s.min_notice_minutes)}</div>
        <div class="field"><label for="window_days">Book up to, days ahead</label><input id="window_days" name="window_days" type="number" min="1" max="365" value="${s.window_days}"></div>
        <div class="field"><label for="step_minutes">Start times every</label>${minutesSelect("step_minutes", s.step_minutes, [[5, "5 minutes"], [10, "10 minutes"], [15, "15 minutes"], [20, "20 minutes"], [30, "30 minutes"], [60, "1 hour"]])}</div>
        <div class="field"><label for="cancel_cutoff_minutes">Customers can move or cancel until</label>${minutesSelect("cancel_cutoff_minutes", s.cancel_cutoff_minutes, durations.map(([m, l]) => [m, m ? `${l} before` : "It starts"]))}</div>
        <div class="field"><label for="reminder_minutes">Reminder email</label>${minutesSelect("reminder_minutes", s.reminder_minutes, [[0, "Off"], [120, "2 hours before"], [1440, "1 day before"], [2880, "2 days before"]])}</div>
        <div class="field"><label for="timezone">Time zone</label><select id="timezone" name="timezone">${[...new Set([s.timezone, ...ZONES])].map((z) => html`<option value="${z}"${sel(z === s.timezone)}>${z.replace(/_/g, " ")}</option>`)}</select></div>
        <div class="field"><label for="currency">Currency</label><select id="currency" name="currency">${[...new Set([s.currency, ...CURRENCIES])].map((c) => html`<option${sel(c === s.currency)}>${c}</option>`)}</select></div>
      </div>
    </section>
    <section class="panel">
      <h3>Email</h3>
      <div class="grid-2">
        <div class="field"><label for="email_from">From address</label><input id="email_from" name="email_from" type="email" value="${s.email_from}" placeholder="bookings@yourbusiness.com"${demo ? raw(" readonly") : ""}><span class="hint">Empty: Whisk's address. Needs a domain verified in Whisk.</span></div>
        <div class="field"><label for="reply_to">Replies go to</label><input id="reply_to" name="reply_to" type="email" value="${s.reply_to}"${demo ? raw(" readonly") : ""}></div>
      </div>
    </section>
    <div><button class="btn primary" type="submit">${icon.check}Save</button></div>
  </form>
  ${apiKeysPanel(s, api, demo)}
  <section class="panel" style="max-width:760px;margin-bottom:80px">
    <h3>Sent email</h3>
    ${emails.length
      ? html`<div class="table-wrap"><table class="table"><tbody>${emails.map((e) => html`<tr><td class="small muted" style="white-space:nowrap">${fmtShortDay(e.created_at.getTime(), s.timezone)}, ${fmtTime(e.created_at.getTime(), s.timezone)}</td><td><b class="small">${e.subject}</b><div class="small muted">${e.to_address}</div></td><td style="text-align:right">${emailBadge(e)}</td></tr>`)}</tbody></table></div>`
      : html`<p class="muted small" style="margin:0">None yet.</p>`}
  </section>
</div>`;


// API keys: other systems and AI agents use the JSON API at /api/v1 with one of these. A new key
// shows once, on the page that made it; only its hash is kept.
const apiKeysPanel = (s: Settings, { keys, base, newKey }: KeysView, demo: boolean) => html`<section class="panel" id="api" style="max-width:760px;margin-bottom:24px">
    <h3>API keys</h3>
    <p class="muted small" style="margin-top:0">For other systems and AI agents: they can do everything the staff side does through the JSON API at <code>${base}/api/v1</code>.${demo ? " In the demo, keys work on the sample data and are removed every night." : ""}</p>
    ${newKey
      ? html`<div class="notice good" role="status"><div style="margin-bottom:8px"><b>Copy the key now. It won't show again.</b></div>
        <div class="copyfield"><input id="new-key" type="text" readonly value="${newKey}" aria-label="New API key"><button type="button" class="btn small" data-copy="new-key">${icon.copy}<span class="label">Copy</span></button></div></div>`
      : ""}
    ${keys.length
      ? html`<div class="table-wrap"><table class="table"><tbody>${keys.map(
          (k) => html`<tr><td><b class="small">${k.label}</b><div class="small muted"><code>${k.prefix}…</code> · by ${k.created_by}</div></td>
          <td class="small muted">${k.last_used_at ? `Used ${fmtShortDay(k.last_used_at.getTime(), s.timezone)}, ${fmtTime(k.last_used_at.getTime(), s.timezone)}` : "Not used yet"}</td>
          <td style="text-align:right"><form method="post" action="/settings/api-keys/${k.id}/revoke" class="inline" data-confirm="Revoke ${k.label}? Anything using it stops working."><button class="btn small ghost danger" type="submit">${icon.trash}<span class="label">Revoke</span></button></form></td></tr>`,
        )}</tbody></table></div>`
      : html`<p class="muted small">No keys yet.</p>`}
    <form method="post" action="/settings/api-keys#api" class="row" style="margin-top:16px;align-items:flex-end">
      <div class="field" style="flex:1;min-width:200px;margin:0"><label for="key-label">Name</label><input id="key-label" name="label" type="text" required maxlength="80" placeholder="Front desk app"></div>
      <button class="btn" type="submit">${icon.plus}Make key</button>
    </form>
    <details style="margin-top:20px"><summary class="small" style="cursor:pointer;font-weight:650">How to use the API</summary>
      <pre class="codeblock">curl ${base}/api/v1/bookings?min_start_time=2026-11-01 \\
  -H "Authorization: Bearer YOUR_KEY"

curl ${base}/api/v1/availability?service=1 \\
  -H "Authorization: Bearer YOUR_KEY"</pre>
      <p class="small muted">GET ${base}/api/v1 lists every endpoint. Errors come back as {"error": {"code", "message", "fix"}}.</p>
    </details>
  </section>`;
