import type { Application, ApplicationStatus, PrismaClient } from "@prisma/client";
import { assertValidTransition } from "./statusMachine";
import { computeReminderDueDate } from "./reminders";
import { enqueueReminderJob } from "./queue";

export interface CreateApplicationInput {
  userId: number;
  company: string;
  role: string;
  notes?: string;
}

/**
 * `enqueueReminder` is injectable (defaults to the real BullMQ-backed
 * implementation) so this can be tested without a running Redis/BullMQ
 * connection — the DB-side effects (the Application row, the initial
 * StatusChange, and the Reminder row) are what matter for those tests.
 */
export async function createApplication(
  prisma: PrismaClient,
  input: CreateApplicationInput,
  enqueueReminder: typeof enqueueReminderJob = enqueueReminderJob,
): Promise<Application> {
  const { app, reminder } = await prisma.$transaction(async (tx) => {
    const app = await tx.application.create({
      data: { userId: input.userId, company: input.company, role: input.role, notes: input.notes ?? null },
    });
    await tx.statusChange.create({
      data: { applicationId: app.id, fromStatus: null, toStatus: "APPLIED" },
    });
    const reminder = await tx.reminder.create({
      data: { applicationId: app.id, dueAt: computeReminderDueDate() },
    });
    return { app, reminder };
  });

  // Outside the DB transaction deliberately: Redis isn't part of it, and
  // enqueueing after commit means we never reference a reminder that a
  // rolled-back transaction made disappear.
  await enqueueReminder(reminder.id, reminder.dueAt);

  return app;
}

export class ApplicationNotFoundError extends Error {
  constructor(id: number) {
    super(`Application ${id} not found`);
    this.name = "ApplicationNotFoundError";
  }
}

export async function transitionApplicationStatus(
  prisma: PrismaClient,
  applicationId: number,
  toStatus: ApplicationStatus,
): Promise<Application> {
  const application = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!application) throw new ApplicationNotFoundError(applicationId);

  assertValidTransition(application.status, toStatus);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.application.update({
      where: { id: applicationId },
      data: { status: toStatus, lastStatusChangeAt: new Date() },
    });
    await tx.statusChange.create({
      data: { applicationId, fromStatus: application.status, toStatus },
    });
    return updated;
  });
}
