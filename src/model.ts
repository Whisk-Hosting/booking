// The business's data as the app sees it, and the rules that decide things about it. Pure;
// test/model.test.ts covers the rules.

export type Settings = {
  business_name: string;
  tagline: string;
  accent: string;
  timezone: string;
  currency: string;
  min_notice_minutes: number;
  window_days: number;
  step_minutes: number;
  cancel_cutoff_minutes: number;
  reminder_minutes: number;
  email_from: string;
  reply_to: string;
};

export type Service = {
  id: number;
  slug: string;
  name: string;
  description: string;
  duration: number;
  buffer_after: number;
  price_cents: number | null;
  location: string;
  active: boolean;
  position: number;
  staff_ids: number[];
};

export type Staff = {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
  feed_token: string;
  busy_url: string;
  busy_error: string;
  busy_checked_at: Date | null;
};

export type Status = "confirmed" | "cancelled";

export type Booking = {
  id: number;
  token: string;
  service_id: number;
  staff_id: number;
  starts_at: Date;
  ends_at: Date;
  status: Status;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  notes: string;
  created_at: Date;
  cancelled_at: Date | null;
  cancelled_by: string;
  reminder_sent_at: Date | null;
};

export type BookingView = Booking & { service_name: string; staff_name: string; staff_email: string; location: string; duration: number; buffer_after: number };

export const isColour = (s: unknown): s is string => typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "service";

// A slug not already taken: "massage", then "massage-2", "massage-3"…
export const uniqueSlug = (base: string, taken: readonly string[]) =>
  [base, ...Array.from({ length: taken.length + 1 }, (_, i) => `${base}-${i + 2}`)].find((s) => !taken.includes(s))!;

export const money = (cents: number | null, currency: string) =>
  cents === null ? "" : cents === 0 ? "Free" : new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

export const parseMoney = (v: unknown): number | null => {
  const s = typeof v === "string" ? v.replace(/[$,\s]/g, "") : "";
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) : null;
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

// A customer may move or cancel up to the cut-off before the start; staff any time before the
// end.
export const customerMayChange = (b: Pick<Booking, "status" | "starts_at">, s: Pick<Settings, "cancel_cutoff_minutes">, now: number) =>
  b.status === "confirmed" && b.starts_at.getTime() - now >= s.cancel_cutoff_minutes * 60_000;

export const staffMayChange = (b: Pick<Booking, "status" | "ends_at">, now: number) => b.status === "confirmed" && b.ends_at.getTime() > now;

// A reminder goes once, when the start is within the reminder lead time, never for a booking
// made inside that time (its confirmation was just sent), and never after it starts.
export const reminderDue = (b: Pick<Booking, "status" | "starts_at" | "created_at" | "reminder_sent_at">, s: Pick<Settings, "reminder_minutes">, now: number) => {
  const lead = s.reminder_minutes * 60_000;
  const start = b.starts_at.getTime();
  return s.reminder_minutes > 0 && b.status === "confirmed" && !b.reminder_sent_at && start > now && start - now <= lead && start - b.created_at.getTime() > lead;
};

export type Details = { name: string; email: string; phone: string; notes: string };

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;
export const isEmail = (s: string) => s.length <= 254 && EMAIL.test(s);

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, max) : "");

// The details a customer types, tidied, with a message per field that is wrong.
export const readDetails = (form: Record<string, unknown>): { details: Details; errors: Partial<Record<keyof Details, string>> } => {
  const details = { name: clean(form.name, 120), email: clean(form.email, 254).toLowerCase(), phone: clean(form.phone, 40), notes: clean(form.notes, 2000) };
  const errors = {
    ...(details.name ? {} : { name: "Enter your name" }),
    ...(isEmail(details.email) ? {} : { email: "Enter an email address like you@example.com" }),
    ...(details.phone && !/^[+()\d\s-]{6,40}$/.test(details.phone) ? { phone: "Enter a phone number, or leave it empty" } : {}),
  };
  return { details, errors };
};

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
// Monday first, as people read a week.
export const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

// What a service may be, for the Services page and the API alike (the table checks the same).
export const SERVICE_LIMITS = { duration: [5, 720], buffer_after: [0, 240], name: 80, description: 600, location: 200 } as const;

// API keys start with this, so a leaked one is easy to recognize and search for.
export const KEY_PREFIX = "bkg_";
