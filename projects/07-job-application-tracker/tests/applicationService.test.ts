import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApplicationNotFoundError,
  createApplication,
  transitionApplicationStatus,
} from "../src/lib/applicationService";
import { InvalidTransitionError } from "../src/lib/statusMachine";

const prisma = new PrismaClient();
let userId: number;

beforeEach(async () => {
  await prisma.reminder.deleteMany();
  await prisma.statusChange.deleteMany();
  await prisma.application.deleteMany();
  await prisma.user.deleteMany();
  const user = await prisma.user.create({ data: { email: `u${Date.now()}${Math.random()}@example.com` } });
  userId = user.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("createApplication", () => {
  it("creates the application, an initial StatusChange row, and a reminder", async () => {
    const fakeEnqueue = vi.fn().mockResolvedValue(undefined);

    const application = await createApplication(
      prisma,
      { userId, company: "Acme", role: "Engineer" },
      fakeEnqueue,
    );

    expect(application.status).toBe("APPLIED");

    const history = await prisma.statusChange.findMany({ where: { applicationId: application.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStatus: null, toStatus: "APPLIED" });

    const reminder = await prisma.reminder.findFirst({ where: { applicationId: application.id } });
    expect(reminder).not.toBeNull();
  });

  it("enqueues the reminder job for the created reminder, after the DB transaction commits", async () => {
    const fakeEnqueue = vi.fn().mockResolvedValue(undefined);

    const application = await createApplication(
      prisma,
      { userId, company: "Acme", role: "Engineer" },
      fakeEnqueue,
    );

    const reminder = await prisma.reminder.findFirstOrThrow({ where: { applicationId: application.id } });
    expect(fakeEnqueue).toHaveBeenCalledWith(reminder.id, reminder.dueAt);
  });
});

describe("transitionApplicationStatus", () => {
  it("updates status, lastStatusChangeAt, and records a StatusChange", async () => {
    const fakeEnqueue = vi.fn().mockResolvedValue(undefined);
    const application = await createApplication(prisma, { userId, company: "Acme", role: "Engineer" }, fakeEnqueue);
    const before = application.lastStatusChangeAt;
    await new Promise((r) => setTimeout(r, 10));

    const updated = await transitionApplicationStatus(prisma, application.id, "SCREENING");

    expect(updated.status).toBe("SCREENING");
    expect(updated.lastStatusChangeAt.getTime()).toBeGreaterThan(before.getTime());

    const history = await prisma.statusChange.findMany({
      where: { applicationId: application.id },
      orderBy: { changedAt: "asc" },
    });
    expect(history.map((h) => h.toStatus)).toEqual(["APPLIED", "SCREENING"]);
    expect(history[1].fromStatus).toBe("APPLIED");
  });

  it("rejects an invalid transition and leaves the application unchanged", async () => {
    const fakeEnqueue = vi.fn().mockResolvedValue(undefined);
    const application = await createApplication(prisma, { userId, company: "Acme", role: "Engineer" }, fakeEnqueue);

    await expect(transitionApplicationStatus(prisma, application.id, "OFFER")).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );

    const unchanged = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
    expect(unchanged.status).toBe("APPLIED");
    const history = await prisma.statusChange.findMany({ where: { applicationId: application.id } });
    expect(history).toHaveLength(1); // no bogus second entry from the rejected attempt
  });

  it("throws ApplicationNotFoundError for a nonexistent application", async () => {
    await expect(transitionApplicationStatus(prisma, 999999, "SCREENING")).rejects.toBeInstanceOf(
      ApplicationNotFoundError,
    );
  });
});
