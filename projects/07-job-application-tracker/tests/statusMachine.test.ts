import { describe, expect, it } from "vitest";
import { assertValidTransition, canTransition, InvalidTransitionError } from "../src/lib/statusMachine";

describe("canTransition", () => {
  it("allows the normal forward pipeline", () => {
    expect(canTransition("APPLIED", "SCREENING")).toBe(true);
    expect(canTransition("SCREENING", "INTERVIEW")).toBe(true);
    expect(canTransition("INTERVIEW", "OFFER")).toBe(true);
  });

  it("allows rejection from any non-terminal stage", () => {
    expect(canTransition("APPLIED", "REJECTED")).toBe(true);
    expect(canTransition("SCREENING", "REJECTED")).toBe(true);
    expect(canTransition("INTERVIEW", "REJECTED")).toBe(true);
    expect(canTransition("OFFER", "REJECTED")).toBe(true); // offer withdrawn/declined
  });

  it("rejects skipping stages", () => {
    expect(canTransition("APPLIED", "INTERVIEW")).toBe(false);
    expect(canTransition("APPLIED", "OFFER")).toBe(false);
    expect(canTransition("SCREENING", "OFFER")).toBe(false);
  });

  it("rejects moving backward", () => {
    expect(canTransition("INTERVIEW", "SCREENING")).toBe(false);
    expect(canTransition("SCREENING", "APPLIED")).toBe(false);
    expect(canTransition("OFFER", "INTERVIEW")).toBe(false);
  });

  it("treats REJECTED as terminal — nothing transitions out of it", () => {
    expect(canTransition("REJECTED", "APPLIED")).toBe(false);
    expect(canTransition("REJECTED", "SCREENING")).toBe(false);
    expect(canTransition("REJECTED", "OFFER")).toBe(false);
  });

  it("rejects a no-op self-transition", () => {
    expect(canTransition("APPLIED", "APPLIED")).toBe(false);
  });
});

describe("assertValidTransition", () => {
  it("does not throw for a valid transition", () => {
    expect(() => assertValidTransition("APPLIED", "SCREENING")).not.toThrow();
  });

  it("throws InvalidTransitionError for an invalid transition", () => {
    expect(() => assertValidTransition("REJECTED", "APPLIED")).toThrow(InvalidTransitionError);
  });
});
