// The public booking pages: the list of services, the time picker, the details form and the
// booking's own page. Views are pure: they take what to show and return HTML.
import { html, raw } from "hono/html";
import { eventOf } from "../emails.js";
import { googleLink, outlookLink } from "../ics.js";
import { initials, money, type BookingView, type Details, type Service, type Settings, type Staff } from "../model.js";
import type { Slot } from "../slots.js";
import { fmtDay, fmtDayOfDate, fmtDuration, fmtMonth, fmtTime, monthGrid, zoneLabel, type LocalDate } from "../time.js";
import { icon } from "./icons.js";
import type { Html } from "./layout.js";

export const face = (name: string, cls = "") => html`<span class="face ${cls}" aria-hidden="true">${initials(name)}</span>`;

export const home = (s: Settings, services: readonly Service[], staff: readonly Staff[]) => {
  const byId = new Map(staff.map((p) => [p.id, p]));
  return html`<div class="wrap">
  <section class="public-hero"><h1>${s.business_name}</h1>${s.tagline ? html`<p class="lead">${s.tagline}</p>` : ""}</section>
  ${services.length
    ? html`<div class="service-list">${services.map(
        (sv) => html`<a class="service-row" href="/book/${sv.slug}">
        <div>
          <h2>${sv.name}</h2>
          <div class="meta"><span>${icon.clock}${fmtDuration(sv.duration)}</span>${sv.location ? html`<span>${icon.pin}${sv.location}</span>` : ""}${sv.price_cents !== null ? html`<span class="price">${money(sv.price_cents, s.currency)}</span>` : ""}</div>
          ${sv.description ? html`<p>${sv.description}</p>` : ""}
        </div>
        <div class="go"><span class="faces">${sv.staff_ids.slice(0, 4).map((id) => (byId.get(id) ? face(byId.get(id)!.name) : ""))}</span>${icon.right}</div>
      </a>`,
      )}</div>`
    : html`<div class="empty" style="margin-bottom:72px"><h2>No services yet</h2><p>Check back soon.</p></div>`}
</div>`;
};

export type Step = "service" | "time" | "details" | "done";
const STEPS: [Step, string][] = [["service", "Service"], ["time", "Time"], ["details", "Details"], ["done", "Booked"]];

export const steps = (at: Step, links: Partial<Record<Step, string>> = {}) => {
  const i = STEPS.findIndex(([k]) => k === at);
  return html`<ol class="steps" aria-label="Steps">${STEPS.map(([k, label], j) => {
    const cls = j < i ? "done" : j === i ? "current" : "";
    const inner = html`<span class="dot">${j < i ? icon.check : ""}</span><span class="word">${label}</span>`;
    return html`<li class="${cls}"${j === i ? raw(' aria-current="step"') : ""}>${links[k] && j < i ? html`<a href="${links[k]}" style="display:contents">${inner}</a>` : inner}</li>`;
  })}</ol>`;
};

// What stays in view on every step: the business, the service, and once chosen, the time.
export const summary = (s: Settings, sv: Service, extra: { when?: string; staffName?: string; kicker?: string } = {}) => html`<section class="summary">
  <span class="kicker">${extra.kicker ?? s.business_name}</span>
  <h1>${sv.name}</h1>
  <ul class="facts">
    <li>${icon.clock}${fmtDuration(sv.duration)}</li>
    ${sv.location ? html`<li>${icon.pin}${sv.location}</li>` : ""}
    ${sv.price_cents !== null ? html`<li>${icon.tag}${money(sv.price_cents, s.currency)}</li>` : ""}
    ${extra.staffName ? html`<li class="chosen">${icon.user}${extra.staffName}</li>` : ""}
    ${extra.when ? html`<li class="chosen">${icon.calendar}${extra.when}</li>` : ""}
  </ul>
  ${sv.description && !extra.when ? html`<p class="desc">${sv.description}</p>` : ""}
</section>`;

export type Picker = {
  s: Settings;
  sv: Service;
  people: readonly Staff[];
  staffId: number;
  tz: string;
  month: string;
  date: LocalDate | null;
  today: LocalDate;
  open: ReadonlySet<LocalDate>;
  slots: readonly Slot[];
  prev: string | null;
  next: string | null;
  // Address of this page with other choices.
  href: (q: { month?: string; date?: string; staff?: number }) => string;
  // Where Next goes for a slot.
  pick: (slot: Slot) => string;
  // Hide the person chooser (moving a booking keeps its person).
  fixedPerson?: string;
  kicker?: string;
};

const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "Europe/London", "Europe/Berlin", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "Australia/Brisbane", "Australia/Adelaide", "Australia/Perth", "Pacific/Auckland", "UTC"];

const zonePicker = (p: Picker) => {
  const zones = [...new Set([p.tz, p.s.timezone, ...ZONES])];
  return html`<label class="tz">${icon.globe}<span class="sr">Time zone</span><select name="tz" data-go>${zones.map((z) => html`<option value="${z}"${z === p.tz ? raw(" selected") : ""}>${zoneLabel(z)}</option>`)}</select></label>`;
};

export const picker = (p: Picker): Html => html`<div class="booker" id="picker" data-tz="${p.s.timezone}">
  <section class="summary-col">
    ${summary(p.s, p.sv, { kicker: p.kicker })}
    ${p.fixedPerson
      ? html`<ul class="facts"><li class="chosen">${icon.user}${p.fixedPerson}</li></ul>`
      : p.people.length > 1
        ? html`<div class="who" role="group" aria-label="With"><span class="label">With</span>
      <a href="${p.href({ staff: 0 })}" data-swap="#picker"${p.staffId === 0 ? raw(' aria-current="true"') : ""}><span class="face any">${icon.people}</span>Any available</a>
      ${p.people.map((x) => html`<a href="${p.href({ staff: x.id })}" data-swap="#picker"${p.staffId === x.id ? raw(' aria-current="true"') : ""}>${face(x.name)}${x.name}</a>`)}
    </div>`
        : p.people[0]
          ? html`<ul class="facts"><li>${icon.user}${p.people[0].name}</li></ul>`
          : ""}
  </section>
  <section>
    <div class="cal-head">
      <h2>${fmtMonth(p.month)}</h2>
      <div class="row" style="gap:4px">
        ${p.prev ? html`<a class="icon-btn" href="${p.prev}" data-swap="#picker" aria-label="Earlier month">${icon.prev}</a>` : html`<span class="icon-btn" aria-hidden="true" style="opacity:.3">${icon.prev}</span>`}
        ${p.next ? html`<a class="icon-btn" href="${p.next}" data-swap="#picker" aria-label="Later month">${icon.next}</a>` : html`<span class="icon-btn" aria-hidden="true" style="opacity:.3">${icon.next}</span>`}
      </div>
    </div>
    <table class="cal" role="grid">
      <thead><tr>${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => html`<th scope="col">${d}</th>`)}</tr></thead>
      <tbody>${monthGrid(p.month).map(
        (week) => html`<tr>${week.map((d) =>
          !d
            ? html`<td></td>`
            : p.open.has(d)
              ? html`<td><a class="day${d === p.today ? " today" : ""}" href="${p.href({ date: d })}" data-swap="#picker"${d === p.date ? raw(' aria-current="date"') : ""} aria-label="${fmtDayOfDate(d)}">${Number(d.slice(8))}</a></td>`
              : html`<td><span class="day${d === p.today ? " today" : ""}">${Number(d.slice(8))}</span></td>`,
        )}</tr>`,
      )}</tbody>
    </table>
    ${zonePicker(p)}
  </section>
  <section class="times">
    ${p.date
      ? html`<h3>${fmtDayOfDate(p.date)}</h3>
    <ol>${p.slots.map(
      (sl) => html`<li class="slot"><a class="time" href="${p.pick(sl)}">${fmtTime(sl.start, p.tz)}</a><a class="next" href="${p.pick(sl)}">Next</a></li>`,
    )}</ol>`
      : html`<h3>${fmtMonth(p.month)}</h3><p class="none">${p.open.size ? "Pick a day." : p.next ? html`Nothing free this month. <a href="${p.next}" data-swap="#picker">See ${fmtMonth(p.next.match(/month=(\d{4}-\d{2})/)?.[1] ?? p.month)}</a>` : "Nothing free right now."}</p>`}
  </section>
</div>`;

export const detailsPage = (s: Settings, sv: Service, when: string, staffName: string | undefined, action: string, back: string, d: Partial<Details>, errors: Partial<Record<keyof Details, string>>, taken: boolean, hidden: Record<string, string>, button = "Book") => html`<div class="booker two">
  ${summary(s, sv, { when, staffName })}
  <section>
    ${taken ? html`<div class="notice error" role="alert">That time has just gone. <a href="${back}">Pick another time</a>.</div>` : ""}
    <form class="details-form" method="post" action="${action}" novalidate>
      ${Object.entries(hidden).map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}
      ${field("name", "Name", "text", d.name, errors.name, 'autocomplete="name" required')}
      ${field("email", "Email", "email", d.email, errors.email, 'autocomplete="email" required')}
      ${field("phone", "Phone", "tel", d.phone, errors.phone, 'autocomplete="tel"')}
      <div class="field"><label for="notes">Anything we should know?</label><textarea id="notes" name="notes" rows="3" maxlength="2000">${d.notes ?? ""}</textarea></div>
      <div class="row"><button class="btn primary" type="submit">${icon.check}${button}</button><a class="btn ghost" href="${back}">${icon.left}Change time</a></div>
    </form>
  </section>
</div>`;

const field = (name: string, label: string, type: string, value: string | undefined, error: string | undefined, attrs: string) => html`<div class="field">
  <label for="${name}">${label}</label>
  <input id="${name}" name="${name}" type="${type}" value="${value ?? ""}" ${raw(attrs)}${error ? raw(` aria-invalid="true" aria-describedby="${name}-error"`) : ""}>
  ${error ? html`<span class="error" id="${name}-error">${error}</span>` : ""}
</div>`;

export const bookingPage = (s: Settings, b: BookingView, base: string, opts: { fresh?: boolean; mayChange: boolean; tz: string; flash?: string }) => {
  const e = eventOf(b, s, base);
  const cancelled = b.status === "cancelled";
  const past = b.ends_at.getTime() < Date.now();
  return html`<div class="wrap${cancelled ? " cancelled" : ""}"><div class="done-page">
  ${cancelled ? html`<div class="seal off">${icon.x}</div><h1>Canceled</h1>` : html`<div class="seal${opts.fresh ? " pop" : ""}">${icon.check}</div><h1>${opts.fresh ? "You're booked" : past ? "Your booking" : "You're booked"}</h1>`}
  ${opts.flash ? html`<p class="muted">${opts.flash}</p>` : opts.fresh ? html`<p class="muted">We've emailed the details to ${b.customer_email}.</p>` : ""}
  <article class="ticket">
    <header><h2>${b.service_name}</h2><div class="when">${fmtDay(b.starts_at.getTime(), opts.tz)}, ${fmtTime(b.starts_at.getTime(), opts.tz)} to ${fmtTime(b.ends_at.getTime(), opts.tz)}</div><div class="small muted">${zoneLabel(opts.tz, b.starts_at.getTime())}</div></header>
    <dl>
      <dt>With</dt><dd>${b.staff_name}</dd>
      ${b.location ? html`<dt>Where</dt><dd>${b.location}</dd>` : ""}
      <dt>Name</dt><dd>${b.customer_name}</dd>
      ${b.notes ? html`<dt>Note</dt><dd style="white-space:pre-wrap">${b.notes}</dd>` : ""}
    </dl>
  </article>
  ${cancelled || past
    ? html`<p><a class="btn primary" href="/">${icon.calendar}Book again</a></p>`
    : html`<div class="addcal">
      <a class="btn small" href="${googleLink(e)}" target="_blank" rel="noopener">${icon.calendar}Google</a>
      <a class="btn small" href="${outlookLink(e)}" target="_blank" rel="noopener">${icon.calendar}Outlook</a>
      <a class="btn small" href="/b/${b.token}/event.ics">${icon.download}Apple or other</a>
    </div>
    ${opts.mayChange
      ? html`<div class="manage">
      <a class="btn" href="/b/${b.token}/move">${icon.move}Move</a>
      <form method="post" action="/b/${b.token}/cancel" data-confirm="Cancel this booking?"><button class="btn danger" type="submit">${icon.x}Cancel</button></form>
    </div>`
      : html`<p class="small muted">It's too close to the start to change online. Contact ${s.business_name} to change it.</p>`}`}
</div></div>`;
};

export const moveConfirm = (s: Settings, b: BookingView, sv: Service, start: number, end: number, tz: string, action: string, back: string, taken: boolean) => html`<div class="booker two">
  ${summary(s, sv, { when: `${fmtDay(start, tz)}, ${fmtTime(start, tz)}`, staffName: b.staff_name, kicker: "Move booking" })}
  <section>
    ${taken ? html`<div class="notice error" role="alert">That time has just gone. <a href="${back}">Pick another time</a>.</div>` : ""}
    <dl class="kv" style="margin-bottom:24px">
      <dt>From</dt><dd style="text-decoration:line-through;color:var(--muted)">${fmtDay(b.starts_at.getTime(), tz)}, ${fmtTime(b.starts_at.getTime(), tz)}</dd>
      <dt>To</dt><dd>${fmtDay(start, tz)}, ${fmtTime(start, tz)} to ${fmtTime(end, tz)}</dd>
    </dl>
    <form method="post" action="${action}">
      <input type="hidden" name="start" value="${start}">
      <div class="row"><button class="btn primary" type="submit">${icon.check}Move it</button><a class="btn ghost" href="${back}">${icon.left}Change time</a></div>
    </form>
  </section>
</div>`;
