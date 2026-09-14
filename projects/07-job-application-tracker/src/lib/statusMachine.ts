import type { ApplicationStatus } from "@prisma/client";

/**
 * The whole point of modeling status as a state machine instead of a free
 * -text field: an application can't silently jump from REJECTED back to
 * APPLIED, or from APPLIED straight to OFFER, because someone fat-fingered
 * a status update. Every transition is validated against this table.
 */
const VALID_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  APPLIED: ["SCREENING", "REJECTED"],
  SCREENING: ["INTERVIEW", "REJECTED"],
  INTERVIEW: ["OFFER", "REJECTED"],
  OFFER: ["REJECTED"], // an extended offer can still be withdrawn or declined
  REJECTED: [], // terminal — nothing transitions out of rejected
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: ApplicationStatus,
    public readonly to: ApplicationStatus,
  ) {
    super(`Cannot transition from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function assertValidTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}
