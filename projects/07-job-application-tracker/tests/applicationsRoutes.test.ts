import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as listApplications, POST as createApplicationRoute } from "../src/app/api/applications/route";
import { PATCH as updateStatus } from "../src/app/api/applications/[id]/status/route";
import { GET as getAnalytics } from "../src/app/api/analytics/route";
import { GET as getAdminApplications } from "../src/app/api/admin/applications/route";
import { makeAuthenticatedRequest, makeRequest } from "./testUtils";

const prisma = new PrismaClient();

beforeAll(() => {
  process.env.JWT_SECRET ??= "test-secret-do-not-use-in-production";
});

beforeEach(async () => {
  await prisma.reminder.deleteMany();
  await prisma.statusChange.deleteMany();
  await prisma.application.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeUser(role: "MEMBER" | "ADMIN" = "MEMBER") {
  return prisma.user.create({ data: { email: `${role}-${Date.now()}-${Math.random()}@example.com`, role } });
}

describe("GET/POST /api/applications", () => {
  it("requires authentication", async () => {
    const res = await listApplications(makeRequest("http://localhost/api/applications"));
    expect(res.status).toBe(401);
  });

  it("creates an application scoped to the authenticated user", async () => {
    const user = await makeUser();
    const res = await createApplicationRoute(
      await makeAuthenticatedRequest(
        "http://localhost/api/applications",
        { userId: user.id, role: user.role },
        { method: "POST", body: { company: "Acme", role: "Engineer" } },
      ),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.userId).toBe(user.id);
  });

  it("only lists the authenticated user's own applications, not other users'", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    await createApplicationRoute(
      await makeAuthenticatedRequest(
        "http://localhost/api/applications",
        { userId: userA.id, role: userA.role },
        { method: "POST", body: { company: "A-corp", role: "Eng" } },
      ),
    );
    await createApplicationRoute(
      await makeAuthenticatedRequest(
        "http://localhost/api/applications",
        { userId: userB.id, role: userB.role },
        { method: "POST", body: { company: "B-corp", role: "Eng" } },
      ),
    );

    const res = await listApplications(
      await makeAuthenticatedRequest("http://localhost/api/applications", { userId: userA.id, role: userA.role }),
    );
    const applications = await res.json();

    expect(applications).toHaveLength(1);
    expect(applications[0].company).toBe("A-corp");
  });
});

describe("PATCH /api/applications/[id]/status", () => {
  it("transitions status for the owner", async () => {
    const user = await makeUser();
    const createRes = await createApplicationRoute(
      await makeAuthenticatedRequest(
        "http://localhost/api/applications",
        { userId: user.id, role: user.role },
        { method: "POST", body: { company: "Acme", role: "Engineer" } },
      ),
    );
    const application = await createRes.json();

    const res = await updateStatus(
      await makeAuthenticatedRequest(
        `http://localhost/api/applications/${application.id}/status`,
        { userId: user.id, role: user.role },
        { method: "PATCH", body: { status: "SCREENING" } },
      ),
      { params: Promise.resolve({ id: String(application.id) }) },
    );

    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("SCREENING");
  });

  it("returns 422 for an invalid transition", async () => {
    const user = await makeUser();
    const createRes = await createApplicationRoute(
      await makeAuthenticatedRequest(
        "http://localhost/api/applications",
        { userId: user.id, role: user.role },
        { method: "POST", body: { company: "Acme", role: "Engineer" } },
      ),
    );
    const application = await createRes.json();

    const res = await updateStatus(
      await makeAuthenticatedRequest(
        `http://localhost/api/applications/${application.id}/status`,
        { userId: user.id, role: user.role },
        { method: "PATCH", body: { status: "OFFER" } }, // can't skip straight to OFFER
      ),
      { params: Promise.resolve({ id: String(application.id) }) },
    );

    expect(res.status).toBe(422);
  });

  it("returns 404 when a user tries to update someone else's application", async () => {
    const owner = await makeUser();
    const attacker = await makeUser();
    const createRes = await createApplicationRoute(
      await makeAuthenticatedRequest(
        "http://localhost/api/applications",
        { userId: owner.id, role: owner.role },
        { method: "POST", body: { company: "Acme", role: "Engineer" } },
      ),
    );
    const application = await createRes.json();

    const res = await updateStatus(
      await makeAuthenticatedRequest(
        `http://localhost/api/applications/${application.id}/status`,
        { userId: attacker.id, role: attacker.role }, // NOT the owner
        { method: "PATCH", body: { status: "SCREENING" } },
      ),
      { params: Promise.resolve({ id: String(application.id) }) },
    );

    expect(res.status).toBe(404); // not 403 — doesn't reveal the application exists at all
    const unchanged = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
    expect(unchanged.status).toBe("APPLIED"); // attacker's request had no effect
  });
});

describe("GET /api/analytics", () => {
  it("only computes analytics over the authenticated user's own applications", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    await createApplicationRoute(
      await makeAuthenticatedRequest(
        "http://localhost/api/applications",
        { userId: userA.id, role: userA.role },
        { method: "POST", body: { company: "A-corp", role: "Eng" } },
      ),
    );
    await createApplicationRoute(
      await makeAuthenticatedRequest(
        "http://localhost/api/applications",
        { userId: userB.id, role: userB.role },
        { method: "POST", body: { company: "B-corp", role: "Eng" } },
      ),
    );

    const res = await getAnalytics(
      await makeAuthenticatedRequest("http://localhost/api/analytics", { userId: userA.id, role: userA.role }),
    );
    const analytics = await res.json();

    expect(analytics.totalApplications).toBe(1);
  });
});

describe("GET /api/admin/applications (role-based access)", () => {
  it("returns 403 for a MEMBER", async () => {
    const member = await makeUser("MEMBER");
    const res = await getAdminApplications(
      await makeAuthenticatedRequest("http://localhost/api/admin/applications", {
        userId: member.id,
        role: member.role,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns all users' applications for an ADMIN", async () => {
    const admin = await makeUser("ADMIN");
    const member = await makeUser("MEMBER");
    await createApplicationRoute(
      await makeAuthenticatedRequest(
        "http://localhost/api/applications",
        { userId: member.id, role: member.role },
        { method: "POST", body: { company: "Some-corp", role: "Eng" } },
      ),
    );

    const res = await getAdminApplications(
      await makeAuthenticatedRequest("http://localhost/api/admin/applications", {
        userId: admin.id,
        role: admin.role,
      }),
    );

    expect(res.status).toBe(200);
    const applications = await res.json();
    expect(applications).toHaveLength(1);
    expect(applications[0].user.id).toBe(member.id);
  });

  it("requires authentication at all", async () => {
    const res = await getAdminApplications(makeRequest("http://localhost/api/admin/applications"));
    expect(res.status).toBe(401);
  });
});
