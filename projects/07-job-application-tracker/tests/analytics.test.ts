import { describe, expect, it } from "vitest";
import { computeAnalytics } from "../src/lib/analytics";

function app(status: "APPLIED" | "SCREENING" | "INTERVIEW" | "OFFER" | "REJECTED", historyStatuses: string[]) {
  return {
    status,
    statusHistory: historyStatuses.map((toStatus) => ({ toStatus: toStatus as any })),
  };
}

describe("computeAnalytics", () => {
  it("returns zeros for no applications", () => {
    const result = computeAnalytics([]);
    expect(result.totalApplications).toBe(0);
    expect(result.responseRate).toBe(0);
    expect(result.conversion.appliedToScreening).toBeNull();
  });

  it("counts current status distribution", () => {
    const result = computeAnalytics([
      app("APPLIED", ["APPLIED"]),
      app("APPLIED", ["APPLIED"]),
      app("OFFER", ["APPLIED", "SCREENING", "INTERVIEW", "OFFER"]),
    ]);
    expect(result.byStatus.APPLIED).toBe(2);
    expect(result.byStatus.OFFER).toBe(1);
  });

  it("counts response rate based on having moved at all, not current status", () => {
    const result = computeAnalytics([
      app("APPLIED", ["APPLIED"]), // no response yet
      app("REJECTED", ["APPLIED", "REJECTED"]), // got a response (rejection), even though "bad news"
      app("INTERVIEW", ["APPLIED", "SCREENING", "INTERVIEW"]),
    ]);
    expect(result.responseRate).toBeCloseTo(2 / 3);
  });

  it("credits an application that reached OFFER as having also reached earlier stages, even after later rejection", () => {
    // Interviewed, then ultimately rejected — this application DID reach
    // Screening and Interview, which current-status-only counting would miss.
    const result = computeAnalytics([app("REJECTED", ["APPLIED", "SCREENING", "INTERVIEW", "REJECTED"])]);

    expect(result.conversion.appliedToScreening).toBe(1); // 1 of 1 reached screening
    expect(result.conversion.screeningToInterview).toBe(1); // 1 of 1 that reached screening also reached interview
    expect(result.conversion.interviewToOffer).toBe(0); // 0 of 1 that reached interview reached offer
  });

  it("computes conversion rates across a realistic funnel", () => {
    const applications = [
      app("APPLIED", ["APPLIED"]),
      app("APPLIED", ["APPLIED"]),
      app("SCREENING", ["APPLIED", "SCREENING"]),
      app("SCREENING", ["APPLIED", "SCREENING"]),
      app("INTERVIEW", ["APPLIED", "SCREENING", "INTERVIEW"]),
      app("OFFER", ["APPLIED", "SCREENING", "INTERVIEW", "OFFER"]),
    ];
    const result = computeAnalytics(applications);

    expect(result.totalApplications).toBe(6);
    expect(result.conversion.appliedToScreening).toBeCloseTo(4 / 6); // 4 of 6 reached screening
    expect(result.conversion.screeningToInterview).toBeCloseTo(2 / 4); // 2 of 4 that reached screening reached interview
    expect(result.conversion.interviewToOffer).toBeCloseTo(1 / 2); // 1 of 2 that reached interview reached offer
  });
});
