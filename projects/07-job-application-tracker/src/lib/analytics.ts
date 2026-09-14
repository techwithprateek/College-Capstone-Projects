import type { ApplicationStatus } from "@prisma/client";

export interface AnalyticsResult {
  totalApplications: number;
  byStatus: Record<ApplicationStatus, number>;
  responseRate: number;
  conversion: {
    appliedToScreening: number | null;
    screeningToInterview: number | null;
    interviewToOffer: number | null;
  };
}

interface ApplicationForAnalytics {
  status: ApplicationStatus;
  statusHistory: { toStatus: ApplicationStatus }[];
}

const EMPTY_BY_STATUS: Record<ApplicationStatus, number> = {
  APPLIED: 0,
  SCREENING: 0,
  INTERVIEW: 0,
  OFFER: 0,
  REJECTED: 0,
};

/**
 * Computed from each application's full status HISTORY, not just its
 * current status — an application currently sitting at OFFER also passed
 * through Screening and Interview, and one that went Interview -> Rejected
 * still reached Interview before being rejected. Counting only current
 * status would undercount every stage a REJECTED application passed
 * through on its way there, which is most of them.
 */
export function computeAnalytics(applications: ApplicationForAnalytics[]): AnalyticsResult {
  const byStatus = { ...EMPTY_BY_STATUS };
  for (const app of applications) byStatus[app.status]++;

  const total = applications.length;
  // The initial StatusChange row is always {toStatus: "APPLIED"}, and
  // APPLIED is never a transition *target* again after that (see
  // statusMachine.ts) — so more than one history row means it moved.
  const responded = applications.filter((app) => app.statusHistory.length > 1).length;

  const reachedCount = (status: ApplicationStatus) =>
    applications.filter((app) => app.statusHistory.some((h) => h.toStatus === status)).length;

  const reachedScreening = reachedCount("SCREENING");
  const reachedInterview = reachedCount("INTERVIEW");
  const reachedOffer = reachedCount("OFFER");

  return {
    totalApplications: total,
    byStatus,
    responseRate: total > 0 ? responded / total : 0,
    conversion: {
      appliedToScreening: total > 0 ? reachedScreening / total : null,
      screeningToInterview: reachedScreening > 0 ? reachedInterview / reachedScreening : null,
      interviewToOffer: reachedInterview > 0 ? reachedOffer / reachedInterview : null,
    },
  };
}
