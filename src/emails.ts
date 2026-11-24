// Every email the app sends, as pure functions from the booking to {subject, html, text}.
import { googleLink, outlookLink, type CalEvent } from "./ics.js";
import { isColour, type BookingView, type Settings } from "./model.js";
import { fmtDuration, fmtWhen, localDate, zoneLabel } from "./time.js";

export type Mail = { to: string; subject: string; html: string; text: string };

export type Kind = "confirmed" | "moved" | "cancelled" | "reminder" | "staff-new" | "staff-moved" | "staff-cancelled";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const eventOf = (b: BookingView, s: Settings, base: string): CalEvent => ({
  uid: `booking-${b.id}@${new URL(base).hostname}`,
  start: b.starts_at.getTime(),
  end: b.ends_at.getTime(),
  title: `${b.service_name} with ${b.staff_name}`,
  description: `${s.business_name}\nSee, move or cancel: ${base}/b/${b.token}`,
  location: b.location,
  cancelled: b.status === "cancelled",
  url: `${base}/b/${b.token}`,
});

type Block = { heading: string; lead: string; rows: [string, string][]; buttons: { label: string; href: string; primary?: boolean }[]; foot: string };

const frame = (s: Settings, b: Block) => {
  const accent = isColour(s.accent) ? s.accent : "#e85d2a";
  const rows = b.rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#6b665d;white-space:nowrap;vertical-align:top">${escape(k)}</td><td style="padding:6px 0;color:#1f1d1a;font-weight:600">${escape(v).replace(/\n/g, "<br>")}</td></tr>`)
    .join("");
  const buttons = b.buttons
    .map((x) =>
      x.primary
        ? `<a href="${escape(x.href)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 18px;border-radius:10px;background:${accent};color:#ffffff;font-weight:600;text-decoration:none">${escape(x.label)}</a>`
        : `<a href="${escape(x.href)}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 16px;border-radius:10px;border:1px solid #cfc9bd;color:#1f1d1a;font-weight:600;text-decoration:none">${escape(x.label)}</a>`,
    )
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f7f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;line-height:1.5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3dfd6;border-radius:16px">
<tr><td style="height:6px;background:${accent};border-radius:16px 16px 0 0"></td></tr>
<tr><td style="padding:28px 32px 8px"><div style="font-weight:700;color:#1f1d1a"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${accent};margin-right:8px"></span>${escape(s.business_name)}</div></td></tr>
<tr><td style="padding:8px 32px 0"><h1 style="font-size:24px;line-height:1.25;margin:8px 0 8px;color:#1f1d1a">${escape(b.heading)}</h1><p style="margin:0 0 16px;color:#4a463f">${escape(b.lead)}</p></td></tr>
<tr><td style="padding:0 32px 8px"><table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px">${rows}</table></td></tr>
<tr><td style="padding:16px 32px 24px">${buttons}</td></tr>
${b.foot ? `<tr><td style="padding:0 32px 28px;color:#6b665d;font-size:13px">${escape(b.foot)}</td></tr>` : ""}
</table></td></tr></table></body></html>`;
};

const text = (s: Settings, b: Block) =>
  [s.business_name, "", b.heading, b.lead, "", ...b.rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`), "", ...b.buttons.map((x) => `${x.label}: ${x.href}`), "", b.foot].join("\n").trim();

const mail = (to: string, subject: string, s: Settings, b: Block): Mail => ({ to, subject, html: frame(s, b), text: text(s, b) });

const when = (b: BookingView, s: Settings) => `${fmtWhen(b.starts_at.getTime(), s.timezone)} (${zoneLabel(s.timezone, b.starts_at.getTime())})`;

const details = (b: BookingView, s: Settings): [string, string][] => [
  ["What", `${b.service_name}, ${fmtDuration(b.duration)}`],
  ["When", when(b, s)],
  ["With", b.staff_name],
  ["Where", b.location],
];

const calendarButtons = (b: BookingView, s: Settings, base: string) => {
  const e = eventOf(b, s, base);
  return [
    { label: "Google Calendar", href: googleLink(e) },
    { label: "Outlook", href: outlookLink(e) },
    { label: "Apple or other (.ics)", href: `${base}/b/${b.token}/event.ics` },
  ];
};

const cutoffNote = (s: Settings) =>
  s.cancel_cutoff_minutes > 0 ? `You can move or cancel up to ${fmtDuration(s.cancel_cutoff_minutes)} before it starts.` : "You can move or cancel any time before it starts.";

export const customerMail = (kind: "confirmed" | "moved" | "cancelled" | "reminder", b: BookingView, s: Settings, base: string): Mail => {
  const manage = { label: "See, move or cancel", href: `${base}/b/${b.token}`, primary: true };
  const first = b.customer_name.split(/\s+/)[0];
  switch (kind) {
    case "confirmed":
      return mail(b.customer_email, `Booked: ${b.service_name}, ${fmtWhen(b.starts_at.getTime(), s.timezone)}`, s, {
        heading: "You're booked",
        lead: `Thanks ${first}. Here are the details.`,
        rows: details(b, s),
        buttons: [manage, ...calendarButtons(b, s, base)],
        foot: cutoffNote(s),
      });
    case "moved":
      return mail(b.customer_email, `Moved: ${b.service_name}, now ${fmtWhen(b.starts_at.getTime(), s.timezone)}`, s, {
        heading: "Your booking has moved",
        lead: `${first}, here is the new time.`,
        rows: details(b, s),
        buttons: [manage, ...calendarButtons(b, s, base)],
        foot: cutoffNote(s),
      });
    case "reminder":
      return mail(b.customer_email, `Reminder: ${b.service_name}, ${fmtWhen(b.starts_at.getTime(), s.timezone)}`, s, {
        heading: "See you soon",
        lead: `${first}, a reminder of your booking.`,
        rows: details(b, s),
        buttons: [manage],
        foot: cutoffNote(s),
      });
    case "cancelled":
      return mail(b.customer_email, `Canceled: ${b.service_name}, ${fmtWhen(b.starts_at.getTime(), s.timezone)}`, s, {
        heading: "Your booking is canceled",
        lead: b.cancelled_by === "customer" ? `${first}, you canceled this booking.` : `${first}, ${s.business_name} canceled this booking.`,
        rows: details(b, s),
        buttons: [{ label: "Book another time", href: `${base}/`, primary: true }],
        foot: "",
      });
  }
};

export const staffMail = (kind: "staff-new" | "staff-moved" | "staff-cancelled", b: BookingView, s: Settings, base: string): Mail => {
  const heading = kind === "staff-new" ? "New booking" : kind === "staff-moved" ? "Booking moved" : "Booking canceled";
  return mail(b.staff_email, `${heading}: ${b.customer_name}, ${fmtWhen(b.starts_at.getTime(), s.timezone)}`, s, {
    heading,
    lead: `${b.customer_name}, ${b.service_name}`,
    rows: [...details(b, s), ["Email", b.customer_email], ["Phone", b.customer_phone], ["Note", b.notes]],
    buttons: [{ label: "Open the schedule", href: `${base}/schedule?date=${localDate(b.starts_at.getTime(), s.timezone)}`, primary: true }],
    foot: "",
  });
};
