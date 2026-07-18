import { describe, expect, it } from "vitest";
import { assessDeterministicRisk, combineRiskAssessments } from "./risk";

describe("deterministic safety routing", () => {
  it("routes explicit immediate self-harm language to support", () => {
    const assessment = assessDeterministicRisk("I might hurt myself tonight.");
    expect(assessment.level).toBe("high");
    expect(assessment.routeToSupport).toBe(true);
    expect(assessment.reasonCodes).toContain("SELF_HARM_INTENT");
  });

  it("does not escalate ordinary stressful reflection", () => {
    expect(assessDeterministicRisk("Work felt stressful, so I took a walk.").level).toBe("none");
  });

  it("keeps the more conservative result", () => {
    const combined = combineRiskAssessments(
      assessDeterministicRisk("I feel unsafe."),
      { level: "high", routeToSupport: true, reasonCodes: ["MODEL_HIGH"], source: "model" },
    );
    expect(combined.level).toBe("high");
    expect(combined.reasonCodes).toEqual(expect.arrayContaining(["SAFETY_CONCERN", "MODEL_HIGH"]));
  });
});
