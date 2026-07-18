import { describe, expect, test } from "vitest";

import { MEMORY_CATEGORIES } from "@/domain/models";

import { extractionCorpus } from "./corpus";
import {
  runSyntheticEvaluation,
  scoreExtractionCase,
  SYNTHETIC_EVALUATION_THRESHOLDS,
} from "./evaluate";

describe("synthetic evaluation corpus", () => {
  test("covers every memory category and adversarial language shapes", () => {
    const categories = new Set(
      extractionCorpus.flatMap((evaluationCase) =>
        evaluationCase.expectedMemories.map((memory) => memory.category),
      ),
    );
    const tags = new Set(extractionCorpus.flatMap((evaluationCase) => evaluationCase.tags));

    expect(categories).toEqual(new Set(MEMORY_CATEGORIES));
    expect(tags.has("correction")).toBe(true);
    expect(tags.has("negation")).toBe(true);
    expect(tags.has("prompt-like-text")).toBe(true);
    expect(extractionCorpus).toHaveLength(20);
    expect(new Set(extractionCorpus.map(({ profileId }) => profileId)).size).toBeGreaterThanOrEqual(5);
  });

  test("counts duplicate predictions one-to-one instead of inflating precision", () => {
    const memory = { category: "goal" as const, statement: "I plan to call Jordan." };

    expect(scoreExtractionCase([memory, memory], [memory])).toEqual({
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 0,
    });
  });

  test("meets the fixed deterministic regression thresholds", () => {
    const result = runSyntheticEvaluation();

    expect(result.benchmark.liveModelAccuracy).toBe(false);
    expect(result.benchmark.syntheticDataOnly).toBe(true);
    expect(result.metrics.extraction.precision).toBeGreaterThanOrEqual(
      SYNTHETIC_EVALUATION_THRESHOLDS.extractionPrecision,
    );
    expect(result.metrics.extraction.recall).toBeGreaterThanOrEqual(
      SYNTHETIC_EVALUATION_THRESHOLDS.extractionRecall,
    );
    expect(result.metrics.retrieval.hitAt5).toBeGreaterThanOrEqual(
      SYNTHETIC_EVALUATION_THRESHOLDS.retrievalHitAt5,
    );
    expect(result.passed).toBe(true);
  });

  test("keeps inactive prompt-adjacent retrieval decoys out of every top five", () => {
    const result = runSyntheticEvaluation();

    for (const evaluationCase of result.cases.retrieval) {
      expect(evaluationCase.selectedMemoryIds).not.toContain("memory-forgotten-decoy");
    }
  });
});
