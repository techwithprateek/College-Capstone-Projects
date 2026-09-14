import { Queue } from "bullmq";
import { getRedis } from "./redis";

export const REMINDER_QUEUE_NAME = "reminders";
export const SEND_REMINDER_JOB = "send-reminder";

let queue: Queue | null = null;

function getReminderQueue(): Queue {
  if (!queue) {
    queue = new Queue(REMINDER_QUEUE_NAME, { connection: getRedis() });
  }
  return queue;
}

/**
 * Schedules a BullMQ delayed job that fires at exactly the reminder's due
 * time, rather than polling "are any reminders due yet?" on an interval.
 * `jobId` is deterministic per reminder, so calling this twice for the
 * same reminder is a safe no-op (BullMQ dedupes by jobId) instead of
 * double-scheduling.
 */
export async function enqueueReminderJob(reminderId: number, dueAt: Date): Promise<void> {
  const delayMs = Math.max(0, dueAt.getTime() - Date.now());
  await getReminderQueue().add(SEND_REMINDER_JOB, { reminderId }, { delay: delayMs, jobId: `reminder-${reminderId}` });
}
