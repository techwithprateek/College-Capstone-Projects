import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { computeReminderDueDate, processReminder, shouldSendReminder } from "../src/lib/reminders";

const prisma = new PrismaClient();

beforeEach(async () => {
  await prisma.reminder.deleteMany();
  await prisma.statusChange.deleteMany();
  await prisma.application.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("computeReminderDueDate", () => {
  it("is 7 days after the given date", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const due = computeReminderDueDate(from);
    expect(due.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });
});

describe("shouldSendReminder", () => {
  it("sends when still APPLIED and nothing changed since the reminder was created", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const application = { status: "APPLIED" as const, lastStatusChangeAt: createdAt };
    expect(shouldSendReminder(application, { createdAt })).toBe(true);
  });

  it("does not send once the application has moved past screening", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const application = { status: "INTERVIEW" as const, lastStatusChangeAt: createdAt };
    expect(shouldSendReminder(application, { createdAt })).toBe(false);
  });

  it("does not send if the status changed after the reminder was scheduled", () => {
    const reminderCreatedAt = new Date("2026-01-01T00:00:00Z");
    // still APPLIED currently, but it WAS bumped (e.g. moved to SCREENING
    // then somehow back — the point is lastStatusChangeAt moved forward)
    const application = { status: "APPLIED" as const, lastStatusChangeAt: new Date("2026-01-03T00:00:00Z") };
    expect(shouldSendReminder(application, { createdAt: reminderCreatedAt })).toBe(false);
  });
});

async function makeUserAndApplication(prisma: PrismaClient) {
  const user = await prisma.user.create({ data: { email: `u${Date.now()}${Math.random()}@example.com` } });
  const application = await prisma.application.create({
    data: { userId: user.id, company: "Acme", role: "Engineer" },
  });
  return { user, application };
}

describe("processReminder", () => {
  it("sends the email and marks the reminder sent when still awaiting response", async () => {
    const { user, application } = await makeUserAndApplication(prisma);
    const reminder = await prisma.reminder.create({ data: { applicationId: application.id, dueAt: new Date() } });
    const sendEmail = vi.fn().mockResolvedValue(undefined);

    const result = await processReminder(prisma, sendEmail, reminder.id);

    expect(result).toEqual({ sent: true });
    expect(sendEmail).toHaveBeenCalledWith({ to: user.email, company: "Acme", role: "Engineer" });
    const updated = await prisma.reminder.findUnique({ where: { id: reminder.id } });
    expect(updated?.sentAt).not.toBeNull();
  });

  it("skips sending (but still marks processed) when the application already moved on", async () => {
    const { application } = await makeUserAndApplication(prisma);
    await prisma.application.update({ where: { id: application.id }, data: { status: "INTERVIEW" } });
    const reminder = await prisma.reminder.create({ data: { applicationId: application.id, dueAt: new Date() } });
    const sendEmail = vi.fn();

    const result = await processReminder(prisma, sendEmail, reminder.id);

    expect(result).toEqual({ sent: false, reason: "status_has_moved_on" });
    expect(sendEmail).not.toHaveBeenCalled();
    const updated = await prisma.reminder.findUnique({ where: { id: reminder.id } });
    expect(updated?.sentAt).not.toBeNull(); // still marked processed, not left pending forever
  });

  it("does not re-send an already-sent reminder", async () => {
    const { application } = await makeUserAndApplication(prisma);
    const reminder = await prisma.reminder.create({
      data: { applicationId: application.id, dueAt: new Date(), sentAt: new Date() },
    });
    const sendEmail = vi.fn();

    const result = await processReminder(prisma, sendEmail, reminder.id);

    expect(result).toEqual({ sent: false, reason: "already_processed" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns not_found for a nonexistent reminder id", async () => {
    const sendEmail = vi.fn();
    const result = await processReminder(prisma, sendEmail, 999999);
    expect(result).toEqual({ sent: false, reason: "not_found" });
  });
});
