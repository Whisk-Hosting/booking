import { serve as nodeServe } from "@hono/node-server";
import { Hono } from "hono";
import { serve as inngestServe } from "inngest/hono";
import { readFile } from "node:fs/promises";
import { api } from "./api.js";
import { sql } from "./db.js";
import { demoRoutes } from "./demo.js";
import { functions } from "./functions.js";
import { publicRoutes } from "./routes/public.js";
import { staffRoutes } from "./routes/staff.js";
import { js } from "./views/scripts.js";
import { css } from "./views/styles.js";
import { notFound } from "./web.js";
import { env, inngest, log, who } from "./whisk.js";

if (process.env.SENTRY_DSN) {
  const Sentry = await import("@sentry/node");
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.WHISK_ENV });
}

const app = new Hono();

// Every request: one JSON log line with the request id.
app.use("*", async (c, next) => {
  const started = Date.now();
  await next();
  const id = who(c);
  log.info({ request_id: id.requestId, method: c.req.method, path: c.req.path, status: c.res.status, audience: id.audience, ms: Date.now() - started }, "request");
});

app.get("/health", async (c) => {
  try {
    await sql`select 1`;
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 503);
  }
});

app.get("/assets/app.css", (c) => c.body(css, 200, { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=86400" }));
app.get("/assets/app.js", (c) => c.body(js, 200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=86400" }));
// The edge serves public/fonts itself (static in whisk.yaml); this covers a laptop.
app.get("/assets/fonts/:file", async (c) => {
  const file = c.req.param("file");
  if (!/^[a-z0-9-]+\.woff2$/.test(file)) return c.notFound();
  const font = await readFile(new URL(`../public/fonts/${file}`, import.meta.url)).catch(() => undefined);
  return font ? c.body(new Uint8Array(font), 200, { "content-type": "font/woff2", "cache-control": "public, max-age=31536000, immutable" }) : c.notFound();
});

// Function runs arrive here from the platform with the service identity (queue.endpoint).
const inngestHandler = inngestServe({ client: inngest, functions });
app.on(["GET", "POST", "PUT"], "/.whisk/inngest", (c) => inngestHandler(c));

demoRoutes(app);
// The API answers JSON and checks its own keys (routes.public has /api/**).
app.route("/api/v1", api);
publicRoutes(app);
staffRoutes(app);

const apiPath = (path: string) => path === "/api" || path.startsWith("/api/");

app.notFound((c) =>
  apiPath(c.req.path) ? c.json({ error: { code: "NOT_FOUND", message: "There is no such API endpoint.", fix: "GET /api/v1 lists the endpoints." } }, 404) : notFound(c),
);

app.onError(async (err, c) => {
  log.error({ request_id: who(c).requestId, err: err.message, stack: err.stack }, "unhandled error");
  if (process.env.SENTRY_DSN) (await import("@sentry/node")).captureException(err);
  const ref = who(c).requestId.replace(/[^A-Za-z0-9_-]/g, "") || "none";
  if (apiPath(c.req.path)) return c.json({ error: { code: "INTERNAL", message: "Something went wrong.", fix: `Try again. If it keeps happening, quote ${ref}.` } }, 500);
  return c.html(
    `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Something went wrong</title><body style="font-family:system-ui;max-width:36rem;margin:4rem auto;padding:0 1rem"><h1>Something went wrong</h1><p>Try again in a moment. If it keeps happening, quote ${ref}.</p><p><a href="/">Back to booking</a></p></body>`,
    500,
  );
});

const server = nodeServe({ fetch: app.fetch, port: Number(env("PORT", "8080")), hostname: "0.0.0.0" }, (info) => log.info({ port: info.port }, "listening"));

// SIGTERM: stop accepting, finish in-flight requests, close the pool, exit within the grace period.
const shutdown = () => {
  log.info("shutting down");
  server.close(async () => {
    await sql.end({ timeout: 5 });
    process.exit(0);
  });
  setTimeout(() => process.exit(1), (Number(process.env.WHISK_STOP_GRACE ?? 28) - 2) * 1000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
