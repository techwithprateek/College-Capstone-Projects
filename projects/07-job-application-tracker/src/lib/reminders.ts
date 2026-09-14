import type { Application, ApplicationStatus, PrismaClient, Reminder } from "@prisma/client";
import type { SendReminderInput } from "./email";

const REMINDER_DAYS = 7;

export function computeReminderDueDate(from: Date = new Date()): Date {
  const due = new Date(from);
  due.setDate(due.getDate() + REMINDER_DAYS);
  return due;
}

/**
 * A reminder should only actually fire if the application hasn't moved
 * since the reminder was scheduled — otherwise a candidate who got an
 * interview three days ago still gets an email asking "still waiting to
 * hear back?" a week after applying, because the reminder didn't know the
 * world had changed.
 */
export function shouldSendReminder(
  application: Pick<Application, "status" | "lastStatusChangeAt">,
  reminder: Pick<Reminder, "createdAt">,
): boolean {
  const stillAwaitingResponse: ApplicationStatus[] = ["APPLIED", "SCREENING"];
  if (!stillAwaitingResponse.includes(application.status)) return false;
  if (application.lastStatusChangeAt.getTime() > reminder.createdAt.getTime()) return false;
  return true;
}

export type ProcessReminderResult =
  | { sent: true }
  | { sent: false; reason: "not_found" | "already_processed" | "status_has_moved_on" };

/**
 * Sends (or correctly skips) one due reminder, then marks it processed
 * either way — a skipped reminder is still "handled," not left pending
 * forever to be re-evaluated on every future worker run.
 */
export async function processReminder(
  prisma: PrismaClient,
  sendEmail: (input: SendReminderInput) => Promise<void>,
  reminderId: number,
): Promise<ProcessReminderResult> {
  const reminder = await prisma.reminder.findUnique({
    where: { id: reminderId },
    include: { application: { include: { user: true } } },
  });
  if (!reminder) return { sent: false, reason: "not_found" };
  if (reminder.sentAt) return { sent: false, reason: "already_processed" };

  if (!shouldSendReminder(reminder.application, reminder)) {
    await prisma.reminder.update({ where: { id: reminderId }, data: { sentAt: new Date() } });
    return { sent: false, reason: "status_has_moved_on" };
  }

  await sendEmail({
    to: reminder.application.user.email,
    company: reminder.application.company,
    role: reminder.application.role,
  });
  await prisma.reminder.update({ where: { id: reminderId }, data: { sentAt: new Date() } });
  return { sent: true };
}
