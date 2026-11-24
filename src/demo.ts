// Demo mode, shared by Whisk's example apps (examples/demo-mode.md). Everything about the live
// demo is in this file: delete it, and the three places that import it, and the app has no demo.
//
// Off unless DEMO=1, which only demo/whisk.yaml sets. Then a visitor presses Look around, gets a
// guest cookie and is treated as a member of the team; emails are recorded, never sent; the guest
// may make API keys to try the API; and demo-reset puts the sample data back (and drops every
// key) every night.
import type { Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { html } from "hono/html";
import { sql } from "./db.js";
import { seed } from "./seed.js";
import { icon } from "./views/icons.js";
import { identity, inngest, type Identity } from "./whisk.js";

export const isDemo = () => process.env.DEMO === "1";

const COOKIE = "guest";

const GUEST: Omit<Identity, "requestId"> = { audience: "team", userId: "demo-guest", email: "guest@example.com", name: "Guest", roles: ["member", "admin"], groups: [] };

const isGuest = (c: Context) => isDemo() && getCookie(c, COOKIE) === "1";

// Who is asking. A real signed-in person always wins; in the demo, the guest cookie makes an
// anonymous visitor a team member. The only place identity is decided.
export const viewer = (c: Context): Identity => {
  const id = identity((n) => c.req.header(n));
  return id.audience === "anonymous" && isGuest(c) ? { ...GUEST, requestId: id.requestId } : id;
};

export const demoRoutes = (app: Hono) => {
  app.post("/demo/start", (c) => {
    if (!isDemo()) return c.notFound();
    setCookie(c, COOKIE, "1", { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 });
    return c.redirect("/schedule", 303);
  });
  app.post("/demo/leave", (c) => {
    if (!isDemo()) return c.notFound();
    deleteCookie(c, COOKIE, { path: "/", secure: true });
    return c.redirect("/", 303);
  });
};

// The bar at the bottom of every demo page: Look around on the booking page, Leave demo inside.
export const demoBar = (c: Context, staffSide: boolean) => {
  if (!isDemo()) return undefined;
  if (isGuest(c) && staffSide)
    return html`<div class="demo-bar">${icon.eye}<span>Demo, resets nightly</span><form method="post" action="/demo/leave"><button class="btn small" type="submit">Leave demo</button></form></div>`;
  // On the staff side an anonymous visitor already sees the Look around card.
  if (viewer(c).audience !== "team" && !staffSide)
    return html`<div class="demo-bar"><span>This is a demo</span><form method="post" action="/demo/start"><button class="btn small primary" type="submit">${icon.eye}Look around the staff side</button></form></div>`;
  return undefined;
};

// Every night at 3 am in New York: empty the app's tables and put the sample data back. Only
// registered when DEMO=1, and only declared in demo/whisk.yaml.
export const demoReset = inngest.createFunction({ id: "demo-reset", triggers: [{ cron: "0 3 * * *" }] }, async ({ step }) =>
  step.run("reset", async () => {
    await sql.begin(async (tx) => {
      await tx`truncate api_keys, emails, bookings, time_off, hours, service_staff, services, staff restart identity cascade`;
      await tx`update settings set business_name = default, tagline = default, accent = default, timezone = default, currency = default,
        min_notice_minutes = default, window_days = default, step_minutes = default, cancel_cutoff_minutes = default,
        reminder_minutes = default, email_from = default, reply_to = default where id = 1`;
      await seed(tx);
    });
    return { reset: true };
  }),
);

// What an anonymous visitor sees on a staff page in the demo: one button to look around.
export const demoLanding = () =>
  html`<div class="wrap"><div class="done-page"><div class="seal">${icon.eye}</div><h1>Look around</h1><p class="muted">Sample data · No email sent · Resets every night</p><form method="post" action="/demo/start"><button class="btn primary" type="submit">${icon.eye}Look around</button></form></div></div>`;

export const demoFunctions = () => (isDemo() ? [demoReset] : []);
