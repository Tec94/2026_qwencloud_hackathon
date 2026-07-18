import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "./models";
import { cosineSimilarity, retrieveMemories, scoreMemory } from "./retrieval";

const now = new Date("2026-07-18T12:00:00.000Z");

function memory(overrides: Partial<MemoryRecord> & Pick<MemoryRecord, "id" | "statement">): MemoryRecord {
  return {
    workspaceId: "workspace",
    patientId: "patient",
    sourceSessionId: "session",
    category: "context",
    importance: 3,
    confidence: 0.8,
    status: "active",
    embedding: [1, 0],
    embeddingModel: "test",
    embeddingDimensions: 2,
    effectiveAt: now,
    supersedesId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("retrieval scoring", () => {
  it("computes cosine similarity without sorting vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBe(-1);
    expect(cosineSimilarity([1], [1, 0])).toBe(0);
  });

  it("uses the locked 65/15/10/10 weighting", () => {
    const score = scoreMemory(memory({ id: "a", statement: "Grounding helps", importance: 5, confidence: 1 }), [1, 0], now);
    expect(score).toMatchObject({ semantic: 1, importance: 1, recency: 1, confidence: 1 });
    expect(score.total).toBeCloseTo(1);
  });

  it("filters inactive records and enforces category diversity and budget", () => {
    const candidates = [
      memory({ id: "1", statement: "Breathing helps", category: "coping_strategy" }),
      memory({ id: "2", statement: "Walking helps", category: "coping_strategy" }),
      memory({ id: "3", statement: "Music helps", category: "coping_strategy" }),
      memory({ id: "4", statement: "Work stress is relevant", category: "context" }),
      memory({ id: "5", statement: "Forgotten detail", status: "forgotten" }),
    ];
    const result = retrieveMemories(candidates, [1, 0], {
      maxMemories: 5,
      maxPerCategory: 2,
      characterBudget: 200,
      now,
    });
    expect(result.map(({ id }) => id)).toEqual(["1", "2", "4"]);
    expect(result.every(({ estimatedCharacters }) => estimatedCharacters > 0)).toBe(true);
  });
});
