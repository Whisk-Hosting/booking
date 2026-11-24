// The Whisk conventions this app uses: identity from headers, JSON logs with the request id,
// the Inngest client wired to the platform, the queue, and calls to the Whisk API as the app.
import type { Context } from "hono";
import { Inngest } from "inngest";
import pino from "pino";

export const env = (name: string, fallback?: string): string => {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`${name} is not set`);
  return v;
};

export const log = pino({ level: process.env.LOG_LEVEL ?? "info", base: { app: process.env.WHISK_APP_NAME } });

// Identity as delivered by the platform. Only the X-Whisk-* headers are trusted.
export type Identity = {
  audience: "anonymous" | "team" | "customer" | "service";
  userId?: string;
  email?: string;
  name?: string;
  groups: string[];
  roles: string[];
  requestId: string;
};

const list = (v: string | undefined) => (v ?? "").split(",").filter(Boolean);

export const identity = (h: (name: string) => string | undefined): Identity => ({
  audience: (h("x-whisk-audience") as Identity["audience"]) ?? "anonymous",
  userId: h("x-whisk-user-id"),
  email: h("x-whisk-email"),
  name: h("x-whisk-name"),
  groups: list(h("x-whisk-groups")),
  roles: list(h("x-whisk-roles")),
  requestId: h("x-whisk-request-id") ?? "",
});

export const who = (c: Context) => identity((n) => c.req.header(n));

export const inngest = new Inngest({
  id: env("WHISK_APP_NAME", "booking"),
  eventKey: process.env.WHISK_INNGEST_EVENT_KEY,
  signingKey: process.env.WHISK_INNGEST_SIGNING_KEY,
  baseUrl: process.env.WHISK_INNGEST_URL,
  isDev: process.env.WHISK_DEV === "1",
  logger: log,
});

// Where nothing runs functions: a preview, or a laptop without `whisk dev`. Work that would go
// through the queue then runs straight away.
export const noQueue = () => !process.env.WHISK_QUEUE_URL || (process.env.WHISK_ENV ?? "").startsWith("preview:");

// enqueue sends an event through the platform queue with the service token, with a deadline.
export const enqueue = async (name: string, data: unknown, dedupeKey?: string): Promise<void> => {
  const res = await fetch(env("WHISK_QUEUE_URL"), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env("WHISK_SERVICE_TOKEN")}` },
    body: JSON.stringify({ name, data, dedupe_key: dedupeKey }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`enqueue ${name}: ${res.status} ${await res.text()}`);
};

type ApiError = { code: string; message: string; fix?: string };

// whiskApi calls the Whisk API as this app: the app's own API sits beside its queue URL
// (…/v1/orgs/<org>/apps/<app>). The service token rotates daily, so it is read on every call.
export const whiskApi = async <T>(path: string, body?: unknown): Promise<T> => {
  const res = await fetch(env("WHISK_QUEUE_URL").replace(/\/events$/, "") + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env("WHISK_SERVICE_TOKEN")}` },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: ApiError };
  if (!res.ok) throw Object.assign(new Error(json.error?.message ?? `Whisk API ${res.status}`), { api: json.error });
  return json as T;
};
