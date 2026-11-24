// Sending email through Whisk email. Each message is written to the emails table first, then
// sent by the send-email function, so staff see what went and what failed, and a failed send is
// retried. Where nothing runs functions (a preview, a laptop) it is sent straight away.
import { isDemo } from "./demo.js";
import type { Mail } from "./emails.js";
import type { Settings } from "./model.js";
import * as store from "./store.js";
import { enqueue, log, noQueue, whiskApi } from "./whisk.js";

// The address in links: PUBLIC_URL when it is set in whisk.yaml (the business's own domain),
// otherwise the address Whisk gave the app.
export const baseUrl = () => (process.env.PUBLIC_URL || process.env.WHISK_PUBLIC_URL || `http://localhost:${process.env.PORT ?? 8080}`).replace(/\/$/, "");

const fromHeader = (s: Settings) => (s.email_from ? `"${s.business_name.replace(/["\\\r\n]/g, "")}" <${s.email_from}>` : undefined);

// sendNow sends one stored message and records how it went.
export const sendNow = async (id: number) => {
  const [e, s] = await Promise.all([store.emailById(id), store.settings()]);
  if (!e || e.status === "sent" || e.status === "demo") return e?.status ?? "missing";
  // The live demo and a laptop (whisk dev) record each message and send nothing.
  if (isDemo() || process.env.WHISK_DEV === "1") {
    log.info({ to: e.to_address, subject: e.subject }, "email recorded, not sent");
    await store.markEmail(id, "demo");
    return "demo";
  }
  await whiskApi("/email/send", { to: e.to_address, subject: e.subject, html: e.html, text: e.body_text, from: fromHeader(s), reply_to: s.reply_to || undefined });
  await store.markEmail(id, "sent");
  return "sent";
};

// email stores a message and hands it to the queue. It never throws: a booking is saved
// whether or not its email goes, and the sent-email list shows any that failed.
export const email = async (bookingId: number | null, kind: string, m: Mail) => {
  if (!m.to) return;
  try {
    const id = await store.queueEmail({ booking_id: bookingId, kind, ...m });
    if (noQueue() || isDemo()) await sendNow(id).catch(async (err) => store.markEmail(id, "failed", String(err instanceof Error ? err.message : err)));
    else await enqueue("email.send", { email_id: id }, `email-${id}`);
  } catch (err) {
    log.error({ booking_id: bookingId, kind, err: String(err) }, "email not queued");
  }
};
