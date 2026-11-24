// The app's background functions. Step names match workflows/*.graph.yaml.
import { demoFunctions } from "./demo.js";
import { customerMail } from "./emails.js";
import { baseUrl, email, sendNow } from "./mail.js";
import { reminderDue } from "./model.js";
import * as store from "./store.js";
import { inngest } from "./whisk.js";

type Failure = { event: { data: { event: { data: Record<string, unknown> } } }; error: Error };

// Sends one stored email. A refusal is retried; one that still fails shows as Failed.
export const sendEmail = inngest.createFunction(
  {
    id: "send-email",
    triggers: [{ event: "email.send" }],
    retries: 4,
    throttle: { limit: 60, period: "1m" },
    onFailure: async ({ event, error }: Failure) => {
      await store.markEmail(Number(event.data.event.data.email_id), "failed", error.message);
    },
  },
  async ({ event, step }) => step.run("send", () => sendNow(Number(event.data.email_id))),
);

// Every hour: a reminder to each customer whose booking starts within the reminder time.
export const reminders = inngest.createFunction({ id: "reminders", triggers: [{ cron: "0 * * * *" }] }, async ({ step }) =>
  step.run("send-reminders", async () => {
    const s = await store.settings();
    if (!s.reminder_minutes) return { sent: 0 };
    const now = Date.now();
    const due = (await store.remindersToSend(new Date(now + s.reminder_minutes * 60_000))).filter((b) => reminderDue(b, s, now));
    const sent = await due.reduce(async (n, b) => {
      const count = await n;
      if (!(await store.markReminded(b.id))) return count;
      await email(b.id, "reminder", customerMail("reminder", b, s, baseUrl()));
      return count + 1;
    }, Promise.resolve(0));
    return { sent };
  }),
);

export const functions = [sendEmail, reminders, ...demoFunctions()];
