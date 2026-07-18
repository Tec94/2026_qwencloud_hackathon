import type { RiskAssessment } from "./models";

const HIGH_RISK_RULES: ReadonlyArray<{ code: string; pattern: RegExp }> = [
  { code: "SELF_HARM_INTENT", pattern: /\b(?:kill|hurt|harm)\s+myself\b/i },
  { code: "SUICIDE_INTENT", pattern: /\b(?:suicide|suicidal|end my life)\b/i },
  { code: "IMMEDIATE_DANGER", pattern: /\b(?:in immediate danger|not safe right now)\b/i },
  { code: "HARM_OTHER_INTENT", pattern: /\b(?:kill|hurt|harm)\s+(?:him|her|them|someone)\b/i },
];

const ELEVATED_RISK_RULES: ReadonlyArray<{ code: string; pattern: RegExp }> = [
  { code: "HOPELESSNESS", pattern: /\b(?:no reason to live|cannot go on|can't go on)\b/i },
  { code: "SAFETY_CONCERN", pattern: /\b(?:feel unsafe|afraid I might)\b/i },
];

export function assessDeterministicRisk(content: string): RiskAssessment {
  const highCodes = HIGH_RISK_RULES.filter(({ pattern }) => pattern.test(content)).map(
    ({ code }) => code,
  );
  if (highCodes.length > 0) {
    return {
      level: "high",
      routeToSupport: true,
      reasonCodes: highCodes,
      source: "rules",
    };
  }

  const elevatedCodes = ELEVATED_RISK_RULES.filter(({ pattern }) => pattern.test(content)).map(
    ({ code }) => code,
  );
  return {
    level: elevatedCodes.length > 0 ? "elevated" : "none",
    routeToSupport: false,
    reasonCodes: elevatedCodes,
    source: "rules",
  };
}

export function combineRiskAssessments(
  rules: RiskAssessment,
  model: RiskAssessment,
): RiskAssessment {
  const rank = { none: 0, elevated: 1, high: 2 } as const;
  const level = rank[rules.level] >= rank[model.level] ? rules.level : model.level;
  return {
    level,
    routeToSupport: rules.routeToSupport || model.routeToSupport || level === "high",
    reasonCodes: [...new Set([...rules.reasonCodes, ...model.reasonCodes])],
    source: "combined",
  };
}

export const HIGH_RISK_SUPPORT_MESSAGE =
  "I’m glad you said something. Threadline cannot provide crisis care. If you may act on these thoughts or are in immediate danger, call local emergency services now. In the U.S. or Canada, call or text 988. Elsewhere, contact your local crisis line or emergency service. If you can, move near a trusted person and tell them you need immediate support.";
