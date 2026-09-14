/**
 * The background worker process: consumes delayed "send-reminder" jobs
 * from the BullMQ queue that `applicationService.createApplication`
 * enqueues, and actually sends (or correctly skips) each one.
 *
 * Runs as a separate long-lived process from the Next.js app itself —
 * `npm run worker`, alongside `npm run dev`/`npm start`.
 */
import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { getRedis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { processReminder } from "../lib/reminders";
import { sendReminderEmail } from "../lib/email";
import { REMINDER_QUEUE_NAME, SEND_REMINDER_JOB } from "../lib/queue";

const worker = new Worker(
  REMINDER_QUEUE_NAME,
  async (job: Job) => {
    if (job.name !== SEND_REMINDER_JOB) return;
    const { reminderId } = job.data as { reminderId: number };
    const result = await processReminder(prisma, sendReminderEmail, reminderId);
    console.log(`[reminder ${reminderId}]`, result);
  },
  { connection: getRedis() },
);

worker.on("failed", (job, err) => {
  console.error(`Reminder job ${job?.id} failed:`, err);
});

console.log("Reminder worker started, waiting for due reminders...");
